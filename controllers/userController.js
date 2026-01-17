const { User, sequelize } = require('../models');
const bcrypt = require('bcryptjs');

// Login
exports.login = async (req, res) => {
    try {
        let { email, password } = req.body;
        
        if(!email || !password) return res.status(400).json({ message: "Dados incompletos." });
        email = email.trim(); 
        
        console.log(`[LOGIN] Tentativa para: ${email}`);

        const user = await User.findOne({ where: { email } });
        
        if (!user) {
            console.log(`[LOGIN] Email não encontrado.`);
            return res.status(404).json({ message: "E-mail não encontrado." });
        }

        const isMatchHash = await bcrypt.compare(password, user.password).catch(() => false);
        const isMatchPlain = password === user.password; 

        if (!isMatchHash && !isMatchPlain) {
            return res.status(401).json({ message: "Senha incorreta." });
        }

        // Prepara dados para retorno (remove senha)
        const userData = user.toJSON();
        delete userData.password;
        
        // Garante que blocked_features venha correto
        if (!userData.blocked_features) {
            userData.blocked_features = { preConsulta: false, preOp: false };
        }

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
            credits: 100, role: 'user',
            blocked_features: { preConsulta: false, preOp: false } // Inicializa limpo
        });

        res.status(201).json(newUser);
    } catch (error) {
        res.status(500).json({ message: "Erro ao registrar", error: error.message });
    }
};

// Recuperação de Senha
exports.recoverPassword = async (req, res) => {
    try {
        const { cpf, newPassword } = req.body;
        const user = await User.findOne({ where: { cpf } });

        if (!user) return res.status(404).json({ success: false, message: "CPF não encontrado." });

        if (newPassword) {
            const hashedPassword = await bcrypt.hash(newPassword.trim(), 10);
            user.password = hashedPassword;
            await user.save();
            return res.json({ success: true, email: user.email, message: "Senha redefinida." });
        }

        return res.json({ success: true, message: "CPF validado." });

    } catch (error) {
        res.status(500).json({ message: "Erro interno." });
    }
};

// --- NOVAS FUNÇÕES PARA O ADMIN ---

// 1. Listar todos os usuários reais do banco
exports.getAllUsers = async (req, res) => {
    try {
        // Busca apenas usuários comuns (não admins) para a lista
        const users = await User.findAll({ 
            where: { role: 'user' },
            attributes: ['id', 'name', 'email', 'cpf', 'age', 'sex', 'creditos', 'blocked_features'],
            order: [['name', 'ASC']]
        });
        res.json(users);
    } catch (error) {
        console.error("Erro ao listar usuários:", error);
        res.status(500).json({ error: error.message });
    }
};

// 2. Alternar Bloqueio (Lógica dos Botões)
exports.toggleBlock = async (req, res) => {
    try {
        const { email, feature, isBlocked } = req.body;
        
        console.log(`[ADMIN] Alterando bloqueio de ${email}: ${feature} -> ${isBlocked}`);

        const user = await User.findOne({ where: { email } });
        if (!user) return res.status(404).json({ message: "Usuário não encontrado" });

        // Manipulação segura do JSONB
        let currentBlocks = user.blocked_features || { preConsulta: false, preOp: false };
        
        // Se vier como string do banco, converte
        if (typeof currentBlocks === 'string') currentBlocks = JSON.parse(currentBlocks);

        // Atualiza a flag específica
        currentBlocks[feature] = isBlocked;

        // Salva no banco (Forçando o Sequelize a detectar mudança no JSON)
        user.blocked_features = currentBlocks;
        user.changed('blocked_features', true);
        await user.save();

        res.json({ success: true, newStatus: currentBlocks });

    } catch (error) {
        console.error("Erro ao bloquear:", error);
        res.status(500).json({ message: "Erro ao atualizar bloqueio" });
    }
};

// 3. Recarga Manual pelo Admin
exports.adminRecharge = async (req, res) => {
    try {
        const { email, amount } = req.body;
        const user = await User.findOne({ where: { email } });
        if (!user) return res.status(404).json({ message: "Usuário não encontrado" });

        user.creditos += parseInt(amount);
        await user.save();

        res.json({ success: true, newCredits: user.creditos });
    } catch (error) {
        res.status(500).json({ message: "Erro na recarga" });
    }
};