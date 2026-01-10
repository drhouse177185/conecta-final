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

// Se a pasta 'public' não existir (em alguns deploys pode variar), use a raiz como fallback
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
    let clientDb;
    try {
        clientDb = await pool.connect();
        
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
                claimed_free_bonus BOOLEAN DEFAULT FALSE,
                blocked_features JSONB DEFAULT '{"preConsulta": false, "preOp": false}'::jsonb,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Tabela de Encaminhamentos (Referrals)
        await clientDb.query(`
            CREATE TABLE IF NOT EXISTS referrals (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                patient_name VARCHAR(255),
                patient_cpf VARCHAR(20),
                specialty VARCHAR(100),
                reason TEXT,
                status VARCHAR(20) DEFAULT 'pending', 
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Seed Admin (Dr. Tiago)
        const hash = await bcrypt.hash('123456', 10);
        await clientDb.query(`
            INSERT INTO users (name, email, password_hash, role, credits, cpf, age, sex)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (email) DO NOTHING;
        `, ['Dr. Tiago Barros', 'drtiago.barros@gmail.com', hash, 'admin', 99999, '000.000.000-01', 35, 'M']);
        
        console.log("Banco de dados pronto (Users e Referrals).");
    } catch (err) { console.error("Erro DB:", err); } 
    finally { if(clientDb) clientDb.release(); }
}
initDB();

// --- AUTH MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Token ausente" });
    jwt.verify(token, process.env.JWT_SECRET || 'secret_dev', (err, user) => {
        if (err) return res.status(403).json({ error: "Token inválido" });
        req.user = user;
        next();
    });
};

const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Acesso restrito a administradores" });
    next();
};

// --- ROTAS AUTH ---
app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase().trim()]);
        if (result.rows.length === 0) return res.status(400).json({ error: "Usuário não encontrado" });
        const user = result.rows[0];
        if (await bcrypt.compare(password, user.password_hash)) {
            const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'secret_dev', { expiresIn: '24h' });
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

// --- ROTAS IA ---
app.post('/ai/generate', authenticateToken, async (req, res) => {
    const { prompt, cost, isJson } = req.body;
    try {
        const userRes = await pool.query("SELECT credits FROM users WHERE id = $1", [req.user.id]);
        if (req.user.role !== 'admin' && userRes.rows[0].credits < cost) return res.status(402).json({ error: "Saldo insuficiente" });

        const apiKey = process.env.GOOGLE_API_KEY;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: isJson ? prompt + "\nResponda APENAS JSON válido, sem markdown." : prompt }] }] })
        });
        
        const data = await response.json();
        const txt = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!txt) throw new Error("A IA não gerou resposta.");

        let finalResult = txt;
        if(isJson) { 
            try { 
                const cleanTxt = txt.replace(/```json/g, '').replace(/```/g, '').trim();
                finalResult = JSON.parse(cleanTxt); 
            } catch(e){ return res.status(500).json({ error: "Falha JSON IA", raw: txt }); } 
        }

        if(req.user.role !== 'admin' && cost > 0) {
            await pool.query("UPDATE users SET credits = credits - $1 WHERE id = $2", [cost, req.user.id]);
        }
        
        const updated = await pool.query("SELECT credits FROM users WHERE id = $1", [req.user.id]);
        res.json({ result: finalResult, new_credits: updated.rows[0].credits });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- ROTAS ENCAMINHAMENTOS (CORE DA NOVA FUNCIONALIDADE) ---

// 1. Criar Encaminhamento (Usuário salva a sugestão da IA)
app.post('/referrals', authenticateToken, async (req, res) => {
    const { specialty, reason } = req.body;
    try {
        // Busca dados atualizados do usuário para garantir consistência
        const userRes = await pool.query("SELECT name, cpf FROM users WHERE id = $1", [req.user.id]);
        const user = userRes.rows[0];

        // Insere na tabela 'referrals'
        await pool.query(
            "INSERT INTO referrals (user_id, patient_name, patient_cpf, specialty, reason) VALUES ($1, $2, $3, $4, $5)",
            [req.user.id, user.name, user.cpf, specialty, reason]
        );
        res.json({ success: true, message: "Encaminhamento registrado com sucesso." });
    } catch (err) {
        console.error("Erro ao salvar encaminhamento:", err);
        res.status(500).json({ error: "Erro ao salvar encaminhamento" });
    }
});

// 2. Listar Encaminhamentos (Admin visualiza a fila)
app.get('/admin/referrals', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM referrals WHERE status = 'pending' ORDER BY created_at DESC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Erro ao buscar encaminhamentos" });
    }
});

// --- ROTAS ADMIN GERAIS ---
app.get('/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query("SELECT id, name, email, credits, role, created_at, blocked_features, cpf, age FROM users ORDER BY created_at DESC LIMIT 50");
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: "Erro users" }); }
});

app.post('/admin/add-credits', authenticateToken, requireAdmin, async (req, res) => {
    const { userId, amount } = req.body;
    try {
        await pool.query("UPDATE users SET credits = credits + $1 WHERE id = $2", [amount, userId]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Erro add credits" }); }
});

// --- MP ---
app.post('/create_preference', authenticateToken, async (req, res) => {
    const { description, price, quantity } = req.body;
    try {
        const preference = new Preference(client);
        const result = await preference.create({
            body: {
                items: [{ title: description, unit_price: Number(price), quantity: Number(quantity), currency_id: 'BRL' }],
                back_urls: { success: `${req.get('origin')}/`, failure: `${req.get('origin')}/` },
                auto_return: "approved"
            }
        });
        res.json({ id: result.id });
    } catch (err) { res.status(500).json({ error: "Erro MP" }); }
});

// CATCH ALL
app.get('*', (req, res) => {
    const indexPath = path.join(staticPath, 'index.html');
    if (fs.existsSync(indexPath)) res.sendFile(indexPath);
    else res.send("Frontend não encontrado.");
});

app.listen(port, () => console.log(`🚀 Rodando na porta ${port}`));