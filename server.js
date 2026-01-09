// NOME DO ARQUIVO: server.js
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const path = require('path');

// Carrega variáveis (apenas localmente)
const dotenvResult = require('dotenv').config();

console.log("\n=========================================");
console.log("🔍 INICIANDO SERVIDOR CONECTA SAÚDE");
console.log("=========================================");

const app = express();
const port = process.env.PORT || 3000;

// 1. Configuração Estática (Importante para o site aparecer)
app.use(express.static(__dirname));
app.use(express.json({ limit: '50mb' }));
app.use(cors());

// 2. Rota Principal: Entrega o HTML quando acessar o site
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Configuração do Banco de Dados
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false }
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

// Inicialização do Banco (Cria todas as tabelas do schema.sql)
async function initDB() {
    try {
        if (!process.env.DB_HOST) return;
        const clientDb = await pool.connect();
        console.log("🗄️  Banco de Dados Conectado!");

        // Tabela de Usuários
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

        // Tabela de Transações (Restaurada)
        await clientDb.query(`
            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                amount INTEGER NOT NULL,
                description VARCHAR(255),
                type VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Tabela de Registros Médicos (Restaurada)
        await clientDb.query(`
            CREATE TABLE IF NOT EXISTS medical_records (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                type VARCHAR(50),
                content JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("✅ Todas as tabelas verificadas (users, transactions, medical_records).");
        clientDb.release();
    } catch (err) {
        console.error("❌ Erro Banco:", err.message);
    }
}
initDB();

// --- ROTAS ---

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

        // Link de ativação limpo
        const baseUrl = process.env.APP_URL || `https://${req.get('host')}`;
        const activationLink = `${baseUrl}/auth/verify/${verificationToken}`;

        const mailOptions = {
            from: `"Conecta Saúde" <${process.env.SMTP_USER}>`,
            to: email,
            subject: 'Ative sua conta - Conecta Saúde',
            html: `<h2>Bem-vindo, ${name}!</h2><p>Clique abaixo para ativar sua conta:</p><a href="${activationLink}">ATIVAR CONTA AGORA</a>`
        };

        transporter.sendMail(mailOptions).catch(e => console.error("Erro E-mail:", e.message));
        res.json({ message: "Verifique seu e-mail." });
    } catch (err) {
        res.status(500).json({ error: "E-mail ou CPF já cadastrados." });
    }
});

app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase().trim()]);
        if (result.rows.length === 0) return res.status(400).json({ error: "Usuário não encontrado." });
        
        const user = result.rows[0];
        if (!user.is_verified) return res.status(401).json({ error: "Confirme seu e-mail antes de entrar." });

        if (await bcrypt.compare(password, user.password_hash)) {
            delete user.password_hash;
            res.json({ user });
        } else {
            res.status(403).json({ error: "Senha incorreta." });
        }
    } catch (err) {
        res.status(500).json({ error: "Erro interno." });
    }
});

app.get('/auth/verify/:token', async (req, res) => {
    const { token } = req.params;
    try {
        const result = await pool.query(
            "UPDATE users SET is_verified = true, verification_token = NULL WHERE verification_token = $1 RETURNING name",
            [token]
        );
        if (result.rows.length === 0) return res.send("Link inválido ou expirado.");
        res.send(`<h1>Conta Ativada!</h1><p>Parabéns ${result.rows[0].name}, você já pode fazer login no app.</p><a href="/">Voltar para o Login</a>`);
    } catch (err) {
        res.status(500).send("Erro na ativação.");
    }
});

app.post('/ai/generate', async (req, res) => {
    const { prompt, cost, isJson, userId } = req.body;
    const apiKey = process.env.GOOGLE_API_KEY;

    if (!userId) return res.status(401).json({ error: "Login necessário." });

    try {
        const userRes = await pool.query("SELECT credits, role FROM users WHERE id = $1", [userId]);
        const user = userRes.rows[0];

        if (user.role !== 'admin' && user.credits < cost) return res.status(402).json({ error: "Créditos insuficientes." });

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: isJson ? prompt + "\nResponda JSON puro." : prompt }] }] })
        });

        const data = await response.json();
        const txt = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!txt) throw new Error("Sem resposta da IA");

        let result = txt;
        if (isJson) {
            try { result = JSON.parse(txt.replace(/```json/g, '').replace(/```/g, '').trim()); } catch(e){}
        }

        let newCredits = user.credits;
        if (user.role !== 'admin') {
            await pool.query("UPDATE users SET credits = credits - $1 WHERE id = $2", [cost, userId]);
            newCredits -= cost;
        }

        res.json({ result, new_credits: newCredits });
    } catch (err) {
        res.status(500).json({ error: "Erro na IA." });
    }
});

app.listen(port, () => console.log(`🚀 Servidor rodando na porta ${port}`));