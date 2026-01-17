const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

exports.getCatalog = async (req, res) => {
    try {
        // Busca todos os itens ordenados
        const items = await sequelize.query(
            `SELECT * FROM catalogo_itens ORDER BY ordem ASC`,
            { type: QueryTypes.SELECT }
        );

        // Separa em categorias para o Frontend (Lab, Img, Cirurgia)
        const response = {
            exams: {
                lab: items.filter(i => i.tipo === 'lab'),
                img: items.filter(i => i.tipo === 'img')
            },
            surgeries: items.filter(i => i.tipo === 'cirurgia')
        };

        res.json(response);
    } catch (error) {
        console.error("Erro no catálogo:", error);
        // Retorna arrays vazios em caso de erro para não quebrar o front
        res.json({ exams: { lab: [], img: [] }, surgeries: [] });
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
        console.error("Erro no toggle:", error);
        res.status(500).json({ error: "Erro ao atualizar item" });
    }
};