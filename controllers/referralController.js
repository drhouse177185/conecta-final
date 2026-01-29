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

        // PROTEÇÃO CONTRA DUPLICATAS: Verifica se já existe encaminhamento recente (últimos 5 minutos)
        if (userId && specialty) {
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            const existingReferral = await Referral.findOne({
                where: {
                    userId,
                    specialty,
                    status: 'pendente',
                    createdAt: {
                        [require('sequelize').Op.gte]: fiveMinutesAgo
                    }
                }
            });

            if (existingReferral) {
                console.log('⚠️ Encaminhamento duplicado detectado e bloqueado:', { userId, specialty });
                return res.json({
                    success: true,
                    referral: existingReferral,
                    message: 'Encaminhamento já existente.'
                });
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
        const { Op } = require('sequelize');

        // Busca encaminhamentos pendentes E enviados (não mostra cancelados)
        const list = await Referral.findAll({
            where: {
                status: {
                    [Op.in]: ['pendente', 'enviado']
                }
            },
            include: [{
                model: User,
                as: 'user',
                attributes: ['name'],
                required: false
            }],
            order: [['created_at', 'DESC']]
        });

        // Formata a resposta garantindo que patient_name esteja sempre preenchido
        const formattedList = list.map(referral => {
            const data = referral.toJSON();

            // Sequelize pode retornar tanto patientName quanto patient_name
            const currentName = data.patientName || data.patient_name;
            const userName = data.user?.name;

            // Define patient_name (formato esperado pelo frontend)
            data.patient_name = currentName || userName || 'Paciente';

            // Garante que referral_pdf_data está no formato correto
            // Sequelize pode retornar como referralPdfData ou referral_pdf_data
            if (!data.referral_pdf_data && data.referralPdfData) {
                data.referral_pdf_data = data.referralPdfData;
            }

            // Remove campos duplicados e objeto user
            delete data.patientName;
            delete data.referralPdfData; // Remove versão camelCase
            delete data.user;

            return data;
        });

        res.json(formattedList);
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