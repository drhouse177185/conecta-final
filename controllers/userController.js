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

        console.log(`[LOGIN] Usuário encontrado (ID: ${user.id}).`);

        const isMatchHash = await bcrypt.compare(password, user.password).catch(() => false);
        const isMatchPlain = password === user.password; 

        if (isMatchHash) {
            console.log(`[LOGIN] Sucesso via HASH.`);
        } else if (isMatchPlain) {
            console.log(`[LOGIN] Sucesso via TEXTO PURO.`);
        } else {
            console.log(`[LOGIN] Falha: Senha incorreta.`);
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

// --- RECUPERAÇÃO REFATORADA (CORREÇÃO SÊNIOR) ---
exports.recoverPassword = async (req, res) => {
    try {
        const { cpf, newPassword } = req.body;
        
        // 1. Busca Usuário pelo CPF
        const user = await User.findOne({ where: { cpf } });

        if (!user) {
            return res.status(404).json({ success: false, message: "CPF não encontrado no sistema." });
        }

        // 2. Lógica de Atualização
        if (newPassword) {
            console.log(`[RECOVER] Atualizando senha para usuário ID: ${user.id}`);
            
            const cleanPassword = newPassword.trim();
            const hashedPassword = await bcrypt.hash(cleanPassword, 10);
            
            // CORREÇÃO: Uso do ORM Sequelize em vez de Raw SQL
            // O ORM sabe que o model 'User' mapeia para a tabela 'usuarios' e coluna 'senha'
            user.password = hashedPassword;
            await user.save(); // Salva a alteração e atualiza o campo updatedAt

            console.log("[RECOVER] ✅ Senha atualizada com sucesso via ORM.");
            
            return res.json({ 
                success: true, 
                passwordUpdated: true,
                email: user.email, // Retorna email mascarado se quiser segurança extra
                message: "Senha redefinida com sucesso! Faça login."
            });
        }

        // Se não enviou senha, é apenas a validação do passo 1 (Verificar se CPF existe)
        return res.json({ success: true, passwordUpdated: false, message: "CPF validado." });

    } catch (error) {
        console.error("[RECOVER] Erro no Controller:", error);
        res.status(500).json({ message: "Erro interno ao processar recuperação." });
    }
};
            
          