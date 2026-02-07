const { User, sequelize } = require('../models');
const { Op, QueryTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendWelcomeEmail, sendAccountActivatedEmail } = require('../services/emailService');

// --- LOGIN ---
exports.login = async (req, res) => {
    try {
        let { email, password } = req.body;
        if(!email || !password) return res.status(400).json({ message: "Dados incompletos." });

        // Busca case-insensitive (ignora maiúsculas/minúsculas)
        const user = await User.findOne({
            where: sequelize.where(
                sequelize.fn('LOWER', sequelize.col('email')),
                email.trim().toLowerCase()
            )
        });
        if (!user) return res.status(404).json({ message: "E-mail não encontrado." });

        const isMatch = await bcrypt.compare(password, user.password).catch(() => false);
        const isMatchPlain = password === user.password;

        if (!isMatch && !isMatchPlain) return res.status(401).json({ message: "Senha incorreta." });

        const userData = user.toJSON();
        delete userData.password;

        // Garante que blockedFeatures exista
        userData.blockedFeatures = userData.blockedFeatures || { preConsulta: false, preOp: false };

        // Buscar status de verificação de email do banco (para compatibilidade)
        try {
            const [emailStatus] = await sequelize.query(`
                SELECT email_verified, email_verified_at FROM users WHERE id = :userId
            `, {
                replacements: { userId: user.id },
                type: QueryTypes.SELECT
            });

            if (emailStatus) {
                userData.emailVerified = emailStatus.email_verified || false;
                userData.emailVerifiedAt = emailStatus.email_verified_at;
            }
        } catch (e) {
            // Se a coluna não existir ainda, assume não verificado
            userData.emailVerified = false;
        }

        res.json(userData);
    } catch (error) {
        res.status(500).json({ message: "Erro no servidor", error: error.message });
    }
};

// --- REGISTRO ---
exports.register = async (req, res) => {
    try {
        let { name, email, password, cpf, age, sex, phone } = req.body;
        // Verifica se já existe (case-insensitive)
        const existing = await User.findOne({
            where: sequelize.where(
                sequelize.fn('LOWER', sequelize.col('email')),
                email.trim().toLowerCase()
            )
        });
        if (existing) return res.status(400).json({ message: "Email já cadastrado." });

        const hashedPassword = await bcrypt.hash(password.trim(), 10);
        const newUser = await User.create({
            name, email: email.trim(), password: hashedPassword, cpf, age, sex, phone,
            credits: 100, role: 'user',
            blockedFeatures: { preConsulta: false, preOp: false }
        });

        // === NOVO: Gerar token de confirmação de email ===
        try {
            const confirmationToken = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

            // Salvar token no banco
            await sequelize.query(`
                INSERT INTO email_verifications (user_id, token, expires_at)
                VALUES (:userId, :token, :expiresAt)
            `, {
                replacements: {
                    userId: newUser.id,
                    token: confirmationToken,
                    expiresAt: expiresAt
                },
                type: QueryTypes.INSERT
            });

            // Determinar URL base (produção ou desenvolvimento)
            const baseUrl = process.env.NODE_ENV === 'production'
                ? `https://${req.get('host')}`
                : `http://${req.get('host')}`;

            // Enviar email de boas-vindas
            await sendWelcomeEmail(email.trim(), name, confirmationToken, baseUrl);
            console.log(`✅ Email de confirmação enviado para: ${email}`);

        } catch (emailError) {
            // Se falhar o envio do email, não bloqueia o registro
            console.error('⚠️ Erro ao enviar email de confirmação:', emailError.message);
        }

        // Retorna o usuário (sem a senha)
        const userData = newUser.toJSON();
        delete userData.password;

        res.status(201).json({
            ...userData,
            message: "Conta criada! Verifique seu email para ativar sua conta.",
            emailSent: true
        });
    } catch (error) {
        res.status(500).json({ message: "Erro ao registrar", error: error.message });
    }
};

// --- RECUPERAÇÃO DE SENHA ---
exports.recoverPassword = async (req, res) => {
    try {
        const { cpf, newPassword } = req.body;
        const user = await User.findOne({ where: { cpf } });
        if (!user) return res.status(404).json({ success: false, message: "CPF não encontrado." });

        if (newPassword) {
            const hashedPassword = await bcrypt.hash(newPassword.trim(), 10);
            user.password = hashedPassword;
            user.changed('password', true); // Força o Sequelize a reconhecer a mudança
            await user.save();
            console.log(`✅ Senha alterada via recoverPassword para CPF: ${cpf}`);
            return res.json({ success: true, email: user.email, message: "Senha redefinida." });
        }
        return res.json({ success: true, message: "CPF validado." });
    } catch (error) {
        console.error('❌ Erro recoverPassword:', error);
        res.status(500).json({ message: "Erro interno." });
    }
};

// =============================================================================
// ÁREA DO ADMIN (Funções que faltavam)
// =============================================================================

// 1. Listar Usuários (Com estrutura correta para o Admin)
exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.findAll({ 
            where: { role: 'user' },
            attributes: ['id', 'name', 'email', 'cpf', 'age', 'sex', 'credits', 'blockedFeatures'],
            order: [['name', 'ASC']]
        });
        res.json(users);
    } catch (error) {
        console.error("Erro lista usuários:", error);
        res.status(500).json({ error: error.message });
    }
};

// 2. Bloquear/Desbloquear Funcionalidades
exports.toggleBlock = async (req, res) => {
    try {
        const { email, feature, isBlocked } = req.body;
        const user = await User.findOne({ where: { email } });
        if (!user) return res.status(404).json({ message: "Usuário não encontrado" });

        let currentBlocks = user.blockedFeatures;
        if (typeof currentBlocks === 'string') {
            try { currentBlocks = JSON.parse(currentBlocks); } catch(e) { currentBlocks = {}; }
        }
        if (!currentBlocks) currentBlocks = { preConsulta: false, preOp: false };

        currentBlocks[feature] = isBlocked;

        user.blockedFeatures = currentBlocks;
        user.changed('blockedFeatures', true);
        await user.save();

        res.json({ success: true, newStatus: currentBlocks });
    } catch (error) {
        res.status(500).json({ message: "Erro ao atualizar bloqueio." });
    }
};

// 3. Recarga Manual pelo Admin
exports.adminRecharge = async (req, res) => {
    try {
        const { email, amount } = req.body;
        const user = await User.findOne({ where: { email } });
        if (!user) return res.status(404).json({ message: "Usuário não encontrado" });

        user.credits += parseInt(amount);
        await user.save();

        res.json({ success: true, newCredits: user.credits });
    } catch (error) {
        res.status(500).json({ message: "Erro na recarga" });
    }
};
// ... (mantenha os imports e códigos existentes)

// 1. Verifica se o CPF existe para iniciar a recuperação
exports.verifyCpf = async (req, res) => {
    try {
        const { cpf } = req.body;
        
        // Busca usuário pelo CPF
        const user = await User.findOne({ where: { cpf } });
        
        if (!user) {
            return res.status(404).json({ error: 'CPF não encontrado no sistema.' });
        }

        // Retorna sucesso (não retorne dados sensíveis)
        res.json({ 
            success: true, 
            message: 'Usuário localizado.', 
            name: user.name // Opcional: para mostrar "Olá Fulano"
        });

    } catch (error) {
        console.error('Erro verifyCpf:', error);
        res.status(500).json({ error: 'Erro interno ao validar CPF.' });
    }
};

// 2. Redefine a senha baseada no CPF
exports.resetPassword = async (req, res) => {
    try {
        const { cpf, newPassword } = req.body;

        if (!newPassword || newPassword.length < 3) {
            return res.status(400).json({ error: 'Senha inválida.' });
        }

        const user = await User.findOne({ where: { cpf } });

        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        // Hash da nova senha (Segurança)
        const hashedPassword = await bcrypt.hash(newPassword.trim(), 10);

        // Atualiza e salva - CORREÇÃO: Marca explicitamente o campo como alterado
        user.password = hashedPassword;
        user.changed('password', true); // Força o Sequelize a reconhecer a mudança

        await user.save();

        console.log(`✅ Senha alterada com sucesso para CPF: ${cpf}`);
        res.json({ success: true, message: 'Senha alterada com sucesso.' });

    } catch (error) {
        console.error('❌ Erro resetPassword:', error);
        res.status(500).json({ error: 'Erro ao atualizar senha.' });
    }
};

// =============================================================================
// CONFIRMAÇÃO DE EMAIL E LGPD
// =============================================================================

// Confirma email e salva consentimento LGPD
exports.confirmEmail = async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.status(400).send(getErrorPage('Token não fornecido.'));
        }

        // Buscar token válido
        const [tokenData] = await sequelize.query(`
            SELECT ev.*, u.name, u.email
            FROM email_verifications ev
            JOIN users u ON ev.user_id = u.id
            WHERE ev.token = :token
              AND ev.used_at IS NULL
              AND ev.expires_at > NOW()
        `, {
            replacements: { token },
            type: QueryTypes.SELECT
        });

        if (!tokenData) {
            return res.status(400).send(getErrorPage('Link inválido ou expirado. Solicite um novo email de confirmação.'));
        }

        // Marcar token como usado
        await sequelize.query(`
            UPDATE email_verifications
            SET used_at = NOW()
            WHERE token = :token
        `, {
            replacements: { token },
            type: QueryTypes.UPDATE
        });

        // Marcar email como verificado
        await sequelize.query(`
            UPDATE users
            SET email_verified = true, email_verified_at = NOW()
            WHERE id = :userId
        `, {
            replacements: { userId: tokenData.user_id },
            type: QueryTypes.UPDATE
        });

        // Salvar consentimento LGPD
        const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
        const userAgent = req.headers['user-agent'] || '';

        await sequelize.query(`
            INSERT INTO lgpd_consents (user_id, consent_version, ip_address, user_agent, consent_data)
            VALUES (:userId, '1.0', :ipAddress, :userAgent, :consentData)
        `, {
            replacements: {
                userId: tokenData.user_id,
                ipAddress: ipAddress,
                userAgent: userAgent,
                consentData: JSON.stringify({
                    dados_identificacao: true,
                    dados_contato: true,
                    dados_navegacao: true,
                    dados_geolocalizacao: true,
                    dados_saude: true,
                    download_pdf: true,
                    compartilhamento_parceiros: true,
                    analise_ia: true,
                    contato_emergencia: true,
                    aceite_termos: true,
                    data_aceite: new Date().toISOString()
                })
            },
            type: QueryTypes.INSERT
        });

        console.log(`✅ Email confirmado e LGPD aceita - User: ${tokenData.email}`);

        // Enviar email de conta ativada
        try {
            await sendAccountActivatedEmail(tokenData.email, tokenData.name);
        } catch (emailError) {
            console.error('⚠️ Erro ao enviar email de ativação:', emailError.message);
        }

        // Retornar página de sucesso
        res.send(getSuccessPage(tokenData.name));

    } catch (error) {
        console.error('❌ Erro ao confirmar email:', error);
        res.status(500).send(getErrorPage('Erro interno. Tente novamente mais tarde.'));
    }
};

// Reenviar email de confirmação
exports.resendConfirmationEmail = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email é obrigatório.' });
        }

        // Buscar usuário
        const user = await User.findOne({
            where: sequelize.where(
                sequelize.fn('LOWER', sequelize.col('email')),
                email.trim().toLowerCase()
            )
        });

        if (!user) {
            return res.status(404).json({ error: 'Email não encontrado.' });
        }

        // Verificar se já está confirmado
        const [userData] = await sequelize.query(`
            SELECT email_verified FROM users WHERE id = :userId
        `, {
            replacements: { userId: user.id },
            type: QueryTypes.SELECT
        });

        if (userData && userData.email_verified) {
            return res.status(400).json({ error: 'Este email já foi confirmado.' });
        }

        // Invalidar tokens anteriores
        await sequelize.query(`
            UPDATE email_verifications
            SET used_at = NOW()
            WHERE user_id = :userId AND used_at IS NULL
        `, {
            replacements: { userId: user.id },
            type: QueryTypes.UPDATE
        });

        // Gerar novo token
        const confirmationToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await sequelize.query(`
            INSERT INTO email_verifications (user_id, token, expires_at)
            VALUES (:userId, :token, :expiresAt)
        `, {
            replacements: {
                userId: user.id,
                token: confirmationToken,
                expiresAt: expiresAt
            },
            type: QueryTypes.INSERT
        });

        // Enviar email
        const baseUrl = process.env.NODE_ENV === 'production'
            ? `https://${req.get('host')}`
            : `http://${req.get('host')}`;

        await sendWelcomeEmail(email.trim(), user.name, confirmationToken, baseUrl);

        res.json({ success: true, message: 'Email de confirmação reenviado.' });

    } catch (error) {
        console.error('❌ Erro ao reenviar email:', error);
        res.status(500).json({ error: 'Erro ao reenviar email.' });
    }
};

// Verificar status de confirmação de email
exports.checkEmailVerification = async (req, res) => {
    try {
        const { userId } = req.params;

        const [userData] = await sequelize.query(`
            SELECT email_verified, email_verified_at FROM users WHERE id = :userId
        `, {
            replacements: { userId },
            type: QueryTypes.SELECT
        });

        if (!userData) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        res.json({
            success: true,
            emailVerified: userData.email_verified || false,
            verifiedAt: userData.email_verified_at
        });

    } catch (error) {
        console.error('❌ Erro ao verificar status de email:', error);
        res.status(500).json({ error: 'Erro interno.' });
    }
};

// =============================================================================
// TEMPLATES HTML PARA PÁGINAS DE CONFIRMAÇÃO
// =============================================================================

function getSuccessPage(userName) {
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email Confirmado - Conecta Saúde</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1);
            max-width: 500px;
            width: 100%;
            text-align: center;
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            padding: 40px 30px;
        }
        .header h1 {
            color: white;
            font-size: 28px;
            margin-bottom: 10px;
        }
        .header .icon {
            font-size: 60px;
            margin-bottom: 15px;
        }
        .content {
            padding: 40px 30px;
        }
        .content h2 {
            color: #059669;
            font-size: 24px;
            margin-bottom: 15px;
        }
        .content p {
            color: #475569;
            font-size: 16px;
            line-height: 1.6;
            margin-bottom: 20px;
        }
        .lgpd-box {
            background: #f0fdf4;
            border: 1px solid #86efac;
            border-radius: 10px;
            padding: 15px;
            margin: 20px 0;
            text-align: left;
        }
        .lgpd-box h3 {
            color: #166534;
            font-size: 14px;
            margin-bottom: 8px;
        }
        .lgpd-box p {
            color: #166534;
            font-size: 13px;
            margin: 0;
        }
        .btn {
            display: inline-block;
            background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
            color: white;
            text-decoration: none;
            padding: 15px 40px;
            border-radius: 10px;
            font-size: 16px;
            font-weight: bold;
            margin-top: 20px;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(14, 165, 233, 0.3);
        }
        .footer {
            background: #f8fafc;
            padding: 20px;
            color: #94a3b8;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="icon">✅</div>
            <h1>Email Confirmado!</h1>
        </div>
        <div class="content">
            <h2>Parabéns, ${userName}! 🎉</h2>
            <p>Sua conta no <strong>Conecta Saúde</strong> foi ativada com sucesso!</p>
            <p>Você já pode fazer login e aproveitar todos os recursos da plataforma.</p>

            <div class="lgpd-box">
                <h3>📋 Consentimento LGPD Registrado</h3>
                <p>Seu aceite do Termo de Consentimento para Tratamento de Dados Pessoais foi registrado com sucesso.</p>
            </div>

            <a href="/" class="btn">🚀 Acessar o App</a>
        </div>
        <div class="footer">
            © ${new Date().getFullYear()} Conecta Saúde. Todos os direitos reservados.
        </div>
    </div>
</body>
</html>
`;
}

function getErrorPage(message) {
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Erro - Conecta Saúde</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1);
            max-width: 500px;
            width: 100%;
            text-align: center;
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            padding: 40px 30px;
        }
        .header h1 {
            color: white;
            font-size: 28px;
            margin-bottom: 10px;
        }
        .header .icon {
            font-size: 60px;
            margin-bottom: 15px;
        }
        .content {
            padding: 40px 30px;
        }
        .content h2 {
            color: #dc2626;
            font-size: 22px;
            margin-bottom: 15px;
        }
        .content p {
            color: #475569;
            font-size: 16px;
            line-height: 1.6;
            margin-bottom: 20px;
        }
        .btn {
            display: inline-block;
            background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
            color: white;
            text-decoration: none;
            padding: 15px 40px;
            border-radius: 10px;
            font-size: 16px;
            font-weight: bold;
            margin-top: 10px;
        }
        .footer {
            background: #f8fafc;
            padding: 20px;
            color: #94a3b8;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="icon">❌</div>
            <h1>Ops!</h1>
        </div>
        <div class="content">
            <h2>Algo deu errado</h2>
            <p>${message}</p>
            <a href="/" class="btn">Voltar ao App</a>
        </div>
        <div class="footer">
            © ${new Date().getFullYear()} Conecta Saúde. Todos os direitos reservados.
        </div>
    </div>
</body>
</html>
`;
}