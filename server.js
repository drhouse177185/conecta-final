// NOME DO ARQUIVO: server.js
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// --- PASSO CRÍTICO: CARREGAMENTO DO .ENV ---
// Tenta carregar o arquivo .env
const result = require('dotenv').config();

console.log("=========================================");
console.log("🔍 DIAGNÓSTICO DE INICIALIZAÇÃO");
console.log("=========================================");

// 1. Verifica se o dotenv encontrou o arquivo
if (result.error) {
    console.log("❌ ERRO CRÍTICO: O arquivo .env NÃO foi encontrado!");
    console.log("   Verifique se o nome é '.env' e não '.env.txt'");
    console.log("   Local procurado:", path.resolve(process.cwd(), '.env'));
} else {
    console.log("✅ Arquivo .env carregado com sucesso.");
}

// 2. Verifica as variáveis essenciais
const dbHost = process.env.DB_HOST;
const dbUser = process.env.DB_USER;
console.log(`📊 DB_HOST Lido: ${dbHost ? dbHost : 'INDEFINIDO (Usando localhost)'}`);
console.log(`👤 DB_USER Lido: ${dbUser ? dbUser : 'INDEFINIDO'}`);

// Se as variáveis estiverem vazias, forçamos o erro para não perder tempo
if (!dbHost) {
    console.log("\n⚠️  ATENÇÃO: As variáveis estão vazias. O servidor vai falhar.");
    console.log("   Pare o servidor (Ctrl+C), corrija o .env e tente de novo.");
}
console.log("=========================================\n");

const app = express();
const port = process.env.PORT || 3000;

// Configuração do Banco de Dados
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false } // Obrigatório para Render
});

// Configuração do E-mail
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_PORT == '465', 
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

transporter.verify((error) => {
    if (error) {
        // Não mostramos erro de e-mail se o .env nem foi carregado, para não confundir
        if(process.env.SMTP_HOST) console.error("⚠️  Erro E-mail:", error.message);
    } else {
        console.log("📧 E-mail pronto.");
    }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

async function initDB() {
    try {
        if (!process.env.DB_HOST) throw new Error("Sem DB_HOST definido no .env");
        
        const clientDb = await pool.connect();
        console.log("🗄️  Conectado ao PostgreSQL (Render) com sucesso!");
        
        await clientDb.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                cpf VARCHAR(14) UNIQUE,
                age INTEGER,
                sex CHAR(1),
                role VARCHAR(20) DEFAULT 'user',
                credits INTEGER DEFAULT 100,
                is_verified BOOLEAN DEFAULT FALSE,
                verification_token VARCHAR(255),
                claimed_free_bonus BOOLEAN DEFAULT FALSE,
                last_recharge_date DATE DEFAULT CURRENT_DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Tabela 'users' verificada/criada.");
        clientDb.release();
    } catch (err) {
        console.error("❌ Falha no Banco de Dados:", err.message);
    }
}

initDB();

app.post('/auth/login', async (req, res) => {
    /* (Mantenha sua lógica de login aqui se já a tiver salvo, 
        ou use a versão completa dos passos anteriores) */
    res.status(501).json({error: "Rota em manutenção para teste de conexão"});
});

app.listen(port, () => {
    console.log(`🚀 Servidor rodando na porta ${port}`);
});

// --- ROTAS ---

app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase().trim()]);
        if (result.rows.length === 0) return res.status(400).json({ error: "E-mail não encontrado." });
        
        const user = result.rows[0];

        if (!user.is_verified) {
            return res.status(401).json({ error: "Conta não ativada. Verifique seu e-mail." });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (validPassword) {
            delete user.password_hash;
            res.json({ user });
        } else {
            res.status(403).json({ error: "Senha incorreta." });
        }
    } catch (err) {
        res.status(500).json({ error: "Erro interno no servidor." });
    }
});

app.post('/auth/register', async (req, res) => {
    const { name, email, password, cpf, age, sex } = req.body;
    try {
        const password_hash = await bcrypt.hash(password, 10);
        const verificationToken = crypto.randomBytes(32).toString('hex');

        await pool.query(
            `INSERT INTO users (name, email, password_hash, cpf, age, sex, credits, verification_token, is_verified) 
             VALUES ($1, $2, $3, $4, $5, $6, 100, $7, false)`,
            [name, email.toLowerCase().trim(), password_hash, cpf, age, sex, verificationToken]
        );

        const activationLink = `${process.env.APP_URL || 'http://localhost:3000'}/auth/verify/${verificationToken}`;

        const mailOptions = {
            from: `"Conecta Saúde" <${process.env.SMTP_USER}>`,
            to: email,
            subject: 'Ative sua conta - Conecta Saúde',
            html: `<h2>Olá, ${name}!</h2><p>Clique no link abaixo para ativar sua conta:</p><a href="${activationLink}">${activationLink}</a>`
        };

        transporter.sendMail(mailOptions).catch(e => console.error("Falha ao enviar e-mail:", e.message));

        res.json({ message: "Cadastro realizado! Verifique seu e-mail." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erro ao cadastrar. E-mail ou CPF já existem." });
    }
});

app.get('/auth/verify/:token', async (req, res) => {
    const { token } = req.params;
    try {
        const result = await pool.query(
            "UPDATE users SET is_verified = true, verification_token = NULL WHERE verification_token = $1 RETURNING name",
            [token]
        );
        if (result.rows.length === 0) return res.send("Link inválido ou já utilizado.");
        res.send(`<h1>Sucesso!</h1><p>Conta de ${result.rows[0].name} ativada. Pode fechar esta aba e fazer login.</p>`);
    } catch (err) {
        res.status(500).send("Erro na verificação.");
    }
});

app.post('/ai/generate', async (req, res) => {
    const { prompt, cost, isJson, userId } = req.body;
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!userId) return res.status(401).json({ error: "ID de usuário ausente." });

    try {
        const userRes = await pool.query("SELECT credits, role FROM users WHERE id = $1", [userId]);
        const user = userRes.rows[0];
        
        if (!user) return res.status(404).json({ error: "Usuário não encontrado." });
        if (user.role !== 'admin' && user.credits < cost) return res.status(402).json({ error: "Créditos insuficientes." });

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: isJson ? prompt + "\nResponda APENAS JSON puro, sem markdown." : prompt }] }] })
        });

        const data = await response.json();
        const txt = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!txt) throw new Error("Resposta da IA vazia");

        let result = txt;
        if (isJson) {
            const cleanJson = txt.replace(/```json/g, '').replace(/```/g, '').trim();
            result = JSON.parse(cleanJson);
        }

        if (user.role !== 'admin') {
            await pool.query("UPDATE users SET credits = credits - $1 WHERE id = $2", [cost, userId]);
        }

        res.json({ 
            result, 
            new_credits: user.role === 'admin' ? user.credits : user.credits - cost 
        });
    } catch (err) {
        console.error("Erro na IA:", err.message);
        res.status(500).json({ error: "Erro ao processar solicitação de IA." });
    }
});

app.listen(port, () => {
    console.log(`🚀 Servidor rodando na porta ${port}`);
});