const { Referral } = require('../models'); // Usa o modelo do Sequelize

exports.createReferral = async (req, res) => {
    try {
        const { userId, patientName, cpf, specialty, reason } = req.body;

        // Cria usando Sequelize (muito mais limpo e seguro)
        const newReferral = await Referral.create({
            userId,
            patientName,
            cpf,
            specialty,
            reason,
            status: 'pendente'
        });
        
        res.json({ success: true, referral: newReferral });

    } catch (error) {
        console.error('Erro ao criar encaminhamento:', error);
        res.status(500).json({ error: 'Erro ao salvar encaminhamento no banco.' });
    }
};

exports.getAllReferrals = async (req, res) => {
    try {
        const list = await Referral.findAll({
            order: [['createdAt', 'DESC']]
        });
        res.json(list);
    } catch (error) {
        console.error("Erro ao listar:", error);
        res.status(500).json({ error: 'Erro ao buscar encaminhamentos.' });
    }
};