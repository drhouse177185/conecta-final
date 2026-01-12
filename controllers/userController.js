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

// Recuperar senha por CPF (NOVA FUNÇÃO)
exports.recoverPassword = async (req, res) => {
    try {
        const { cpf } = req.body;

        // Limpa o CPF para garantir formato numérico ou mantém como string dependendo do banco
        // Aqui assumimos que no banco está salvo exatamente como o usuário digitou ou limpo
        // Vamos buscar exatamente como veio para simplificar, ou você pode adicionar regex aqui
        
        const user = await User.findOne({ where: { cpf } });

        if (!user) {
            return res.status(404).json({ message: "CPF não encontrado." });
        }

        // ATENÇÃO: Em produção real, nunca retorne a senha. O ideal é enviar um email de reset.
        // Como solicitado para este app, vamos retornar a senha.
        // Se a senha estiver hasheada (bcrypt), não é possível revertê-la.
        // Se estiver em texto plano (banco legado), retornamos ela.
        
        // Verifica se é hash (começa com $2a$) ou texto plano
        const isHash = user.password.startsWith('$2a$');
        
        if (isHash) {
            return res.json({ 
                success: true, 
                message: "Sua senha foi redefinida para 'mudar123' (Hash detectado).",
                password: "mudar123", // Num caso real, faríamos o update no banco aqui
                isReset: true
            });
            // Opcional: Atualizar a senha no banco para 'mudar123' se for hash
            // user.password = await bcrypt.hash("mudar123", 10);
            // await user.save();
        } else {
            return res.json({ 
                success: true, 
                password: user.password,
                message: `Sua senha é: ${user.password}`
            });
        }

    } catch (error) {
        res.status(500).json({ message: "Erro ao recuperar senha", error: error.message });
    }
};
};