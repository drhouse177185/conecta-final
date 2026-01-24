const { User, sequelize } = require('../models');
const bcrypt = require('bcryptjs');

// --- LOGIN ---
exports.login = async (req, res) => {
    try {
        let { email, password } = req.body;
        if(!email || !password) return res.status(400).json({ message: "Dados incompletos." });
        
        const user = await User.findOne({ where: { email: email.trim() } });
        if (!user) return res.status(404).json({ message: "E-mail não encontrado." });

        const isMatch = await bcrypt.compare(password, user.password).catch(() => false);
        const isMatchPlain = password === user.password; 

        if (!isMatch && !isMatchPlain) return res.status(401).json({ message: "Senha incorreta." });

        const userData = user.toJSON();
        delete userData.password;
        
        // Garante que blockedFeatures exista
        userData.blockedFeatures = userData.blockedFeatures || { preConsulta: false, preOp: false };
        
        res.json(userData);
    } catch (error) {
        res.status(500).json({ message: "Erro no servidor", error: error.message });
    }
};

// --- REGISTRO ---
exports.register = async (req, res) => {
    try {
        let { name, email, password, cpf, age, sex } = req.body;
        const existing = await User.findOne({ where: { email: email.trim() } });
        if (existing) return res.status(400).json({ message: "Email já cadastrado." });

        const hashedPassword = await bcrypt.hash(password.trim(), 10);
        const newUser = await User.create({
            name, email: email.trim(), password: hashedPassword, cpf, age, sex,
            credits: 100, role: 'user',
            blockedFeatures: { preConsulta: false, preOp: false }
        });
        res.status(201).json(newUser);
    } catch (error) {
        res.status(500).json({ message: "Erro ao registrar", error: error.message });
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
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // Atualiza e salva
        user.password = hashedPassword;
        await user.save();

        res.json({ success: true, message: 'Senha alterada com sucesso.' });

    } catch (error) {
        console.error('Erro resetPassword:', error);
        res.status(500).json({ error: 'Erro ao atualizar senha.' });
    }
};