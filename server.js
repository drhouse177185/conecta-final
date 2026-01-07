// NOME DO ARQUIVO: server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const { MercadoPagoConfig, Preference } = require('mercadopago');

// --- DIAGNÓSTICO E CONFIGURAÇÃO ---
console.log("=== INICIALIZANDO SERVIDOR ===");
const publicPath = path.join(__dirname, 'public');

// Se a pasta 'public' não existir (em alguns deploys pode variar), use a raiz
const staticPath = fs.existsSync(publicPath) ? publicPath : __dirname;
console.log(`Servindo arquivos estáticos de: ${staticPath}`);

const app = express();
const port = process.env.PORT || 3000;

// DB
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// MP
const mpToken = process.env.MP_ACCESS_TOKEN;
const client = mpToken ? new MercadoPagoConfig({ accessToken: mpToken }) : null;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(staticPath));

// --- INICIALIZAÇÃO DB ---
async function initDB() {
    const clientDb = await pool.connect();
    try {
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
                claimed_free_bonus BOOLEAN DEFAULT FALSE,
                blocked_features JSONB DEFAULT '{"preConsulta": false, "preOp": false}'::jsonb,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        // Seed
        const hash = await bcrypt.hash('123456', 10);
        await clientDb.query(`
            INSERT INTO users (name, email, password_hash, role, credits, cpf, age, sex)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (email) DO NOTHING;
        `, ['Dr. Tiago Barros', 'drtiago.barros@gmail.com', hash, 'admin', 99999, '000.000.000-01', 35, 'M']);
        
        await clientDb.query(`
            INSERT INTO users (name, email, password_hash, role, credits, cpf, age, sex)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (email) DO NOTHING;
        `, ['Kellen Fernandes', 'kellenbastos20@gmail.com', hash, 'user', 100, '250.995.618-37', 45, 'F']);
        
        console.log("Banco de dados pronto.");
    } catch (err) { console.error("Erro DB:", err); } 
    finally { clientDb.release(); }
}
initDB();

// --- AUTH MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Token ausente" });
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Token inválido" });
        req.user = user;
        next();
    });
};

// --- ROTAS ---
app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase().trim()]);
        if (result.rows.length === 0) return res.status(400).json({ error: "Usuário não encontrado" });
        const user = result.rows[0];
        if (await bcrypt.compare(password, user.password_hash)) {
            const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });
            delete user.password_hash;
            res.json({ token, user });
        } else { res.status(403).json({ error: "Senha incorreta" }); }
    } catch (err) { res.status(500).json({ error: "Erro interno" }); }
});

app.post('/auth/register', async (req, res) => {
    const { name, email, password, cpf, age, sex } = req.body;
    try {
        const hash = await bcrypt.hash(password, 10);
        const newUser = await pool.query(
            "INSERT INTO users (name, email, password_hash, cpf, age, sex) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, email, role, credits, blocked_features",
            [name, email.toLowerCase().trim(), hash, cpf, age, sex]
        );
        res.json(newUser.rows[0]);
    } catch (err) { res.status(500).json({ error: "Erro ao registrar (Email/CPF duplicado?)" }); }
});

// IA
app.post('/ai/generate', authenticateToken, async (req, res) => {
    const { prompt, cost, isJson } = req.body;
    const userRes = await pool.query("SELECT credits FROM users WHERE id = $1", [req.user.id]);
    const user = userRes.rows[0];

    if (req.user.role !== 'admin' && user.credits < cost) return res.status(402).json({ error: "Saldo insuficiente" });

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: isJson ? prompt + "\nResponda APENAS JSON." : prompt }] }] })
        });
        const data = await response.json();
        const txt = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if(!txt) throw new Error("Sem resposta da IA");

        let finalResult = txt;
        if(isJson) { try { finalResult = JSON.parse(txt.replace(/```json/g, '').replace(/```/g, '').trim()); } catch(e){} }

        if(req.user.role !== 'admin' && cost > 0) {
            await pool.query("UPDATE users SET credits = credits - $1 WHERE id = $2", [cost, req.user.id]);
        }
        
        const updated = await pool.query("SELECT credits FROM users WHERE id = $1", [req.user.id]);
        res.json({ result: finalResult, new_credits: updated.rows[0].credits });
    } catch (err) { res.status(500).json({ error: "Erro IA: " + err.message }); }
});

// CATCH ALL
app.get('*', (req, res) => {
    const indexPath = path.join(staticPath, 'index.html');
    if (fs.existsSync(indexPath)) res.sendFile(indexPath);
    else res.status(404).send("Index não encontrado.");
});

app.listen(port, () => console.log(`🚀 Rodando na porta ${port}`));