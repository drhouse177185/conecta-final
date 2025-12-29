const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path'); 
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração do Banco de Dados
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

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
      res.status(401).json({ success: false, message: 'Credenciais inválidas' });
    }
  } catch (err) { res.status(500).json({ error: 'Erro no servidor' }); }
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
    if (err.code === '23505') return res.status(400).json({ success: false, message: 'Usuário já existe.' });
    res.status(500).json({ error: 'Erro ao registrar' });
  }
});

// --- ROTAS ADMINISTRATIVAS ---

app.get('/api/admin/users', async (req, res) => {
    try {
        await ensureTablesExist();
        const result = await pool.query("SELECT id, name, email, cpf, age, role, credits, block_pre_consulta, block_pre_op FROM users WHERE role != 'admin' ORDER BY name ASC");
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: 'Erro ao buscar usuários' }); }
});

app.post('/api/admin/recharge', async (req, res) => {
    const { email, amount } = req.body;
    try {
        const result = await pool.query("UPDATE users SET credits = COALESCE(credits, 0) + $1 WHERE email = $2 RETURNING name, credits", [amount, email]);
        res.json({ success: true, user: result.rows[0] });
    } catch (err) { res.status(500).json({ error: 'Erro recarga' }); }
});

app.post('/api/admin/toggle-block', async (req, res) => {
    const { email, field, value } = req.body;
    if (!['block_pre_consulta', 'block_pre_op'].includes(field)) return res.status(400).json({ error: 'Campo inválido' });
    try {
        const query = field === 'block_pre_consulta' 
            ? "UPDATE users SET block_pre_consulta = $1 WHERE email = $2" 
            : "UPDATE users SET block_pre_op = $1 WHERE email = $2";
        await pool.query(query, [value, email]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Erro block' }); }
});

// --- ROTAS DO SISTEMA (DADOS) ---

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
    } catch (err) { res.status(500).json({ error: 'Erro toggle cirurgia' }); }
});

app.get('/api/exams', async (req, res) => {
    try {
        await ensureTablesExist();
        const result = await pool.query('SELECT * FROM catalog_exams WHERE is_active = true ORDER BY name ASC');
        res.json({ lab: result.rows.filter(e => e.category === 'lab'), img: result.rows.filter(e => e.category === 'img') });
    } catch (err) { res.status(500).json({ error: 'Erro exames' }); }
});

// Rota de Encaminhamentos
app.get('/api/admin/referrals', async (req, res) => {
    try {
        await ensureTablesExist();
        const result = await pool.query(`SELECT r.*, u.name as patient_name, u.cpf FROM referrals r LEFT JOIN users u ON r.user_id = u.id ORDER BY r.request_date DESC`);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: 'Erro referrals' }); }
});

app.post('/api/referrals', async (req, res) => {
    const { user_id, specialty, reason } = req.body;
    try {
        await ensureTablesExist();
        const result = await pool.query(`INSERT INTO referrals (user_id, specialty, reason) VALUES ($1, $2, $3) RETURNING *`, [user_id, specialty, reason]);
        res.json({ success: true, referral: result.rows[0] });
    } catch (err) { res.status(500).json({ error: 'Erro ao criar encaminhamento' }); }
});

// Fallback Frontend
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- POPULAÇÃO DO BANCO DE DADOS (SEED) ---
async function ensureTablesExist() {
    const createUsers = `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name VARCHAR(150) NOT NULL, email VARCHAR(150) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL, cpf VARCHAR(14) UNIQUE, age INTEGER, sex CHAR(1), role VARCHAR(20) DEFAULT 'user', block_pre_consulta BOOLEAN DEFAULT FALSE, block_pre_op BOOLEAN DEFAULT FALSE, credits INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`;
    const createReferrals = `CREATE TABLE IF NOT EXISTS referrals (id SERIAL PRIMARY KEY, user_id INTEGER, specialty VARCHAR(100), reason TEXT, status VARCHAR(20) DEFAULT 'pendente', request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`;
    const createExams = `CREATE TABLE IF NOT EXISTS catalog_exams (id SERIAL PRIMARY KEY, slug VARCHAR(100), name VARCHAR(100), category VARCHAR(20), is_active BOOLEAN DEFAULT TRUE);`;
    const createSurgeries = `CREATE TABLE IF NOT EXISTS catalog_surgeries (id SERIAL PRIMARY KEY, name VARCHAR(100), is_active BOOLEAN DEFAULT TRUE);`;

    try { 
        await pool.query(createUsers); await pool.query(createReferrals); await pool.query(createExams); await pool.query(createSurgeries);
        await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 0;");

        // 1. INSERIR EXAMES DE LABORATÓRIO (LISTA COMPLETA DA FOTO 2)
        const labExams = [
            'Hemograma Completo', 'Creatinina', 'TSH', 'Parasitológico de Fezes', 'Proteína C Reativa', 
            'Sorologia HIV 1 e 2', 'Beta HCG (Gravidez)', 'Glicemia em Jejum', 'Ureia', 'T4 Livre', 
            'Hemoglobina Glicada', 'VHS', 'VDRL (Sífilis)', 'Colesterol Total e Frações', 'TGO (AST)', 
            'Urina Tipo 1 (EAS)', 'PSA Total', 'Ferritina', 'HbsAg (Hepatite B)', 'Triglicerídeos', 
            'TGP (ALT)', 'Urocultura', 'Ácido Úrico', 'Vitamina D', 'Anti-HCV (Hepatite C)'
        ];

        // 2. INSERIR EXAMES DE IMAGEM (LISTA COMPLETA DA FOTO 3)
        const imgExams = [
            'Raio-X de Tórax', 'USG Transvaginal', 'USG de Mamas', 'USG Abdome Total', 
            'USG Próstata (Via Abdominal)', 'USG Obstétrica', 'Mamografia Bilateral', 
            'Tomografia de Crânio', 'Raio-X Seios da Face', 'Eletrocardiograma', 
            'Tomografia de Tórax', 'Ecocardiograma'
        ];

        // 3. INSERIR CIRURGIAS (LISTA COMPLETA DA FOTO 4)
        const surgeries = [
            'Correção de Catarata', 'Hernioplastia', 'Hemorroidectomia', 'Colecistectomia', 
            'Laqueadura Tubária', 'Histerectomia Total', 'Outra (Médio Porte)'
        ];

        // Função auxiliar para inserir se não existir
        for(let ex of labExams) {
            const check = await pool.query("SELECT id FROM catalog_exams WHERE name = $1", [ex]);
            if(check.rowCount === 0) await pool.query("INSERT INTO catalog_exams (name, category, slug) VALUES ($1, 'lab', $1)", [ex]);
        }
        for(let ex of imgExams) {
            const check = await pool.query("SELECT id FROM catalog_exams WHERE name = $1", [ex]);
            if(check.rowCount === 0) await pool.query("INSERT INTO catalog_exams (name, category, slug) VALUES ($1, 'img', $1)", [ex]);
        }
        for(let surg of surgeries) {
            const check = await pool.query("SELECT id FROM catalog_surgeries WHERE name = $1", [surg]);
            if(check.rowCount === 0) await pool.query("INSERT INTO catalog_surgeries (name) VALUES ($1)", [surg]);
        }

    } catch (e) { console.warn("Erro ao popular tabelas:", e.message); }
}

app.listen(PORT, () => { console.log(`Servidor rodando na porta ${PORT}`); });