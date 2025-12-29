const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path'); 
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURAÇÃO DO BANCO DE DADOS ---
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- ROTAS DE AUTENTICAÇÃO ---

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    await ensureTablesExist();
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (user && user.password_hash === password) {
      delete user.password_hash;
      res.json({ success: true, user });
    } else {
      res.status(401).json({ success: false, message: 'E-mail ou senha inválidos' });
    }
  } catch (err) {
    console.error("Erro no Login:", err);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

app.post('/api/register', async (req, res) => {
  const { name, email, password, cpf, age, sex } = req.body;
  try {
    await ensureTablesExist();
    // Define 0 créditos iniciais
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, cpf, age, sex, role, credits) 
       VALUES ($1, $2, $3, $4, $5, $6, 'user', 0) RETURNING id, name, email, role`,
      [name, email, password, cpf, age, sex]
    );
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error("Erro no Registro:", err);
    if (err.code === '23505') {
        return res.status(400).json({ success: false, message: 'Email ou CPF já cadastrados.' });
    }
    res.status(500).json({ error: 'Erro ao registrar usuário' });
  }
});

// --- ROTAS ADMINISTRATIVAS (NOVO) ---

// 1. Listar Usuários e Créditos
app.get('/api/admin/users', async (req, res) => {
    try {
        await ensureTablesExist();
        // Garante que a coluna credits existe (migração automática simples)
        await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 0;");
        
        const result = await pool.query("SELECT id, name, email, cpf, age, role, credits, block_pre_consulta, block_pre_op FROM users WHERE role != 'admin' ORDER BY name ASC");
        res.json(result.rows);
    } catch (err) {
        console.error("Erro ao listar usuários:", err);
        res.status(500).json({ error: 'Erro ao buscar usuários' });
    }
});

// 2. Recarregar Créditos
app.post('/api/admin/recharge', async (req, res) => {
    const { email, amount } = req.body;
    try {
        const result = await pool.query(
            "UPDATE users SET credits = COALESCE(credits, 0) + $1 WHERE email = $2 RETURNING name, credits",
            [amount, email]
        );
        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        console.error("Erro na recarga:", err);
        res.status(500).json({ error: 'Erro ao recarregar' });
    }
});

// --- ROTAS DO SISTEMA (EXISTENTES) ---

app.get('/api/admin/referrals', async (req, res) => {
    try {
        await ensureTablesExist();
        const result = await pool.query(`
            SELECT r.*, u.name as patient_name, u.cpf 
            FROM referrals r 
            LEFT JOIN users u ON r.user_id = u.id 
            ORDER BY r.request_date DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error("Erro ao buscar encaminhamentos:", err);
        res.status(500).json({ error: 'Erro no banco de dados' });
    }
});

app.post('/api/referrals', async (req, res) => {
    const { user_id, specialty, reason } = req.body;
    try {
        await ensureTablesExist();
        const result = await pool.query(
            `INSERT INTO referrals (user_id, specialty, reason) VALUES ($1, $2, $3) RETURNING *`,
            [user_id, specialty, reason]
        );
        res.json({ success: true, referral: result.rows[0] });
    } catch (err) {
        console.error("Erro ao criar encaminhamento:", err);
        res.status(500).json({ error: 'Erro ao criar encaminhamento' });
    }
});

app.get('/api/exams', async (req, res) => {
    try {
        await ensureTablesExist();
        const result = await pool.query('SELECT * FROM catalog_exams WHERE is_active = true');
        const lab = result.rows.filter(e => e.category === 'lab');
        const img = result.rows.filter(e => e.category === 'img');
        res.json({ lab, img });
    } catch (err) {
        console.error("Erro ao buscar exames:", err);
        res.status(500).json({ error: 'Erro ao buscar exames' });
    }
});

app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
});

// --- FUNÇÃO AUXILIAR ---
async function ensureTablesExist() {
    const createUsers = `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name VARCHAR(150) NOT NULL, email VARCHAR(150) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL, cpf VARCHAR(14) UNIQUE, age INTEGER, sex CHAR(1), role VARCHAR(20) DEFAULT 'user', block_pre_consulta BOOLEAN DEFAULT FALSE, block_pre_op BOOLEAN DEFAULT FALSE, credits INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`;
    const createReferrals = `CREATE TABLE IF NOT EXISTS referrals (id SERIAL PRIMARY KEY, user_id INTEGER, specialty VARCHAR(100), reason TEXT, status VARCHAR(20) DEFAULT 'pendente', request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`;
    const createExams = `CREATE TABLE IF NOT EXISTS catalog_exams (id SERIAL PRIMARY KEY, slug VARCHAR(50), name VARCHAR(100), category VARCHAR(20), is_active BOOLEAN DEFAULT TRUE);`;
    
    try { 
        await pool.query(createUsers); 
        await pool.query(createReferrals); 
        await pool.query(createExams);
        // Atualização de segurança para garantir coluna credits em tabelas antigas
        await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 0;");
    } catch (e) { console.warn("Aviso tables:", e.message); }
}

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});