const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path'); 
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURAÇÃO DO BANCO DE DADOS ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Tenta usar a URL completa da Render primeiro
  ssl: { rejectUnauthorized: false }
});

// Fallback se não tiver DATABASE_URL (configuração manual)
if (!process.env.DATABASE_URL) {
    pool.options = {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
        ssl: { rejectUnauthorized: false }
    };
}

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
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, cpf, age, sex, role, credits) 
       VALUES ($1, $2, $3, $4, $5, $6, 'user', 0) RETURNING id, name, email, role`,
      [name, email, password, cpf, age, sex]
    );
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error("Erro no Registro:", err);
    if (err.code === '23505') return res.status(400).json({ success: false, message: 'Email ou CPF já cadastrados.' });
    res.status(500).json({ error: 'Erro ao registrar usuário' });
  }
});

// --- ROTAS ADMINISTRATIVAS (ATUALIZADO) ---

// Listar Usuários com Status de Bloqueio
app.get('/api/admin/users', async (req, res) => {
    try {
        await ensureTablesExist();
        const result = await pool.query("SELECT id, name, email, cpf, age, role, credits, block_pre_consulta, block_pre_op FROM users WHERE role != 'admin' ORDER BY name ASC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar usuários' });
    }
});

// Recarregar Créditos
app.post('/api/admin/recharge', async (req, res) => {
    const { email, amount } = req.body;
    try {
        const result = await pool.query("UPDATE users SET credits = COALESCE(credits, 0) + $1 WHERE email = $2 RETURNING name, credits", [amount, email]);
        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao recarregar' });
    }
});

// Alternar Bloqueios (Toggles) - NOVO
app.post('/api/admin/toggle-block', async (req, res) => {
    const { email, field, value } = req.body; // field deve ser 'block_pre_consulta' ou 'block_pre_op'
    if (!['block_pre_consulta', 'block_pre_op'].includes(field)) return res.status(400).json({ error: 'Campo inválido' });
    
    try {
        // query segura usando formatação de identificador não é nativa simples no pg, vamos usar lógica direta
        const query = field === 'block_pre_consulta' 
            ? "UPDATE users SET block_pre_consulta = $1 WHERE email = $2" 
            : "UPDATE users SET block_pre_op = $1 WHERE email = $2";
            
        await pool.query(query, [value, email]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao atualizar bloqueio' });
    }
});

// --- ROTAS DO SISTEMA ---

// Catálogo de Cirurgias - NOVO
app.get('/api/surgeries', async (req, res) => {
    try {
        await ensureTablesExist();
        const result = await pool.query('SELECT * FROM catalog_surgeries ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: 'Erro cirurgias' }); }
});

app.post('/api/surgeries/toggle', async (req, res) => {
    const { id, is_active } = req.body;
    try {
        await pool.query('UPDATE catalog_surgeries SET is_active = $1 WHERE id = $2', [is_active, id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Erro update cirurgia' }); }
});

// Encaminhamentos
app.get('/api/admin/referrals', async (req, res) => {
    try {
        await ensureTablesExist();
        const result = await pool.query(`SELECT r.*, u.name as patient_name, u.cpf FROM referrals r LEFT JOIN users u ON r.user_id = u.id ORDER BY r.request_date DESC`);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: 'Erro BD' }); }
});

app.post('/api/referrals', async (req, res) => {
    const { user_id, specialty, reason } = req.body;
    try {
        await ensureTablesExist();
        const result = await pool.query(`INSERT INTO referrals (user_id, specialty, reason) VALUES ($1, $2, $3) RETURNING *`, [user_id, specialty, reason]);
        res.json({ success: true, referral: result.rows[0] });
    } catch (err) { res.status(500).json({ error: 'Erro criar encaminhamento' }); }
});

// Exames
app.get('/api/exams', async (req, res) => {
    try {
        await ensureTablesExist();
        const result = await pool.query('SELECT * FROM catalog_exams WHERE is_active = true');
        res.json({ lab: result.rows.filter(e => e.category === 'lab'), img: result.rows.filter(e => e.category === 'img') });
    } catch (err) { res.status(500).json({ error: 'Erro exames' }); }
});

app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
});

// --- CRIAÇÃO DE TABELAS ---
async function ensureTablesExist() {
    const createUsers = `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name VARCHAR(150) NOT NULL, email VARCHAR(150) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL, cpf VARCHAR(14) UNIQUE, age INTEGER, sex CHAR(1), role VARCHAR(20) DEFAULT 'user', block_pre_consulta BOOLEAN DEFAULT FALSE, block_pre_op BOOLEAN DEFAULT FALSE, credits INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`;
    const createReferrals = `CREATE TABLE IF NOT EXISTS referrals (id SERIAL PRIMARY KEY, user_id INTEGER, specialty VARCHAR(100), reason TEXT, status VARCHAR(20) DEFAULT 'pendente', request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`;
    const createExams = `CREATE TABLE IF NOT EXISTS catalog_exams (id SERIAL PRIMARY KEY, slug VARCHAR(50), name VARCHAR(100), category VARCHAR(20), is_active BOOLEAN DEFAULT TRUE);`;
    const createSurgeries = `CREATE TABLE IF NOT EXISTS catalog_surgeries (id SERIAL PRIMARY KEY, name VARCHAR(100), is_active BOOLEAN DEFAULT TRUE);`;

    try { 
        await pool.query(createUsers); 
        await pool.query(createReferrals); 
        await pool.query(createExams);
        await pool.query(createSurgeries);
        
        // Garante colunas em tabelas antigas
        await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 0;");
        await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS block_pre_consulta BOOLEAN DEFAULT FALSE;");
        await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS block_pre_op BOOLEAN DEFAULT FALSE;");
        
        // Seed Cirurgias se vazio
        const surgs = await pool.query("SELECT count(*) FROM catalog_surgeries");
        if(surgs.rows[0].count == 0) {
            await pool.query("INSERT INTO catalog_surgeries (name) VALUES ('Correção de Catarata'), ('Hérnia Inguinal'), ('Colecistectomia (Vesícula)'), ('Hemorroidectomia'), ('Laqueadura Tubária'), ('Vasectomia')");
        }
    } catch (e) { console.warn("Aviso tables:", e.message); }
}

app.listen(PORT, () => { console.log(`Servidor rodando na porta ${PORT}`); });