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

// --- DIAGNÓSTICO DE ARQUIVOS (Ajuda a achar o erro no Render) ---
console.log("=== DIAGNÓSTICO DE INICIALIZAÇÃO ===");
const publicPath = path.join(__dirname, 'public');
console.log("Caminho esperado da public:", publicPath);

try {
    if (fs.existsSync(publicPath)) {
        console.log("✅ Pasta 'public' encontrada!");
        const files = fs.readdirSync(publicPath);
        console.log("📂 Arquivos dentro da public:", files);
        
        if (files.includes('index.html')) {
            console.log("✅ index.html encontrado dentro de public.");
        } else {
            console.error("❌ ERRO: A pasta public existe, mas está vazia ou sem index.html.");
        }
    } else {
        console.error("❌ ERRO CRÍTICO: A pasta 'public' NÃO existe na raiz do projeto.");
        console.log("📂 Conteúdo da raiz:", fs.readdirSync(__dirname));
    }
} catch (e) {
    console.error("Erro no diagnóstico:", e);
}
console.log("========================================");

// --- CONFIGURAÇÃO ---
const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const mpToken = process.env.MP_ACCESS_TOKEN;
const client = mpToken ? new MercadoPagoConfig({ accessToken: mpToken }) : null;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- SERVIR ARQUIVOS ESTÁTICOS DA PASTA PUBLIC ---
// Agora apontamos explicitamente para a pasta 'public'
app.use(express.static(publicPath));

// --- INICIALIZAÇÃO DO BANCO ---
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
                last_recharge_date DATE DEFAULT CURRENT_DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                amount INTEGER NOT NULL,
                description VARCHAR(255),
                type VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        const defaultPassHash = await bcrypt.hash('123456', 10);
        await clientDb.query(`
            INSERT INTO users (name, email, password_hash, role, credits, cpf, age, sex)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (email) DO UPDATE SET role = 'admin', cpf = $6;
        `, ['Dr. Tiago Barros', 'drtiago.barros@gmail.com', defaultPassHash, 'admin', 99999, '000.000.000-01', 35, 'M']);

        await clientDb.query(`
            INSERT INTO users (name, email, password_hash, role, credits, cpf, age, sex)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (email) DO UPDATE SET cpf = $6;
        `, ['Kellen Fernandes', 'kellenbastos20@gmail.com', defaultPassHash, 'user', 100, '250.995.618-37', 45, 'F']);

        console.log("Banco de dados verificado.");
    } catch (err) {
        console.error("Erro DB:", err);
    } finally {
        clientDb.release();
    }
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

const isAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Acesso negado" });
    next();
};

// --- ROTAS (API) ---
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
        } else {
            res.status(403).json({ error: "Senha incorreta" });
        }
    } catch (err) { res.status(500).json({ error: "Erro interno" }); }
});

app.post('/auth/register', async (req, res) => {
    const { name, email, password, cpf, age, sex } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await pool.query(
            "INSERT INTO users (name, email, password_hash, cpf, age, sex) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, email, role, credits, blocked_features",
            [name, email.toLowerCase().trim(), hashedPassword, cpf, age, sex]
        );
        res.json(newUser.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: "Email/CPF já cadastrado" });
        res.status(500).json({ error: "Erro servidor" });
    }
});

app.post('/auth/recover-cpf', async (req, res) => {
    const { cpf } = req.body;
    try {
        const result = await pool.query("SELECT email, name FROM users WHERE cpf = $1", [cpf]);
        if (result.rows.length > 0) res.json({ found: true, message: `Conta: ${result.rows[0].email}` });
        else res.status(404).json({ error: "CPF não encontrado" });
    } catch (err) { res.status(500).json({ error: "Erro interno" }); }
});

app.post('/ai/generate', authenticateToken, async (req, res) => {
    const { prompt, cost, isJson } = req.body;
    const userRes = await pool.query("SELECT credits FROM users WHERE id = $1", [req.user.id]);
    const user = userRes.rows[0];

    if (req.user.role !== 'admin' && user.credits < cost) return res.status(402).json({ error: "Saldo insuficiente." });

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: isJson ? prompt + "\nResponda APENAS JSON." : prompt }] }] })
        });
        const data = await response.json();
        const txt = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        let finalResult = txt;
        if (isJson) { try { finalResult = JSON.parse(txt.replace(/```json/g, '').replace(/```/g, '').trim()); } catch (e) {} }

        if (req.user.role !== 'admin' && cost > 0) {
            await pool.query("UPDATE users SET credits = credits - $1 WHERE id = $2", [cost, req.user.id]);
        }
        
        const updated = await pool.query("SELECT credits FROM users WHERE id = $1", [req.user.id]);
        res.json({ result: finalResult, new_credits: updated.rows[0].credits });
    } catch (err) { res.status(500).json({ error: "Erro IA" }); }
});

app.post('/ai/tts', authenticateToken, async (req, res) => {
    const { text } = req.body;
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: text }] }],
                generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } } }
            })
        });
        const data = await response.json();
        res.json({ audioContent: data.candidates[0].content.parts[0].inlineData.data });
    } catch (err) { res.status(500).json({ error: "Erro TTS" }); }
});

app.post('/admin/users', authenticateToken, isAdmin, async (req, res) => {
    const result = await pool.query("SELECT * FROM users");
    res.json(result.rows);
});

app.post('/admin/recharge', authenticateToken, isAdmin, async (req, res) => {
    await pool.query("UPDATE users SET credits = credits + $1 WHERE email = $2", [req.body.amount, req.body.email]);
    res.json({ success: true });
});

app.post('/admin/toggle-block', authenticateToken, isAdmin, async (req, res) => {
    const { email, feature } = req.body;
    const user = await pool.query("SELECT blocked_features FROM users WHERE email = $1", [email]);
    let blocks = user.rows[0].blocked_features || { preConsulta: false, preOp: false };
    blocks[feature] = !blocks[feature];
    await pool.query("UPDATE users SET blocked_features = $1 WHERE email = $2", [blocks, email]);
    res.json({ success: true });
});

app.post('/auth/claim-bonus', authenticateToken, async (req, res) => {
    const check = await pool.query("SELECT claimed_free_bonus FROM users WHERE id = $1", [req.user.id]);
    if (check.rows[0].claimed_free_bonus) return res.status(400).json({ error: "Já resgatado." });
    await pool.query("UPDATE users SET credits = credits + 50, claimed_free_bonus = TRUE WHERE id = $1", [req.user.id]);
    const up = await pool.query("SELECT credits FROM users WHERE id = $1", [req.user.id]);
    res.json({ success: true, new_credits: up.rows[0].credits });
});

app.post('/create_preference', authenticateToken, async (req, res) => {
    if (!client) return res.status(500).json({ error: "MP Off" });
    const result = await new Preference(client).create({
        body: {
            items: [{ title: req.body.description, unit_price: Number(req.body.price), currency_id: "BRL", quantity: 1 }],
            back_urls: { success: req.headers.origin, failure: req.headers.origin, pending: req.headers.origin },
            auto_return: "approved"
        }
    });
    res.json({ id: result.id });
});

// --- ROTA CATCH-ALL PARA A PASTA PUBLIC ---
app.get('*', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send(`
            <h1>Erro: Arquivo index.html não encontrado</h1>
            <p>O servidor buscou em: <code>${indexPath}</code></p>
            <p>Certifique-se de que a pasta <strong>public</strong> existe e contém o <strong>index.html</strong>.</p>
        `);
    }
});

app.listen(port, () => console.log(`🚀 Server rodando na porta ${port}`));