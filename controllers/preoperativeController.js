const PreoperativeAssessment = require('../models/PreoperativeAssessment');
const emailService = require('../services/emailService');

// Salvar nova avaliacao pre-operatoria
const saveAssessment = async (req, res) => {
    try {
        const {
            userId,
            patientName,
            patientAge,
            patientCpf,
            surgeryName,
            clearanceStatus,
            missingExams,
            asaScore,
            leeIndex,
            aiReport
        } = req.body;

        // Validacoes basicas
        if (!userId) {
            return res.status(400).json({ error: 'userId e obrigatorio' });
        }
        if (!patientName) {
            return res.status(400).json({ error: 'patientName e obrigatorio' });
        }
        if (!patientAge) {
            return res.status(400).json({ error: 'patientAge e obrigatorio' });
        }
        if (!patientCpf) {
            return res.status(400).json({ error: 'patientCpf e obrigatorio' });
        }
        if (!surgeryName) {
            return res.status(400).json({ error: 'surgeryName e obrigatorio' });
        }

        // Criar registro na tabela
        const assessment = await PreoperativeAssessment.create({
            userId,
            patientName,
            patientAge: parseInt(patientAge),
            patientCpf,
            surgeryName,
            clearanceStatus: clearanceStatus || 'pendente',
            missingExams: missingExams || [],
            asaScore: asaScore || null,
            leeIndex: leeIndex || null,
            aiReport: aiReport || null
        });

        console.log(`[PreOp] Avaliacao salva com sucesso - ID: ${assessment.id}, Paciente: ${patientName}, Cirurgia: ${surgeryName}, Status: ${clearanceStatus}`);

        return res.status(201).json({
            success: true,
            message: 'Avaliacao pre-operatoria salva com sucesso',
            assessment: {
                id: assessment.id,
                patientName: assessment.patientName,
                surgeryName: assessment.surgeryName,
                clearanceStatus: assessment.clearanceStatus,
                createdAt: assessment.created_at
            }
        });

    } catch (error) {
        console.error('[PreOp] Erro ao salvar avaliacao:', error);
        return res.status(500).json({
            error: 'Erro interno ao salvar avaliacao pre-operatoria',
            details: error.message
        });
    }
};

// Listar todas as avaliacoes (para admin)
const getAllAssessments = async (req, res) => {
    try {
        const assessments = await PreoperativeAssessment.findAll({
            order: [['created_at', 'DESC']]
        });

        return res.status(200).json({
            success: true,
            total: assessments.length,
            assessments
        });

    } catch (error) {
        console.error('[PreOp] Erro ao listar avaliacoes:', error);
        return res.status(500).json({
            error: 'Erro interno ao listar avaliacoes',
            details: error.message
        });
    }
};

// Listar avaliacoes de um usuario especifico
const getUserAssessments = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({ error: 'userId e obrigatorio' });
        }

        const assessments = await PreoperativeAssessment.findAll({
            where: { userId: parseInt(userId) },
            order: [['created_at', 'DESC']]
        });

        return res.status(200).json({
            success: true,
            total: assessments.length,
            assessments
        });

    } catch (error) {
        console.error('[PreOp] Erro ao listar avaliacoes do usuario:', error);
        return res.status(500).json({
            error: 'Erro interno ao listar avaliacoes',
            details: error.message
        });
    }
};

// Buscar avaliacao por ID
const getAssessmentById = async (req, res) => {
    try {
        const { id } = req.params;

        const assessment = await PreoperativeAssessment.findByPk(id);

        if (!assessment) {
            return res.status(404).json({ error: 'Avaliacao nao encontrada' });
        }

        return res.status(200).json({
            success: true,
            assessment
        });

    } catch (error) {
        console.error('[PreOp] Erro ao buscar avaliacao:', error);
        return res.status(500).json({
            error: 'Erro interno ao buscar avaliacao',
            details: error.message
        });
    }
};

// Atualizar status da avaliacao (liberado, pendente, cancelado)
const updateStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        // Validar status
        const validStatuses = ['liberado', 'pendente', 'cancelado'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                error: 'Status invalido. Use: liberado, pendente ou cancelado'
            });
        }

        const assessment = await PreoperativeAssessment.findByPk(id);

        if (!assessment) {
            return res.status(404).json({ error: 'Avaliacao nao encontrada' });
        }

        // Atualizar status
        assessment.clearanceStatus = status;
        await assessment.save();

        console.log(`[PreOp] Status atualizado - ID: ${id}, Novo Status: ${status}`);

        return res.status(200).json({
            success: true,
            message: `Status atualizado para ${status}`,
            assessment: {
                id: assessment.id,
                patientName: assessment.patientName,
                clearanceStatus: assessment.clearanceStatus
            }
        });

    } catch (error) {
        console.error('[PreOp] Erro ao atualizar status:', error);
        return res.status(500).json({
            error: 'Erro interno ao atualizar status',
            details: error.message
        });
    }
};

// Enviar email de liberacao cirurgica para Gestao Cirurgica
const sendClearanceEmail = async (req, res) => {
    try {
        const { id } = req.params;
        const { patientName, surgeryName, fileName, pdfBase64 } = req.body;

        const assessment = await PreoperativeAssessment.findByPk(id);

        if (!assessment) {
            return res.status(404).json({ error: 'Avaliacao nao encontrada' });
        }

        // Extrair dados do assessment
        const patientCpf = assessment.patientCpf;
        const asaScore = assessment.asaScore;
        const leeIndex = assessment.leeIndex;

        console.log(`[PreOp] Enviando email de liberacao - ID: ${id}, Paciente: ${patientName}, Cirurgia: ${surgeryName}`);

        // Enviar email real via Gmail
        const emailResult = await emailService.sendSurgicalClearanceEmail({
            patientName,
            patientCpf,
            surgeryName,
            asaScore,
            leeIndex,
            pdfBase64,
            fileName
        });

        console.log(`[PreOp] Email enviado com sucesso! Message ID: ${emailResult.messageId}`);

        return res.status(200).json({
            success: true,
            message: 'Email de liberacao cirurgica enviado com sucesso',
            emailSentTo: emailResult.destination,
            assessment: {
                id: assessment.id,
                patientName: assessment.patientName,
                surgeryName: assessment.surgeryName
            }
        });

    } catch (error) {
        console.error('[PreOp] Erro ao enviar email de liberacao:', error);
        return res.status(500).json({
            error: 'Erro ao enviar email. Verifique as configuracoes SMTP.',
            details: error.message
        });
    }
};

module.exports = {
    saveAssessment,
    getAllAssessments,
    getUserAssessments,
    getAssessmentById,
    updateStatus,
    sendClearanceEmail
};
