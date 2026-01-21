const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

exports.createReferral = async (req, res) => {
    const { userId, patientName, cpf, specialty, reason } = req.body;

    try {
        const query = `
            INSERT INTO referrals (user_id, patient_name, cpf, specialty, reason)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *;
        `;
        const values = [userId, patientName, cpf, specialty, reason];
        
        const result = await pool.query(query, values);
        
        res.json({ success: true, referral: result.rows[0] });
    } catch (error) {
        console.error('Erro ao criar encaminhamento:', error);
        res.status(500).json({ error: 'Erro ao salvar encaminhamento.' });
    }
};

exports.getAllReferrals = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM referrals ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar encaminhamentos.' });
    }
};