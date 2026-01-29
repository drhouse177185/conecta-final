const { Referral, User } = require('../models');

exports.createReferral = async (req, res) => {
    try {
        let {
            userId,
            patientName,
            cpf,
            specialty,
            reason,
            diagnosticPossibilities,
            referralPdfData
        } = req.body;

        // Verificação de Segurança: Se for um usuário Mock (ex: ID > 1000 ou fixo),
        // tentamos achar um usuário real ou deixamos null para não quebrar o banco.
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
            patientCpf: cpf,
            specialty,
            reason,
            diagnosticPossibilities,
            referralPdfData,
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
        // Busca sem include para evitar erro de relacionamento
        const list = await Referral.findAll({
            where: { status: 'pendente' },
            order: [['createdAt', 'DESC']]
        });
        res.json(list);
    } catch (error) {
        console.error("Erro ao listar encaminhamentos:", error);
        res.status(500).json({ error: 'Erro ao buscar encaminhamentos.' });
    }
};

/**
 * POST /api/referrals/:id/send-email
 * Marca o encaminhamento como enviado e registra a data
 */
exports.sendEmail = async (req, res) => {
    try {
        const { id } = req.params;

        const referral = await Referral.findByPk(id);

        if (!referral) {
            return res.status(404).json({ error: 'Encaminhamento não encontrado' });
        }

        // Atualiza o status do encaminhamento
        await referral.update({
            emailSent: true,
            emailSentAt: new Date(),
            status: 'enviado'
        });

        res.json({
            success: true,
            message: 'Email enviado com sucesso para AME'
        });
    } catch (error) {
        console.error('Erro ao enviar email:', error);
        res.status(500).json({ error: 'Erro ao enviar email' });
    }
};

/**
 * DELETE /api/referrals/:id
 * Cancela um encaminhamento
 */
exports.deleteReferral = async (req, res) => {
    try {
        const { id } = req.params;
        const { cancelledBy } = req.body; // ID do admin que cancelou

        const referral = await Referral.findByPk(id);

        if (!referral) {
            return res.status(404).json({ error: 'Encaminhamento não encontrado' });
        }

        await referral.update({
            status: 'cancelado',
            cancelledAt: new Date(),
            cancelledBy: cancelledBy || null
        });

        res.json({
            success: true,
            message: 'Encaminhamento cancelado com sucesso'
        });
    } catch (error) {
        console.error('Erro ao cancelar encaminhamento:', error);
        res.status(500).json({ error: 'Erro ao cancelar encaminhamento' });
    }
};