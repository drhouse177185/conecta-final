// NOME DO ARQUIVO: server.js
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// Carrega variáveis (apenas localmente)
const dotenvResult = require('dotenv').config();

console.log("\n=========================================");
console.log("🔍 INICIANDO SERVIDOR CONECTA SAÚDE");
console.log("=========================================");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(__dirname));
app.use(express.json({ limit: '50mb' }));
app.use(cors());

// Rota Principal
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send("Erro: index.html não encontrado.");
    }
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

// Configuração do E-mail (Gmail) - BLINDADA CONTRA ERROS
// 1. Removemos TODOS os espaços da senha e das variáveis
const smtpHost = (process.env.SMTP_HOST || 'smtp.gmail.com').trim();
// Forçamos a porta 587 se não estiver definida, pois a 465 bloqueia muito no Render
const smtpPort = Number(process.env.SMTP_PORT) || 587; 
const smtpUser = (process.env.SMTP_USER || '').trim();
// IMPORTANTE: Removemos espaços internos da senha (ex: "abc def" vira "abcdef")
const smtpPass = (process.env.SMTP_PASS || '').replace(/\s+/g, '');

console.log(`📧 Configurando E-mail: Host=${smtpHost}, Porta=${smtpPort}, User=${smtpUser ? '***' : 'Faltando'}`);

const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465, // False para 587 (TLS), True para 465 (SSL)
    auth: {
        user: smtpUser,
        pass: smtpPass
    },
    tls: {
        rejectUnauthorized: false
    },
    // Timeouts maiores para evitar erros de rede
    connectionTimeout: 10000, 
    greetingTimeout: 10000
});

// Inicialização do Banco
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
        console.log("✅ Tabela users verificada.");
        clientDb.release();
    } catch (err) {
        console.error("❌ Erro Banco:", err.message);
    }
}
initDB();

// --- ROTAS DE AUTENTICAÇÃO ---

app.post('/auth/register', async (req, res) => {
    const { name, email, password, cpf, age, sex } = req.body;
    
    // Validação básica
    if (!email || !password || !name) {
        return res.status(400).json({ error: "Preencha todos os campos obrigatórios." });
    }

    try {
        // 1. Verificar se já existe (Evita erro 500)
        const checkUser = await pool.query("SELECT id FROM users WHERE email = $1 OR cpf = $2", [email, cpf]);
        if (checkUser.rows.length > 0) {
            return res.status(400).json({ error: "E-mail ou CPF já cadastrados." });
        }

        // 2. Criar usuário (Hash e Token)
        const password_hash = await bcrypt.hash(password, 10);
        const verificationToken = crypto.randomBytes(32).toString('hex');

        await pool.query(
            `INSERT INTO users (name, email, password_hash, cpf, age, sex, credits, verification_token, is_verified) 
             VALUES ($1, $2, $3, $4, $5, $6, 100, $7, false)`,
            [name, email.toLowerCase().trim(), password_hash, cpf, age, sex, verificationToken]
        );

        // 3. Tentar Enviar E-mail (Com rollback em caso de erro)
        // Limpa a URL do APP para garantir que é válida
        let baseUrl = process.env.APP_URL || `https://${req.get('host')}`;
        if (baseUrl.includes('google.com')) baseUrl = `https://${req.get('host')}`; // Fallback se a env estiver errada
        
        const activationLink = `${baseUrl}/auth/verify/${verificationToken}`;

        try {
            await transporter.sendMail({
                from: `"Conecta Saúde" <${smtpUser}>`,
                to: email,
                subject: 'Ative sua conta - Conecta Saúde',
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4;">
                        <div style="background-color: white; padding: 20px; border-radius: 8px; text-align: center;">
                            <h2 style="color: #1e3a8a;">Bem-vindo(a), ${name}!</h2>
                            <p>Sua conta foi criada. Clique no botão abaixo para ativar:</p>
                            <a href="${activationLink}" style="background-color: #16a34a; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">ATIVAR CONTA</a>
                            <p style="font-size: 12px; color: #888; margin-top: 20px;">Se o botão não funcionar, copie: ${activationLink}</p>
                        </div>
                    </div>
                `
            });
            res.json({ message: "Cadastro realizado! Verifique seu e-mail." });

        } catch (emailError) {
            console.error("❌ Falha no envio de e-mail:", emailError);
            
            // ROLLBACK: Apaga o usuário se o e-mail falhar, para ele poder tentar de novo
            await pool.query("DELETE FROM users WHERE email = $1", [email]);
            
            return res.status(500).json({ 
                error: "Erro ao conectar com Gmail. Verifique a senha de app ou tente mais tarde." 
            });
        }

    } catch (err) {
        console.error("Erro no registro:", err);
        res.status(500).json({ error: "Erro interno no servidor." });
    }
});

app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase().trim()]);
        if (result.rows.length === 0) return res.status(400).json({ error: "Usuário não encontrado." });
        
        const user = result.rows[0];
        if (!user.is_verified) return res.status(401).json({ error: "Sua conta ainda não foi ativada. Verifique seu e-mail." });

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

// NOVA ROTA: Recuperação de Senha
app.post('/auth/recover-password', async (req, res) => {
    const { cpf } = req.body;
    if (!cpf) return res.status(400).json({ error: "CPF obrigatório." });

    try {
        const result = await pool.query("SELECT * FROM users WHERE cpf = $1", [cpf]);
        if (result.rows.length === 0) return res.status(404).json({ error: "CPF não encontrado." });

        const user = result.rows[0];
        const newPassword = crypto.randomBytes(4).toString('hex');
        const newHash = await bcrypt.hash(newPassword, 10);

        await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [newHash, user.id]);
        res.json({ newPassword });

    } catch (err) {
        console.error("Erro ao recuperar senha:", err);
        res.status(500).json({ error: "Erro ao processar recuperação." });
    }
});

app.get('/auth/verify/:token', async (req, res) => {
    const { token } = req.params;
    try {
        const result = await pool.query(
            "UPDATE users SET is_verified = true, verification_token = NULL WHERE verification_token = $1 RETURNING name",
            [token]
        );
        if (result.rows.length === 0) return res.send(`
            <div style="text-align: center; padding: 50px; font-family: sans-serif;">
                <h1 style="color: #dc2626;">Link Inválido ou Expirado</h1>
                <p>Este link já foi usado ou não existe.</p>
                <a href="/">Voltar ao início</a>
            </div>
        `);
        
        res.send(`
            <div style="text-align: center; padding: 50px; font-family: sans-serif;">
                <h1 style="color: #16a34a;">Conta Ativada com Sucesso!</h1>
                <p>Parabéns ${result.rows[0].name}, você já pode acessar o sistema.</p>
                <a href="/" style="background: #1e3a8a; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Ir para Login</a>
            </div>
        `);
    } catch (err) {
        res.status(500).send("Erro na ativação.");
    }
});

app.post('/ai/generate', async (req, res) => {
    const { prompt, cost, isJson, userId } = req.body;
    const apiKey = process.env.GOOGLE_API_KEY;

    if (!userId) return res.status(401).json({ error: "Faça login novamente." });

    try {
        const userRes = await pool.query("SELECT credits, role FROM users WHERE id = $1", [userId]);
        if(userRes.rows.length === 0) return res.status(404).json({ error: "Usuário não encontrado" });
        
        const user = userRes.rows[0];

        if (user.role !== 'admin' && user.credits < cost) return res.status(402).json({ error: "Créditos insuficientes. Recarregue sua conta." });

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: isJson ? prompt + "\nResponda APENAS JSON puro." : prompt }] }] })
        });

        const data = await response.json();
        
        if (data.error) throw new Error(data.error.message);
        
        const txt = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!txt) throw new Error("A IA não retornou resposta.");

        let result = txt;
        if (isJson) {
            try { 
                result = JSON.parse(txt.replace(/```json/g, '').replace(/```/g, '').trim()); 
            } catch(e) {
                console.warn("Falha no parse JSON da IA");
            }
        }

        let newCredits = user.credits;
        if (user.role !== 'admin') {
            await pool.query("UPDATE users SET credits = credits - $1 WHERE id = $2", [cost, userId]);
            newCredits -= cost;
        }

        res.json({ result, new_credits: newCredits });
    } catch (err) {
        console.error("Erro IA:", err.message);
        res.status(500).json({ error: "Erro ao processar IA: " + err.message });
    }
});

app.listen(port, () => console.log(`🚀 Servidor rodando na porta ${port}`));