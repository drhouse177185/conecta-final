// NOME DO ARQUIVO: server.js
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

require('dotenv').config();

console.log("\n=========================================");
console.log("🔍 INICIANDO SERVIDOR CONECTA SAÚDE");
console.log("=========================================");

const app = express();
const port = process.env.PORT || 3000;

// --- LISTA DE E-MAILS VIP (Não precisam de verificar e-mail) ---
const VIP_EMAILS = [
    'drtiago.barros@gmail.com',
    'kellenbastos20@gmail.com'
];

app.use(express.static(__dirname));
app.use(express.json({ limit: '50mb' }));
app.use(cors());

app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'index.html');
    if (fs.existsSync(indexPath)) res.sendFile(indexPath);
    else res.status(404).send("Erro: index.html não encontrado.");
});

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false }
});

// Configuração de E-mail
const smtpUser = (process.env.SMTP_USER || '').trim();
const smtpPass = (process.env.SMTP_PASS || '').replace(/\s+/g, '');
const smtpPort = Number(process.env.SMTP_PORT) || 587;
const smtpHost = (process.env.SMTP_HOST || 'smtp.gmail.com').trim();

const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 20000,
    greetingTimeout: 20000
});

async function initDB() {
    try {
        if (!process.env.DB_HOST) return;
        const clientDb = await pool.connect();
        console.log("🗄️  Banco de Dados Conectado!");

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
        
        // --- AUTO-CORREÇÃO VIP ---
        // Garante que as contas VIP sejam sempre verificadas e Admin se necessário
        console.log("🌟 Aplicando privilégios VIP...");
        for (const email of VIP_EMAILS) {
            await clientDb.query(
                "UPDATE users SET is_verified = TRUE WHERE email = $1", 
                [email]
            );
        }
        
        // Garante que o Dr. Tiago seja Admin
        await clientDb.query("UPDATE users SET role = 'admin' WHERE email = 'drtiago.barros@gmail.com'");

        console.log("✅ Banco pronto e VIPs liberados.");
        clientDb.release();
    } catch (err) {
        console.error("❌ Erro Banco:", err.message);
    }
}
initDB();

// --- ROTAS ---

app.post('/auth/register', async (req, res) => {
    const { name, email, password, cpf, age, sex } = req.body;
    
    if (!email || !password || !name) return res.status(400).json({ error: "Preencha todos os campos." });

    const emailLower = email.toLowerCase().trim();
    // Verifica se é VIP
    const isVip = VIP_EMAILS.includes(emailLower);

    try {
        const checkUser = await pool.query("SELECT id FROM users WHERE email = $1 OR cpf = $2", [emailLower, cpf]);
        if (checkUser.rows.length > 0) return res.status(400).json({ error: "E-mail ou CPF já cadastrados." });

        const password_hash = await bcrypt.hash(password, 10);
        const verificationToken = crypto.randomBytes(32).toString('hex');

        // Se for VIP, já insere como is_verified = TRUE
        await pool.query(
            `INSERT INTO users (name, email, password_hash, cpf, age, sex, credits, verification_token, is_verified, role) 
             VALUES ($1, $2, $3, $4, $5, $6, 100, $7, $8, $9)`,
            [
                name, 
                emailLower, 
                password_hash, 
                cpf, 
                age, 
                sex, 
                verificationToken, 
                isVip ? true : false, // VIPs nascem verificados
                (emailLower === 'drtiago.barros@gmail.com') ? 'admin' : 'user'
            ]
        );

        // Se for VIP, não envia e-mail de ativação, apenas responde OK
        if (isVip) {
            return res.json({ message: "Conta VIP criada! Pode entrar direto.", vip: true });
        }

        // Fluxo normal para outros usuários
        let baseUrl = process.env.APP_URL;
        if (!baseUrl || baseUrl.includes('google.com')) baseUrl = `https://${req.get('host')}`;
        
        const activationLink = `${baseUrl}/auth/verify/${verificationToken}`;

        try {
            await transporter.sendMail({
                from: `"Conecta Saúde" <${smtpUser}>`,
                to: emailLower,
                subject: 'Ative sua conta - Conecta Saúde',
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4;">
                        <div style="background-color: white; padding: 20px; border-radius: 8px; text-align: center;">
                            <h2 style="color: #1e3a8a;">Bem-vindo(a), ${name}!</h2>
                            <p>Clique abaixo para ativar:</p>
                            <a href="${activationLink}" style="background-color: #16a34a; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">ATIVAR CONTA</a>
                        </div>
                    </div>
                `
            });
            res.json({ message: "Cadastro realizado! Verifique seu e-mail.", vip: false });

        } catch (emailError) {
            console.error("❌ Erro SMTP:", emailError);
            await pool.query("DELETE FROM users WHERE email = $1", [emailLower]);
            return res.status(500).json({ error: "Erro ao enviar e-mail. Tente novamente." });
        }

    } catch (err) {
        console.error("Erro Registro:", err);
        res.status(500).json({ error: "Erro interno." });
    }
});

app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const emailLower = email.toLowerCase().trim();
    
    try {
        const result = await pool.query("SELECT * FROM users WHERE email = $1", [emailLower]);
        if (result.rows.length === 0) return res.status(400).json({ error: "Usuário não encontrado." });
        
        const user = result.rows[0];

        // Lógica de liberação: Se for VIP, passa. Se não, checa is_verified.
        const isVip = VIP_EMAILS.includes(emailLower);
        
        if (!user.is_verified && !isVip) {
            return res.status(401).json({ error: "Verifique seu e-mail para ativar a conta." });
        }

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

app.post('/auth/recover-password', async (req, res) => {
    const { cpf } = req.body;
    try {
        const result = await pool.query("SELECT * FROM users WHERE cpf = $1", [cpf]);
        if (result.rows.length === 0) return res.status(404).json({ error: "CPF não encontrado." });

        const user = result.rows[0];
        const newPassword = crypto.randomBytes(4).toString('hex');
        const newHash = await bcrypt.hash(newPassword, 10);

        await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [newHash, user.id]);
        res.json({ newPassword });
    } catch (err) {
        res.status(500).json({ error: "Erro na recuperação." });
    }
});

app.get('/auth/verify/:token', async (req, res) => {
    const { token } = req.params;
    try {
        const result = await pool.query(
            "UPDATE users SET is_verified = true, verification_token = NULL WHERE verification_token = $1 RETURNING name",
            [token]
        );
        if (result.rows.length === 0) return res.send(`<h1>Link Inválido</h1>`);
        res.send(`<h1>Conta Ativada!</h1><p>Pode fazer login.</p>`);
    } catch (err) {
        res.status(500).send("Erro na ativação.");
    }
});

app.post('/ai/generate', async (req, res) => {
    const { prompt, cost, isJson, userId } = req.body;
    const apiKey = process.env.GOOGLE_API_KEY;

    try {
        const userRes = await pool.query("SELECT credits, role FROM users WHERE id = $1", [userId]);
        if (userRes.rows.length === 0) return res.status(404).json({ error: "Login necessário." });
        const user = userRes.rows[0];

        if (user.role !== 'admin' && user.credits < cost) return res.status(402).json({ error: "Créditos insuficientes." });

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: isJson ? prompt + "\nResponda JSON." : prompt }] }] })
        });

        const data = await response.json();
        const txt = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        
        let result = txt;
        if (isJson && txt) {
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