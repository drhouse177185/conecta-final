// NOME DO ARQUIVO: server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const { MercadoPagoConfig, Preference } = require('mercadopago');

// --- CONFIGURAÇÃO ---
const app = express();
const port = process.env.PORT || 3000;

// Configuração do Banco de Dados (PostgreSQL)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Inicializa Mercado Pago
const mpToken = process.env.MP_ACCESS_TOKEN;
const client = mpToken ? new MercadoPagoConfig({ accessToken: mpToken }) : null;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// --- INICIALIZAÇÃO DO BANCO (AUTO-MIGRATE + SEED) ---
async function initDB() {
    const clientDb = await pool.connect();
    try {
        console.log("Verificando estrutura do Banco de Dados...");
        
        // Tabelas Principais
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

        // --- SEED DE USUÁRIOS FIXOS ---
        const defaultPassHash = await bcrypt.hash('123456', 10);

        // 1. Admin: Dr. Tiago
        await clientDb.query(`
            INSERT INTO users (name, email, password_hash, role, credits, cpf, age, sex)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (email) DO UPDATE SET role = 'admin', cpf = $6;
        `, ['Dr. Tiago Barros', 'drtiago.barros@gmail.com', defaultPassHash, 'admin', 99999, '000.000.000-01', 35, 'M']);

        // 2. Usuária: Kellen
        await clientDb.query(`
            INSERT INTO users (name, email, password_hash, role, credits, cpf, age, sex)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (email) DO UPDATE SET cpf = $6;
        `, ['Kellen Fernandes', 'kellenbastos20@gmail.com', defaultPassHash, 'user', 100, '250.995.618-37', 45, 'F']);

        console.log("Banco de dados pronto e usuários verificados.");
    } catch (err) {
        console.error("Erro ao inicializar DB:", err);
    } finally {
        clientDb.release();
    }
}
initDB();

// --- MIDDLEWARE DE AUTENTICAÇÃO ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Token não fornecido" });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Token inválido ou expirado" });
        req.user = user;
        next();
    });
};

const isAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Acesso negado. Apenas admin." });
    next();
};

// --- ROTAS DE AUTENTICAÇÃO ---

app.post('/auth/register', async (req, res) => {
    const { name, email, password, cpf, age, sex } = req.body;
    try {
        if (!name || !email || !password) return res.status(400).json({ error: "Dados incompletos." });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await pool.query(
            "INSERT INTO users (name, email, password_hash, cpf, age, sex) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, email, role, credits, blocked_features",
            [name, email.toLowerCase().trim(), hashedPassword, cpf, age, sex]
        );
        res.json(newUser.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: "Email ou CPF já cadastrados." });
        res.status(500).json({ error: "Erro no servidor." });
    }
});

app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase().trim()]);
        if (result.rows.length === 0) return res.status(400).json({ error: "Usuário não encontrado." });

        const user = result.rows[0];
        if (await bcrypt.compare(password, user.password_hash)) {
            const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });
            delete user.password_hash;
            res.json({ token, user });
        } else {
            res.status(403).json({ error: "Senha incorreta." });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erro interno." });
    }
});

// Recuperação de Senha por CPF
app.post('/auth/recover-cpf', async (req, res) => {
    const { cpf } = req.body;
    try {
        const result = await pool.query("SELECT email, name FROM users WHERE cpf = $1", [cpf]);
        if (result.rows.length > 0) {
            // Em produção real, aqui enviaríamos um email com token.
            // Para este ambiente, confirmamos a conta e mostramos o email como dica.
            res.json({ 
                found: true, 
                message: `Conta localizada para ${result.rows[0].name}. Use o email ${result.rows[0].email} para logar.` 
            });
        } else {
            res.status(404).json({ error: "CPF não encontrado no sistema." });
        }
    } catch (err) {
        res.status(500).json({ error: "Erro interno ao buscar CPF." });
    }
});

// --- ROTAS DE INTELIGÊNCIA ARTIFICIAL ---

app.post('/ai/generate', authenticateToken, async (req, res) => {
    const { prompt, cost, isJson } = req.body;
    
    // Verificar bloqueios e créditos
    const userRes = await pool.query("SELECT credits, blocked_features FROM users WHERE id = $1", [req.user.id]);
    const user = userRes.rows[0];

    // Se admin, ignora custo
    if (req.user.role !== 'admin' && user.credits < cost) return res.status(402).json({ error: "Saldo insuficiente." });

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                contents: [{ parts: [{ text: isJson ? prompt + "\nResponda APENAS JSON válido sem formatação markdown." : prompt }] }] 
            })
        });
        
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        
        const txt = data.candidates?.[0]?.content?.parts?.[0]?.text;
        let finalResult = txt;
        
        if (isJson) {
            try {
                const cleanJson = txt.replace(/```json/g, '').replace(/```/g, '').trim();
                finalResult = JSON.parse(cleanJson);
            } catch (e) {
                finalResult = { error: "Erro no formato da resposta", raw: txt }; 
            }
        }

        // Debitar se não for admin
        if (req.user.role !== 'admin' && cost > 0) {
            await pool.query("UPDATE users SET credits = credits - $1 WHERE id = $2", [cost, req.user.id]);
        }
        
        const updatedUser = await pool.query("SELECT credits FROM users WHERE id = $1", [req.user.id]);
        res.json({ result: finalResult, new_credits: updatedUser.rows[0].credits });

    } catch (err) {
        res.status(500).json({ error: "Erro no processamento inteligente." });
    }
});

app.post('/ai/tts', authenticateToken, async (req, res) => {
    const { text } = req.body;
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: text }] }],
                generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } }
                }
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        
        const audioContent = data.candidates[0].content.parts[0].inlineData.data;
        res.json({ audioContent });

    } catch (err) {
        res.status(500).json({ error: "Erro ao gerar áudio." });
    }
});

// --- ROTAS ADMINISTRATIVAS ---
app.get('/admin/users', authenticateToken, isAdmin, async (req, res) => {
    try {
        const result = await pool.query("SELECT id, name, email, cpf, age, credits, blocked_features, role FROM users ORDER BY name ASC");
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: "Erro ao listar." }); }
});

app.post('/admin/recharge', authenticateToken, isAdmin, async (req, res) => {
    const { email, amount } = req.body;
    try {
        await pool.query("UPDATE users SET credits = credits + $1 WHERE email = $2", [amount, email]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Erro na recarga." }); }
});

app.post('/admin/toggle-block', authenticateToken, isAdmin, async (req, res) => {
    const { email, feature } = req.body;
    try {
        const userRes = await pool.query("SELECT blocked_features FROM users WHERE email = $1", [email]);
        let currentBlocks = userRes.rows[0].blocked_features || { preConsulta: false, preOp: false };
        currentBlocks[feature] = !currentBlocks[feature];
        await pool.query("UPDATE users SET blocked_features = $1 WHERE email = $2", [currentBlocks, email]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Erro ao bloquear." }); }
});

app.post('/auth/claim-bonus', authenticateToken, async (req, res) => {
    try {
        const check = await pool.query("SELECT claimed_free_bonus FROM users WHERE id = $1", [req.user.id]);
        if (check.rows[0].claimed_free_bonus) return res.status(400).json({ error: "Bônus já resgatado." });
        await pool.query("UPDATE users SET credits = credits + 50, claimed_free_bonus = TRUE WHERE id = $1", [req.user.id]);
        const updated = await pool.query("SELECT credits FROM users WHERE id = $1", [req.user.id]);
        res.json({ success: true, new_credits: updated.rows[0].credits });
    } catch (err) { res.status(500).json({ error: "Erro no bônus." }); }
});

app.post('/create_preference', authenticateToken, async (req, res) => {
    if (!client) return res.status(500).json({ error: "Mercado Pago indisponível." });
    try {
        const { description, price, quantity } = req.body;
        const preference = new Preference(client);
        const result = await preference.create({
            body: {
                items: [{ title: description, unit_price: Number(price), currency_id: "BRL", quantity: Number(quantity) }],
                back_urls: { success: req.headers.origin, failure: req.headers.origin, pending: req.headers.origin },
                auto_return: "approved",
                metadata: { user_id: req.user.id }
            }
        });
        res.json({ id: result.id });
    } catch (error) { res.status(500).json({ error: "Erro Pagamento" }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(port, () => console.log(`🚀 Conecta Saúde rodando na porta ${port}`));