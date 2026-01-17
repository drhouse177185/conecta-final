const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

// Retorna todos os itens organizados para o Frontend
exports.getCatalog = async (req, res) => {
    try {
        const items = await sequelize.query(
            `SELECT * FROM catalogo_itens ORDER BY ordem ASC`,
            { type: QueryTypes.SELECT }
        );

        // Organiza em categorias para facilitar o uso no front
        const response = {
            exams: {
                lab: items.filter(i => i.tipo === 'lab'),
                img: items.filter(i => i.tipo === 'img')
            },
            surgeries: items.filter(i => i.tipo === 'cirurgia')
        };

        res.json(response);
    } catch (error) {
        console.error("Erro ao buscar catálogo:", error);
        res.status(500).json({ error: "Erro ao buscar catálogo" });
    }
};

// Alterna o status (Ativo/Inativo) - Ação do Admin
exports.toggleItem = async (req, res) => {
    try {
        const { id, ativo } = req.body;
        
        await sequelize.query(
            `UPDATE catalogo_itens SET ativo = :ativo WHERE id = :id`,
            { 
                replacements: { ativo, id },
                type: QueryTypes.UPDATE 
            }
        );

        res.json({ success: true });
    } catch (error) {
        console.error("Erro ao atualizar item:", error);
        res.status(500).json({ error: "Erro ao atualizar item" });
    }
};