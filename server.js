// NOME DO ARQUIVO: server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer'); // Adicionado para e-mails
const crypto = require('crypto'); // Para gerar tokens únicos

const app = express();
const port = process.env.PORT || 3000;

// Configuração do Banco de Dados
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Configuração do Transportador SMTP (E-mail)
// Nota: Use variáveis de ambiente para estas credenciais
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST, // ex: smtp.gmail.com
    port: process.env.SMTP_PORT, // ex: 465 ou 587
    secure: process.env.SMTP_PORT == 465, 
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// --- ROTAS DE AUTENTICAÇÃO ---

// Login (Verifica se está ativado)
app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase().trim()]);
        if (result.rows.length === 0) return res.status(400).json({ error: "E-mail não encontrado." });
        
        const user = result.rows[0];

        // Verificar se a conta está ativada
        if (!user.is_verified) {
            return res.status(401).json({ error: "Por favor, ative a sua conta através do link enviado para o seu e-mail." });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (validPassword) {
            delete user.password_hash;
            delete user.verification_token;
            res.json({ user });
        } else {
            res.status(403).json({ error: "Senha incorreta." });
        }
    } catch (err) {
        res.status(500).json({ error: "Erro no servidor." });
    }
});

// Cadastro com Envio de E-mail de Ativação
app.post('/auth/register', async (req, res) => {
    const { name, email, password, cpf, age, sex } = req.body;
    try {
        const password_hash = await bcrypt.hash(password, 10);
        const verificationToken = crypto.randomBytes(32).toString('hex'); // Token de ativação

        const result = await pool.query(
            `INSERT INTO users (name, email, password_hash, cpf, age, sex, credits, verification_token, is_verified) 
             VALUES ($1, $2, $3, $4, $5, $6, 100, $7, false) 
             RETURNING id, name, email`,
            [name, email.toLowerCase().trim(), password_hash, cpf, age, sex, verificationToken]
        );

        const newUser = result.rows[0];
        const activationLink = `${process.env.APP_URL || 'http://localhost:3000'}/auth/verify/${verificationToken}`;

        // Enviar E-mail de Boas-vindas
        const mailOptions = {
            from: '"Conecta Saúde" <no-reply@conectasaude.com>',
            to: email,
            subject: 'Bem-vindo ao Conecta Saúde - Ative sua conta',
            html: `
                <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
                    <h2 style="color: #1e3a8a; text-align: center;">Olá, ${name}!</h2>
                    <p>Ficamos muito felizes com o seu cadastro no <strong>Conecta Saúde</strong>.</p>
                    <p>Para garantir a segurança dos seus dados médicos, precisamos que confirme o seu acesso.</p>
                    
                    <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 0;"><strong>Seus dados para conferência:</strong></p>
                        <ul style="list-style: none; padding: 0;">
                            <li>E-mail: ${email}</li>
                            <li>CPF: ${cpf}</li>
                        </ul>
                    </div>

                    <p style="text-align: center; margin-top: 30px;">
                        <a href="${activationLink}" style="background: #1e3a8a; color: white; padding: 15px 25px; text-decoration: none; font-weight: bold; border-radius: 5px; display: inline-block;">
                            CLIQUE AQUI PARA ATIVAR CONTA
                        </a>
                    </p>
                    
                    <p style="font-size: 12px; color: #777; margin-top: 40px; text-align: center;">
                        Se não reconhece este cadastro, ignore este e-mail.<br>
                        © 2026 Conecta Saúde - Sistema Integrado.
                    </p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        res.json({ message: "Cadastro realizado! Verifique o seu e-mail para ativar a conta." });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erro ao cadastrar. Verifique se o e-mail ou CPF já existem." });
    }
});

// Rota de Verificação (Ativação da Conta)
app.get('/auth/verify/:token', async (req, res) => {
    const { token } = req.params;
    try {
        const result = await pool.query(
            "UPDATE users SET is_verified = true, verification_token = NULL WHERE verification_token = $1 RETURNING name",
            [token]
        );

        if (result.rows.length === 0) {
            return res.send(`
                <div style="text-align:center; padding: 50px; font-family: sans-serif;">
                    <h1 style="color: red;">Link Inválido ou Expirado</h1>
                    <p>Não conseguimos validar esta conta. Tente fazer o login para solicitar novo link.</p>
                </div>
            `);
        }

        const userName = result.rows[0].name;
        res.send(`
            <div style="text-align:center; padding: 50px; font-family: sans-serif;">
                <h1 style="color: green;">Conta Ativada com Sucesso!</h1>
                <p>Olá ${userName}, sua conta agora está pronta para uso.</p>
                <a href="/" style="display:inline-block; margin-top:20px; padding:10px 20px; background:#1e3a8a; color:white; text-decoration:none; border-radius:5px;">IR PARA O LOGIN</a>
            </div>
        `);
    } catch (err) {
        res.status(500).send("Erro interno ao validar conta.");
    }
});

// IA (MANTIDA)
app.post('/ai/generate', async (req, res) => {
    const { prompt, cost, isJson, userId } = req.body;
    const apiKey = process.env.GOOGLE_API_KEY;

    if (!userId) return res.status(401).json({ error: "Utilizador não identificado." });

    try {
        const userRes = await pool.query("SELECT credits, role FROM users WHERE id = $1", [userId]);
        const user = userRes.rows[0];
        
        if (user.role !== 'admin' && user.credits < cost) return res.status(402).json({ error: "Créditos insuficientes." });

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: isJson ? prompt + "\nResponda APENAS JSON." : prompt }] }] })
        });

        const data = await response.json();
        const txt = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        let result = txt;
        if (isJson) result = JSON.parse(txt.replace(/```json/g, '').replace(/```/g, '').trim());

        let newCredits = user.credits;
        if (user.role !== 'admin') {
            newCredits = user.credits - cost;
            await pool.query("UPDATE users SET credits = $1 WHERE id = $2", [newCredits, userId]);
        }

        res.json({ result, new_credits: newCredits });
    } catch (err) {
        res.status(500).json({ error: "Erro na IA." });
    }
});

app.listen(port, () => console.log(`🚀 Sistema Online com Ativação por E-mail na porta ${port}`));