require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const { MercadoPagoConfig, Preference } = require('mercadopago');

// --- CONFIGURAÇÃO INICIAL ---
const app = express();
const port = process.env.PORT || 3000;

// Configuração de Caminhos (Segurança)
const publicPath = path.join(__dirname, 'public');
if (!fs.existsSync(publicPath)) {
    console.warn("⚠️ AVISO: Pasta 'public' não encontrada. Criando fallback...");
    fs.mkdirSync(publicPath, { recursive: true });
}

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Limite aumentado para upload de imagens/PDFs base64
app.use(express.static(publicPath));

// --- BANCO DE DADOS ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// --- MERCADO PAGO ---
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

// --- INICIALIZAÇÃO DO DB ---
async function initDB() {
    try {
        const clientDb = await pool.connect();
        console.log("✅ Conectado ao PostgreSQL");
        
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // Criar Admin Padrão se não existir
        const hash = await bcrypt.hash('123456', 10);
        await clientDb.query(`
            INSERT INTO users (name, email, password_hash, role, credits, cpf, age, sex)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (email) DO NOTHING;
        `, ['Dr. Admin', 'admin@conectasaude.com', hash, 'admin', 99999, '000.000.000-00', 40, 'M']);

        clientDb.release();
    } catch (err) {
        console.error("❌ Erro fatal no DB:", err);
    }
}
initDB();

// --- MIDDLEWARES DE AUTH ---
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

// --- ROTAS DE AUTENTICAÇÃO ---
app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase().trim()]);
        if (result.rows.length === 0) return res.status(400).json({ error: "Usuário não encontrado" });

        const user = result.rows[0];
        if (await bcrypt.compare(password, user.password_hash)) {
            const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'secret_dev');
            delete user.password_hash;
            res.json({ token, user });
        } else {
            res.status(403).json({ error: "Senha incorreta" });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/auth/register', async (req, res) => {
    const { name, email, password, cpf, age, sex } = req.body;
    try {
        const hash = await bcrypt.hash(password, 10);
        const newUser = await pool.query(
            "INSERT INTO users (name, email, password_hash, cpf, age, sex) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, email, role, credits",
            [name, email.toLowerCase().trim(), hash, cpf, age, sex]
        );
        res.json(newUser.rows[0]);
    } catch (err) { 
        console.error(err);
        res.status(500).json({ error: "Erro ao registrar. Email/CPF já existem?" }); 
    }
});

// --- ROTAS DE IA (GEMINI) ---
app.post('/ai/generate', authenticateToken, async (req, res) => {
    const { prompt, cost, isJson } = req.body;
    try {
        // Verificar saldo
        const userRes = await pool.query("SELECT credits FROM users WHERE id = $1", [req.user.id]);
        if (userRes.rows[0].credits < cost && req.user.role !== 'admin') {
            return res.status(402).json({ error: "Saldo insuficiente." });
        }

        const apiKey = process.env.GOOGLE_API_KEY;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: isJson ? prompt + "\nResponda APENAS JSON válido puro." : prompt }] }]
            })
        });

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!text) throw new Error("IA não retornou texto.");

        let finalResult = text;
        if (isJson) {
            try {
                finalResult = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
            } catch (e) {
                // Se falhar o parse, tenta limpar mais ou retorna erro
                console.error("Erro Parse JSON IA:", text);
                return res.status(500).json({ error: "IA gerou JSON inválido", raw: text });
            }
        }

        // Debitar
        if (req.user.role !== 'admin' && cost > 0) {
            await pool.query("UPDATE users SET credits = credits - $1 WHERE id = $2", [cost, req.user.id]);
        }

        const updated = await pool.query("SELECT credits FROM users WHERE id = $1", [req.user.id]);
        res.json({ result: finalResult, new_credits: updated.rows[0].credits });

    } catch (err) {
        console.error("Erro IA:", err);
        res.status(500).json({ error: "Erro no processamento IA" });
    }
});

// --- ROTAS DE PAGAMENTO (MERCADO PAGO) ---
app.post('/create_preference', authenticateToken, async (req, res) => {
    const { description, price, quantity } = req.body;
    try {
        const preference = new Preference(client);
        const result = await preference.create({
            body: {
                items: [{ title: description, unit_price: Number(price), quantity: Number(quantity), currency_id: 'BRL' }],
                back_urls: {
                    success: `${req.get('origin')}/?status=success`,
                    failure: `${req.get('origin')}/?status=failure`,
                    pending: `${req.get('origin')}/?status=pending`
                },
                auto_return: "approved",
                metadata: { user_id: req.user.id, credits_add: description === 'basic_50' ? 50 : 150 }
            }
        });
        res.json({ id: result.id });
    } catch (err) {
        console.error("Erro MP:", err);
        res.status(500).json({ error: "Erro ao criar preferência de pagamento" });
    }
});

// --- ROTAS ADMIN (Faltavam estas!) ---
app.get('/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query("SELECT id, name, email, credits, role, created_at FROM users ORDER BY created_at DESC LIMIT 50");
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: "Erro ao listar usuários" }); }
});

app.post('/admin/add-credits', authenticateToken, requireAdmin, async (req, res) => {
    const { userId, amount } = req.body;
    try {
        await pool.query("UPDATE users SET credits = credits + $1 WHERE id = $2", [amount, userId]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Erro ao adicionar créditos" }); }
});

// --- SERVIR FRONTEND ---
app.get('*', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) res.sendFile(indexPath);
    else res.send("Frontend (public/index.html) não encontrado. Verifique o deploy.");
});

app.listen(port, () => console.log(`🚀 Servidor rodando na porta ${port}`));