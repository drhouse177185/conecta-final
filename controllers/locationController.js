const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

// POST /api/location/update — Paciente envia sua localização
exports.updateLocation = async (req, res) => {
    try {
        const { userId, latitude, longitude, accuracy } = req.body;

        if (!userId || latitude == null || longitude == null) {
            return res.status(400).json({ error: 'userId, latitude e longitude são obrigatórios' });
        }

        await sequelize.query(`
            INSERT INTO user_locations (user_id, latitude, longitude, accuracy, updated_at)
            VALUES (:userId, :latitude, :longitude, :accuracy, NOW())
            ON CONFLICT (user_id) DO UPDATE SET
                latitude = :latitude,
                longitude = :longitude,
                accuracy = :accuracy,
                updated_at = NOW()
        `, {
            replacements: { userId, latitude, longitude, accuracy: accuracy || null },
            type: QueryTypes.INSERT
        });

        res.json({ success: true });
    } catch (error) {
        console.error('[Location] Erro ao salvar:', error.message);
        res.status(500).json({ error: 'Erro ao salvar localização' });
    }
};

// GET /api/location/:userId — Admin consulta localização do paciente
exports.getLocation = async (req, res) => {
    try {
        const { userId } = req.params;

        const [location] = await sequelize.query(`
            SELECT latitude, longitude, accuracy, updated_at
            FROM user_locations
            WHERE user_id = :userId
        `, {
            replacements: { userId },
            type: QueryTypes.SELECT
        });

        res.json({ success: true, location: location || null });
    } catch (error) {
        console.error('[Location] Erro ao buscar:', error.message);
        res.status(500).json({ error: 'Erro ao buscar localização' });
    }
};
