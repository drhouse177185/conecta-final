const { User, sequelize } = require('../models');
const bcrypt = require('bcryptjs');

// Login
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
        
        // Garante que o objeto de bloqueio exista, mesmo se for null no banco
        userData.blocked_features = userData.blocked_features || { preConsulta: false, preOp: false };
        
        res.json(userData);
    } catch (error) {
        res.status(500).json({ message: "Erro no servidor", error: error.message });
    }
};

// Registro
exports.register = async (req, res) => {
    try {
        let { name, email, password, cpf, age, sex } = req.body;
        const existing = await User.findOne({ where: { email: email.trim() } });
        if (existing) return res.status(400).json({ message: "Email já cadastrado." });

        const hashedPassword = await bcrypt.hash(password.trim(), 10);
        const newUser = await User.create({
            name, email: email.trim(), password: hashedPassword, cpf, age, sex,
            credits: 100, role: 'user',
            blocked_features: { preConsulta: false, preOp: false }
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
            user.password = await bcrypt.hash(newPassword.trim(), 10);
            await user.save();
            return res.json({ success: true, message: "Senha redefinida." });
        }
        return res.json({ success: true, message: "CPF validado." });
    } catch (error) {
        res.status(500).json({ message: "Erro interno." });
    }
};

// --- FUNÇÕES ADMIN ---

// Listar Usuários
exports.getAllUsers = async (req, res) => {
    try {
        // Tenta buscar com a coluna blocked_features
        // Se a coluna não existir (antes do reparo), o Sequelize lança erro, então tratamos no frontend ou setup
        const users = await User.findAll({ 
            where: { role: 'user' },
            // IMPORTANTE: 'credits' (banco real) e 'blocked_features'
            attributes: ['id', 'name', 'email', 'cpf', 'age', 'sex', 'credits', 'blocked_features'],
            order: [['name', 'ASC']]
        });
        res.json(users);
    } catch (error) {
        console.error("Erro lista usuários:", error.message);
        res.status(500).json({ error: error.message });
    }
};

// Alternar Bloqueio
exports.toggleBlock = async (req, res) => {
    try {
        const { email, feature, isBlocked } = req.body;
        const user = await User.findOne({ where: { email } });
        if (!user) return res.status(404).json({ message: "Usuário não encontrado" });

        // Parse seguro do JSON
        let currentBlocks = user.blocked_features;
        if (typeof currentBlocks === 'string') {
            try { currentBlocks = JSON.parse(currentBlocks); } catch(e) { currentBlocks = {}; }
        }
        if (!currentBlocks) currentBlocks = { preConsulta: false, preOp: false };

        currentBlocks[feature] = isBlocked;

        // Atualização forçada
        user.blocked_features = currentBlocks;
        user.changed('blocked_features', true); // Avisa o Sequelize que o JSON mudou
        await user.save();

        res.json({ success: true, newStatus: currentBlocks });
    } catch (error) {
        console.error("Erro toggleBlock:", error);
        res.status(500).json({ message: "Erro ao atualizar bloqueio." });
    }
};

// Recarga Admin
exports.adminRecharge = async (req, res) => {
    try {
        const { email, amount } = req.body;
        const user = await User.findOne({ where: { email } });
        if (!user) return res.status(404).json({ message: "Usuário não encontrado" });

        user.credits += parseInt(amount); // Usa 'credits'
        await user.save();

        res.json({ success: true, newCredits: user.credits });
    } catch (error) {
        res.status(500).json({ message: "Erro na recarga" });
    }
};