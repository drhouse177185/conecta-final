const { User } = require('../models');
const bcrypt = require('bcryptjs');

// Login (Mantivemos a lógica robusta que aceita Hash ou Texto Puro)
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Busca usuário pelo email (case insensitive para evitar erro de digitação)
        const user = await User.findOne({ where: { email } });
        
        if (!user) {
            return res.status(404).json({ message: "Usuário não encontrado." });
        }

        // 1. Tenta comparar como Hash (Bcrypt)
        const isMatchHash = await bcrypt.compare(password, user.password).catch(() => false);
        
        // 2. Tenta comparar como Texto Puro (Legado/Fallback)
        const isMatchPlain = password === user.password; 

        if (!isMatchHash && !isMatchPlain) {
            return res.status(401).json({ message: "Senha incorreta." });
        }

        // Retorna o usuário sem a senha
        const userData = user.toJSON();
        delete userData.password;
        res.json(userData);

    } catch (error) {
        console.error("Erro no login:", error);
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

// Listar Todos
exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.findAll({ attributes: { exclude: ['password'] } });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- NOVA LÓGICA DE RECUPERAÇÃO DE SENHA ---
exports.recoverPassword = async (req, res) => {
    try {
        const { cpf, newPassword } = req.body;
        
        // 1. Busca o usuário pelo CPF
        const user = await User.findOne({ where: { cpf } });

        if (!user) {
            return res.status(404).json({ success: false, message: "CPF não encontrado no sistema." });
        }

        // 2. Se enviou a NOVA SENHA, atualiza no banco
        if (newPassword) {
            // Criptografa a nova senha antes de salvar
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            
            // Atualiza o registro
            user.password = hashedPassword;
            await user.save();

            return res.json({ 
                success: true, 
                passwordUpdated: true,
                message: "Senha atualizada com sucesso! Faça login agora."
            });
        }

        // 3. Se enviou SÓ O CPF, apenas confirma que existe (para o Frontend liberar o campo de senha)
        return res.json({ 
            success: true, 
            passwordUpdated: false,
            message: "Usuário localizado. Digite a nova senha." 
        });

    } catch (error) {
        console.error("Erro na recuperação:", error);
        res.status(500).json({ message: "Erro no servidor ao recuperar senha." });
    }
};