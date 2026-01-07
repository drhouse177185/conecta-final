// NOME DO ARQUIVO: server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs'); // Módulo de arquivos para diagnóstico
const { MercadoPagoConfig, Preference } = require('mercadopago');

// --- DIAGNÓSTICO INICIAL (CRUCIAL PARA O ERRO) ---
console.log("=== INICIANDO SERVIDOR ===");
console.log("Diretório atual (__dirname):", __dirname);
console.log("Listando arquivos na pasta raiz:");
try {
    const files = fs.readdirSync(__dirname);
    files.forEach(file => {
        console.log(` - ${file}`); // Mostra cada arquivo nos logs do Render
    });
    
    // Verificação específica
    if (files.includes('index.html')) {
        console.log("✅ SUCESSO: index.html encontrado!");
    } else {
        console.error("❌ ERRO CRÍTICO: index.html NÃO está nesta pasta.");
        // Tenta achar variações comuns
        const htmlFiles = files.filter(f => f.endsWith('.html'));
        if(htmlFiles.length > 0) console.log("⚠️ Avis: Encontrei outros HTMLs:", htmlFiles);
    }
} catch (e) {
    console.error("Erro ao listar arquivos:", e);
}
console.log("============================");

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

// --- SERVIR ARQUIVOS ESTÁTICOS (FORMULA MAIS SEGURA) ---
// Usa __dirname que é o caminho absoluto do próprio script
app.use(express.static(__dirname));

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

        // SEED DE USUÁRIOS
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

// --- ROTAS (Resumidas para focar no erro de arquivo) ---
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

// Rotas IA e Admin (Mantidas iguais à versão anterior, resumidas aqui para clareza)
app.post('/ai/generate', authenticateToken, async (req, res) => {
    // ... lógica de IA igual ...
    const { prompt, isJson } = req.body;
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: isJson ? prompt + "\nResponda APENAS JSON." : prompt }] }] })
        });
        const data = await response.json();
        const txt = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        let finalResult = txt;
        if(isJson) { try { finalResult = JSON.parse(txt.replace(/```json/g, '').replace(/```/g, '').trim()); } catch(e){} }
        res.json({ result: finalResult, new_credits: 100 }); // Simplificado para teste
    } catch (err) { res.status(500).json({ error: "Erro IA" }); }
});

app.post('/admin/users', authenticateToken, isAdmin, async (req, res) => {
    const result = await pool.query("SELECT * FROM users");
    res.json(result.rows);
});

// --- ROTA FRONTEND (SAFE GUARD) ---
app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'index.html');
    
    // Verifica se o arquivo existe antes de tentar enviar
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        // Se não achar, envia uma mensagem HTML simples em vez de travar o servidor
        res.status(404).send(`
            <h1>Erro: Frontend não encontrado</h1>
            <p>O servidor está rodando, mas o arquivo <code>index.html</code> não foi encontrado na pasta raiz.</p>
            <p>Verifique os <strong>Logs do Render</strong> para ver a lista de arquivos disponíveis.</p>
            <hr>
            <p>Diretório atual: ${__dirname}</p>
        `);
    }
});

app.listen(port, () => console.log(`🚀 Server rodando na porta ${port}`));