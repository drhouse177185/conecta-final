const { User } = require('../models');
const bcrypt = require('bcryptjs');

// Login
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const user = await User.findOne({ where: { email } });
        if (!user) return res.status(404).json({ message: "Usuário não encontrado." });

        // Verifica senha (compatível com texto plano antigo ou hash novo)
        const isMatchHash = await bcrypt.compare(password, user.password).catch(() => false);
        const isMatchPlain = password === user.password; 

        if (!isMatchHash && !isMatchPlain) {
            return res.status(401).json({ message: "Senha incorreta." });
        }

        // Retorna o usuário sem a senha
        const userData = user.toJSON();
        delete userData.password;
        res.json(userData);

    } catch (error) {
        res.status(500).json({ message: "Erro interno", error: error.message });
    }
};

// Registro
exports.register = async (req, res) => {
    try {
        const { name, email, password, cpf, age, sex } = req.body;

        const existing = await User.findOne({ where: { email } });
        if (existing) return res.status(400).json({ message: "Email já cadastrado." });

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await User.create({
            name, email, password: hashedPassword, cpf, age, sex,
            credits: 100, role: 'user'
        });

        res.status(201).json(newUser);
    } catch (error) {
        res.status(500).json({ message: "Erro ao registrar", error: error.message });
    }
};

// Listar Usuários (Para o Admin)
exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.findAll({ attributes: { exclude: ['password'] } });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};