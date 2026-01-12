const { User } = require('../models');
const bcrypt = require('bcryptjs');

// Login
exports.login = async (req, res) => {
    try {
        let { email, password } = req.body;
        
        if(!email || !password) return res.status(400).json({ message: "Dados incompletos." });
        email = email.trim(); 
        password = password.trim();

        const user = await User.findOne({ where: { email } });
        
        if (!user) return res.status(404).json({ message: "E-mail não encontrado." });

        const isMatchHash = await bcrypt.compare(password, user.password).catch(() => false);
        const isMatchPlain = password === user.password; 

        if (!isMatchHash && !isMatchPlain) {
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

// --- CORREÇÃO: Recuperação de Senha com UPDATE Direto ---
exports.recoverPassword = async (req, res) => {
    try {
        const { cpf, newPassword } = req.body;
        console.log(`[Recover] Tentativa de reset para CPF: ${cpf}`);
        
        // 1. Busca o usuário
        const user = await User.findOne({ where: { cpf } });

        if (!user) {
            console.log(`[Recover] Falha: CPF ${cpf} não encontrado.`);
            return res.status(404).json({ success: false, message: "CPF não encontrado." });
        }

        // 2. Se tiver nova senha, força o UPDATE
        if (newPassword) {
            console.log(`[Recover] Usuário encontrado (ID: ${user.id}). Gerando hash...`);
            
            const cleanPassword = newPassword.trim();
            const hashedPassword = await bcrypt.hash(cleanPassword, 10);
            
            // MUDANÇA AQUI: Usamos User.update em vez de user.save()
            // Isso garante que o comando SQL UPDATE seja enviado ao PostgreSQL
            await User.update(
                { password: hashedPassword },
                { where: { id: user.id } }
            );
            
            console.log(`[Recover] Sucesso! Senha atualizada no banco.`);

            return res.json({ 
                success: true, 
                passwordUpdated: true,
                email: user.email, 
                message: "Senha atualizada com sucesso!"
            });
        }

        // Apenas validação de CPF (Passo 1 do Frontend)
        return res.json({ success: true, passwordUpdated: false });

    } catch (error) {
        console.error("Erro Recuperação:", error);
        res.status(500).json({ message: "Erro no servidor." });
    }
};