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

// --- RECUPERAÇÃO BLINDADA COM VERIFICAÇÃO ---
exports.recoverPassword = async (req, res) => {
    try {
        const { cpf, newPassword } = req.body;
        
        // 1. Busca Usuário
        const user = await User.findOne({ where: { cpf } });

        if (!user) {
            return res.status(404).json({ success: false, message: "CPF não encontrado." });
        }

        // 2. Fluxo de Atualização
        if (newPassword) {
            console.log(`[RECOVER] Iniciando atualização para: ${user.email}`);
            
            const cleanPassword = newPassword.trim();
            const hashedPassword = await bcrypt.hash(cleanPassword, 10);
            
            // TENTATIVA 1: SQL Puro com Aspas (Mais seguro para Postgres) e retorno de Metadata
            // Usamos "users" e "password" entre aspas duplas para forçar o reconhecimento das colunas
            const [results, metadata] = await sequelize.query(
                `UPDATE "users" SET "password" = :pass WHERE "email" = :email`,
                {
                    replacements: { 
                        pass: hashedPassword, 
                        email: user.email 
                    }
                }
            );
            
            // Verifica se alguma linha foi realmente afetada
            // No Sequelize com Postgres, metadata.rowCount diz quantas linhas mudaram
            const affected = metadata.rowCount;
            console.log(`[RECOVER] Linhas afetadas no banco: ${affected}`);

            if (affected === 0) {
                console.error("[RECOVER] ERRO CRÍTICO: Banco retornou 0 alterações. Email pode estar divergente.");
                return res.status(500).json({ message: "Erro: Banco de dados não confirmou a alteração." });
            }

            // PROVA REAL: Busca o usuário de novo para ver se a senha mudou mesmo
            const checkUser = await User.findOne({ where: { id: user.id } });
            const isSavedCorrectly = checkUser.password === hashedPassword;
            
            if(isSavedCorrectly) {
                console.log("[RECOVER] ✅ SUCESSO TOTAL: Senha verificada no banco.");
                return res.json({ 
                    success: true, 
                    passwordUpdated: true,
                    email: user.email, 
                    message: "Senha atualizada com sucesso!"
                });
            } else {
                console.error("[RECOVER] ❌ ALERTA: Update rodou mas leitura retornou senha antiga.");
                return res.status(500).json({ message: "Erro de consistência no banco." });
            }
        }

        return res.json({ success: true, passwordUpdated: false });

    } catch (error) {
        console.error("[RECOVER] Erro Fatal:", error);
        res.status(500).json({ message: "Erro no servidor ao salvar senha." });
    }
};