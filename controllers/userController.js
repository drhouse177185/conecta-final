const { User, sequelize } = require('../models');
const bcrypt = require('bcryptjs');

// Login
exports.login = async (req, res) => {
    try {
        let { email, password } = req.body;
        
        if(!email || !password) return res.status(400).json({ message: "Dados incompletos." });
        email = email.trim(); 
        
        console.log(`[LOGIN] Tentativa para: ${email}`);

        // Busca usuário
        const user = await User.findOne({ where: { email } });
        
        if (!user) {
            console.log(`[LOGIN] Email não encontrado.`);
            return res.status(404).json({ message: "E-mail não encontrado." });
        }

        console.log(`[LOGIN] Usuário encontrado. ID: ${user.id} | Email: ${user.email}`);

        // Verifica senha
        const isMatchHash = await bcrypt.compare(password, user.password).catch(() => false);
        const isMatchPlain = password === user.password; 

        if (isMatchHash) {
            console.log(`[LOGIN] Sucesso via HASH.`);
        } else if (isMatchPlain) {
            console.log(`[LOGIN] Sucesso via TEXTO PURO.`);
        } else {
            console.log(`[LOGIN] Falha: Senha incorreta. Comparação falhou para hash e plain.`);
            return res.status(401).json({ message: "Senha incorreta." });
        }

        const userData = user.toJSON();
        delete userData.password;
        res.json(userData);

    } catch (error) {
        console.error("Erro Login:", error);
        res.status(500).json({ message: "Erro no servidor", error: error.message });
    }
};

// Registro
exports.register = async (req, res) => {
    try {
        let { name, email, password, cpf, age, sex } = req.body;
        email = email.trim();

        const existing = await User.findOne({ where: { email } });
        if (existing) return res.status(400).json({ message: "Email já cadastrado." });

        const hashedPassword = await bcrypt.hash(password.trim(), 10);

        const newUser = await User.create({
            name, email, password: hashedPassword, cpf, age, sex,
            credits: 100, role: 'user'
        });

        res.status(201).json(newUser);
    } catch (error) {
        res.status(500).json({ message: "Erro ao registrar", error: error.message });
    }
};

exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.findAll({ attributes: { exclude: ['password'] } });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- CORREÇÃO: Recuperação via EMAIL (Para evitar confusão de IDs) ---
exports.recoverPassword = async (req, res) => {
    try {
        const { cpf, newPassword } = req.body;
        console.log(`[RECOVER] Iniciando para CPF: ${cpf}`);
        
        // 1. Busca o usuário
        const user = await User.findOne({ where: { cpf } });

        if (!user) {
            return res.status(404).json({ success: false, message: "CPF não encontrado." });
        }

        // 2. Se tiver nova senha, força o UPDATE VIA SQL PURO USANDO EMAIL
        if (newPassword) {
            console.log(`[RECOVER] Usuário encontrado: ${user.email} (ID: ${user.id}). Gerando hash...`);
            
            const cleanPassword = newPassword.trim();
            const hashedPassword = await bcrypt.hash(cleanPassword, 10);
            
            // MUDANÇA CRÍTICA: Atualiza onde o EMAIL é igual, não o ID.
            // Isso garante que estamos atualizando exatamente a conta que o Sequelize encontrou.
            await sequelize.query(
                `UPDATE users SET password = :pass WHERE email = :email`,
                {
                    replacements: { 
                        pass: hashedPassword, 
                        email: user.email 
                    },
                    type: sequelize.QueryTypes.UPDATE
                }
            );
            
            console.log(`[RECOVER] SQL UPDATE executado para EMAIL: ${user.email}`);

            return res.json({ 
                success: true, 
                passwordUpdated: true,
                email: user.email, // Retorna email para o front preencher o login
                message: "Senha atualizada com sucesso!"
            });
        }

        return res.json({ success: true, passwordUpdated: false });

    } catch (error) {
        console.error("[RECOVER] Erro Fatal:", error);
        res.status(500).json({ message: "Erro no servidor ao salvar senha." });
    }
};