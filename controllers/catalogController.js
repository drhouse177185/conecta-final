const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

exports.getCatalog = async (req, res) => {
    try {
        // Busca tudo ordenado
        const items = await sequelize.query(
            `SELECT * FROM catalogo_itens ORDER BY ordem ASC`,
            { type: QueryTypes.SELECT }
        );

        // Separação vital para o Frontend funcionar
        const response = {
            exams: {
                lab: items.filter(i => i.tipo === 'lab'),
                img: items.filter(i => i.tipo === 'img') // Aqui estão os itens da Foto 3
            },
            surgeries: items.filter(i => i.tipo === 'cirurgia')
        };

        res.json(response);
    } catch (error) {
        console.error("Erro catálogo:", error);
        res.status(500).json({ error: "Erro ao buscar catálogo" });
    }
};

exports.toggleItem = async (req, res) => {
    try {
        const { id, ativo } = req.body;
        await sequelize.query(
            `UPDATE catalogo_itens SET ativo = :ativo WHERE id = :id`,
            { replacements: { ativo, id }, type: QueryTypes.UPDATE }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Erro update" });
    }
};