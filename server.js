// NOME DO ARQUIVO: server.js
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const path = require('path');

// Tenta carregar o .env (apenas para ambiente local)
const dotenvResult = require('dotenv').config();

// --- DIAGNÓSTICO INTELIGENTE ---
console.log("\n=========================================");
console.log("🔍 INICIANDO SERVIDOR COMPLETO");
console.log("=========================================");

const dbHost = process.env.DB_HOST;

// Verifica se estamos no Render ou Local
if (!dbHost) {
    console.error("❌ ERRO: Nenhuma configuração de banco encontrada!");
    console.log("   Se estiver local: Verifique seu arquivo .env");
    console.log("   Se estiver no Render: Verifique a aba 'Environment' no painel.");
} else if (dotenvResult.error) {
    console.log("✅ Modo Produção/Render Detectado (Variáveis lidas do sistema).");
} else {
    console.log("✅ Modo Local Detectado (Arquivo .env carregado).");
}

const app = express();
// O Render define a porta automaticamente na variável PORT
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

// Teste de conexão SMTP
transporter.verify((error) => {
    if (error && process.env.SMTP_HOST) {
        console.error("⚠️  Aviso SMTP:", error.message);
    } else if (process.env.SMTP_HOST) {
        console.log("📧 E-mail pronto para envio.");
    }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// --- INICIALIZAÇÃO DO BANCO ---
async function initDB() {
    try {
        if (!process.env.DB_HOST) return; 
        
        const clientDb = await pool.connect();
        console.log("🗄️  Banco de Dados Conectado com Sucesso!");
        
        // Criação de Tabelas
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
        
        // Atualizações de segurança para tabelas antigas
        await clientDb.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255);
        `);

        console.log("✅ Tabelas verificadas.");
        clientDb.release();
    } catch (err) {
        console.error("❌ Falha na conexão com o Banco:", err.message);
    }
}

initDB();

// --- ROTAS DE AUTENTICAÇÃO ---

app.post('/auth/register', async (req, res) => {
    const { name, email, password, cpf, age, sex } = req.body;
    try {
        const password_hash = await bcrypt.hash(password, 10);
        const verificationToken = crypto.randomBytes(32).toString('hex');

        // Cria o usuário
        await pool.query(
            `INSERT INTO users (name, email, password_hash, cpf, age, sex, credits, verification_token, is_verified) 
             VALUES ($1, $2, $3, $4, $5, $6, 100, $7, false)`,
            [name, email.toLowerCase().trim(), password_hash, cpf, age, sex, verificationToken]
        );

        // Envia e-mail de ativação
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
        console.error("Erro no registro:", err);
        res.status(500).json({ error: "Erro ao cadastrar. E-mail ou CPF já existem." });
    }
});

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
            delete user.password_hash; // Remove a senha antes de enviar pro front
            res.json({ user });
        } else {
            res.status(403).json({ error: "Senha incorreta." });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erro interno no servidor." });
    }
});

app.get('/auth/verify/:token', async (req, res) => {
    const { token } = req.params;
    try {
        const result = await pool.query(
            "UPDATE users SET is_verified = true, verification_token = NULL WHERE verification_token = $1 RETURNING name",
            [token]
        );
        if (result.rows.length === 0) return res.send("<h1>Erro</h1><p>Link inválido ou já utilizado.</p>");
        res.send(`<h1>Sucesso!</h1><p>Conta de ${result.rows[0].name} ativada. Pode fechar esta aba e fazer login.</p>`);
    } catch (err) {
        res.status(500).send("Erro na verificação.");
    }
});

// --- ROTA DE INTELIGÊNCIA ARTIFICIAL (GEMINI) ---

app.post('/ai/generate', async (req, res) => {
    const { prompt, cost, isJson, userId } = req.body;
    const apiKey = process.env.GOOGLE_API_KEY;

    if (!userId) return res.status(401).json({ error: "ID de usuário ausente." });

    try {
        // Verifica créditos do usuário
        const userRes = await pool.query("SELECT credits, role FROM users WHERE id = $1", [userId]);
        
        if (userRes.rows.length === 0) return res.status(404).json({ error: "Usuário não encontrado." });
        
        const user = userRes.rows[0];
        if (user.role !== 'admin' && user.credits < cost) {
            return res.status(402).json({ error: "Créditos insuficientes." });
        }

        // Chama a API do Gemini
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                contents: [{ parts: [{ text: isJson ? prompt + "\nResponda APENAS JSON puro, sem markdown." : prompt }] }] 
            })
        });

        const data = await response.json();
        
        // Verifica se houve erro na API do Google
        if (data.error) {
            throw new Error(data.error.message || "Erro na API Gemini");
        }

        const txt = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!txt) throw new Error("Resposta da IA vazia");

        // Processa resposta (JSON ou Texto)
        let result = txt;
        if (isJson) {
            try {
                const cleanJson = txt.replace(/```json/g, '').replace(/```/g, '').trim();
                result = JSON.parse(cleanJson);
            } catch (e) {
                console.warn("Falha ao parsear JSON da IA, retornando texto puro.");
            }
        }

        // Deduz créditos (se não for admin)
        let newCredits = user.credits;
        if (user.role !== 'admin') {
            await pool.query("UPDATE users SET credits = credits - $1 WHERE id = $2", [cost, userId]);
            newCredits = user.credits - cost;
        }

        res.json({ result, new_credits: newCredits });

    } catch (err) {
        console.error("Erro na rota de IA:", err.message);
        res.status(500).json({ error: "Erro ao processar solicitação de IA." });
    }
});

// Tratamento de erro para porta em uso
const server = app.listen(port, () => {
    console.log(`🚀 Servidor COMPLETO rodando na porta ${port}`);
});

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.error(`❌ ERRO: A porta ${port} já está em uso!`);
    } else {
        console.error("❌ Erro no servidor:", e);
    }
});