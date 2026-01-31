const PreConsultaSession = require('../models/PreConsultaSession');
const PosConsultaAnalysis = require('../models/PosConsultaAnalysis');
const PreoperativeAssessment = require('../models/PreoperativeAssessment');

// ===== PRÉ-CONSULTA =====

// Salvar sessão de pré-consulta (lista de exames gerados)
const savePreConsulta = async (req, res) => {
    try {
        const { userId, examList, comorbiditiesUsed } = req.body;

        if (!userId || !examList || !Array.isArray(examList)) {
            return res.status(400).json({ error: 'userId e examList são obrigatórios' });
        }

        // Criar nova sessão
        const session = await PreConsultaSession.create({
            userId,
            examList,
            comorbiditiesUsed: comorbiditiesUsed || null,
            isConfirmed: false
        });

        console.log(`[Session] Pré-consulta salva - User: ${userId}, Exames: ${examList.length}`);

        return res.status(201).json({
            success: true,
            message: 'Sessão de pré-consulta salva',
            session: {
                id: session.id,
                examList: session.examList,
                createdAt: session.created_at
            }
        });

    } catch (error) {
        console.error('[Session] Erro ao salvar pré-consulta:', error);
        return res.status(500).json({ error: 'Erro ao salvar sessão', details: error.message });
    }
};

// Buscar última sessão de pré-consulta do usuário
const getLatestPreConsulta = async (req, res) => {
    try {
        const { userId } = req.params;

        const session = await PreConsultaSession.findOne({
            where: { userId: parseInt(userId) },
            order: [['created_at', 'DESC']]
        });

        if (!session) {
            return res.status(404).json({ message: 'Nenhuma sessão encontrada' });
        }

        return res.status(200).json({
            success: true,
            session
        });

    } catch (error) {
        console.error('[Session] Erro ao buscar pré-consulta:', error);
        return res.status(500).json({ error: 'Erro ao buscar sessão', details: error.message });
    }
};

// Confirmar exames da pré-consulta
const confirmPreConsulta = async (req, res) => {
    try {
        const { id } = req.params;

        const session = await PreConsultaSession.findByPk(id);

        if (!session) {
            return res.status(404).json({ error: 'Sessão não encontrada' });
        }

        session.isConfirmed = true;
        session.confirmedAt = new Date();
        await session.save();

        console.log(`[Session] Pré-consulta confirmada - ID: ${id}`);

        return res.status(200).json({
            success: true,
            message: 'Exames confirmados',
            session
        });

    } catch (error) {
        console.error('[Session] Erro ao confirmar pré-consulta:', error);
        return res.status(500).json({ error: 'Erro ao confirmar', details: error.message });
    }
};

// ===== PÓS-CONSULTA =====

// Salvar análise de pós-consulta
const savePosConsulta = async (req, res) => {
    try {
        const { userId, patientName, analysisResult, findings, filesProcessed } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'userId é obrigatório' });
        }

        const analysis = await PosConsultaAnalysis.create({
            userId,
            patientName: patientName || null,
            analysisResult: analysisResult || null,
            findings: findings || null,
            filesProcessed: filesProcessed || 0
        });

        console.log(`[Session] Pós-consulta salva - User: ${userId}, Arquivos: ${filesProcessed}`);

        return res.status(201).json({
            success: true,
            message: 'Análise de pós-consulta salva',
            analysis: {
                id: analysis.id,
                createdAt: analysis.created_at
            }
        });

    } catch (error) {
        console.error('[Session] Erro ao salvar pós-consulta:', error);
        return res.status(500).json({ error: 'Erro ao salvar análise', details: error.message });
    }
};

// Buscar última análise de pós-consulta do usuário
const getLatestPosConsulta = async (req, res) => {
    try {
        const { userId } = req.params;

        const analysis = await PosConsultaAnalysis.findOne({
            where: { userId: parseInt(userId) },
            order: [['created_at', 'DESC']]
        });

        if (!analysis) {
            return res.status(404).json({ message: 'Nenhuma análise encontrada' });
        }

        return res.status(200).json({
            success: true,
            analysis
        });

    } catch (error) {
        console.error('[Session] Erro ao buscar pós-consulta:', error);
        return res.status(500).json({ error: 'Erro ao buscar análise', details: error.message });
    }
};

// ===== CARREGAR TODAS AS SESSÕES DO USUÁRIO (para login) =====

const getUserSavedSessions = async (req, res) => {
    try {
        const { userId } = req.params;

        // Buscar última pré-consulta
        const preConsulta = await PreConsultaSession.findOne({
            where: { userId: parseInt(userId) },
            order: [['created_at', 'DESC']]
        });

        // Buscar última pós-consulta
        const posConsulta = await PosConsultaAnalysis.findOne({
            where: { userId: parseInt(userId) },
            order: [['created_at', 'DESC']]
        });

        // Buscar última avaliação pré-operatória
        const preOperatorio = await PreoperativeAssessment.findOne({
            where: { userId: parseInt(userId) },
            order: [['created_at', 'DESC']]
        });

        return res.status(200).json({
            success: true,
            sessions: {
                preConsulta: preConsulta || null,
                posConsulta: posConsulta || null,
                preOperatorio: preOperatorio || null
            }
        });

    } catch (error) {
        console.error('[Session] Erro ao buscar sessões:', error);
        return res.status(500).json({ error: 'Erro ao buscar sessões', details: error.message });
    }
};

module.exports = {
    savePreConsulta,
    getLatestPreConsulta,
    confirmPreConsulta,
    savePosConsulta,
    getLatestPosConsulta,
    getUserSavedSessions
};
