const { Referral, User } = require('../models');

exports.createReferral = async (req, res) => {
    try {
        let { userId, patientName, cpf, specialty, reason } = req.body;

        // Verificação de Segurança: Se for um usuário Mock (ex: ID > 1000 ou fixo),
        // tentamos achar um usuário real ou deixamos null para não quebrar o banco.
        // Em produção, isso seria mais estrito.
        if (userId) {
            const userExists = await User.findByPk(userId);
            if (!userExists) {
                console.warn(`Usuário ID ${userId} não encontrado no banco real. Salvando encaminhamento sem vínculo.`);
                userId = null; 
            }
        }

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
        res.status(500).json({ error: 'Erro ao salvar encaminhamento.' });
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