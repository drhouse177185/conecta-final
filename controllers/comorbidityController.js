const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

// ====================================================================
// SALVAR/ATUALIZAR COMORBIDADE
// Quando o usuário marca ou desmarca uma comorbidade
// ====================================================================
exports.toggleComorbidity = async (req, res) => {
    try {
        const { userId, comorbidity, isActive } = req.body;

        if (!userId || !comorbidity) {
            return res.status(400).json({ error: 'userId e comorbidity são obrigatórios.' });
        }

        // Verifica se já existe registro dessa comorbidade para este usuário
        const existing = await sequelize.query(
            `SELECT id, is_active, removed_by_admin
             FROM user_comorbidities
             WHERE user_id = :userId AND comorbidity = :comorbidity`,
            {
                replacements: { userId, comorbidity },
                type: QueryTypes.SELECT
            }
        );

        if (existing.length > 0) {
            // JÁ EXISTE: Atualiza o status (marca/desmarca)
            const record = existing[0];

            // Se foi removida pelo admin, não permite reativar
            if (record.removed_by_admin) {
                return res.status(403).json({
                    error: 'Esta comorbidade foi removida pelo administrador e não pode ser reativada.'
                });
            }

            await sequelize.query(
                `UPDATE user_comorbidities
                 SET is_active = :isActive, last_updated_at = NOW()
                 WHERE id = :id`,
                {
                    replacements: { isActive, id: record.id },
                    type: QueryTypes.UPDATE
                }
            );

            console.log(`✅ Comorbidade "${comorbidity}" atualizada para user ${userId}: ${isActive ? 'ATIVA' : 'INATIVA'}`);

            res.json({
                success: true,
                action: 'updated',
                message: isActive ? 'Comorbidade marcada.' : 'Comorbidade desmarcada (mantida no histórico).'
            });
        } else {
            // NÃO EXISTE: Cria novo registro
            await sequelize.query(
                `INSERT INTO user_comorbidities (user_id, comorbidity, is_active, first_marked_at)
                 VALUES (:userId, :comorbidity, :isActive, NOW())`,
                {
                    replacements: { userId, comorbidity, isActive },
                    type: QueryTypes.INSERT
                }
            );

            console.log(`✅ Nova comorbidade "${comorbidity}" registrada para user ${userId}`);

            res.json({
                success: true,
                action: 'created',
                message: 'Comorbidade registrada no histórico médico.'
            });
        }
    } catch (error) {
        console.error('❌ Erro ao salvar comorbidade:', error);
        res.status(500).json({ error: 'Erro ao salvar comorbidade.', details: error.message });
    }
};

// ====================================================================
// LISTAR COMORBIDADES DE UM USUÁRIO
// Retorna as comorbidades ativas (para preencher checkboxes)
// ====================================================================
exports.getUserComorbidities = async (req, res) => {
    try {
        const { userId } = req.params;

        const comorbidities = await sequelize.query(
            `SELECT
                id,
                comorbidity,
                is_active,
                is_custom,
                confirmed_at,
                first_marked_at,
                last_updated_at
             FROM user_comorbidities
             WHERE user_id = :userId AND removed_by_admin = false
             ORDER BY first_marked_at DESC`,
            {
                replacements: { userId },
                type: QueryTypes.SELECT
            }
        );

        res.json({
            success: true,
            comorbidities: comorbidities
        });
    } catch (error) {
        console.error('❌ Erro ao listar comorbidades:', error);
        res.status(500).json({ error: 'Erro ao buscar comorbidades.' });
    }
};

// ====================================================================
// VER HISTÓRICO COMPLETO (inclui desmarcadas)
// Para página de perfil médico
// ====================================================================
exports.getFullHistory = async (req, res) => {
    try {
        const { userId } = req.params;

        const history = await sequelize.query(
            `SELECT
                id,
                comorbidity,
                is_active,
                removed_by_admin,
                admin_removal_reason,
                first_marked_at,
                last_updated_at,
                removed_at
             FROM user_comorbidities
             WHERE user_id = :userId
             ORDER BY first_marked_at DESC`,
            {
                replacements: { userId },
                type: QueryTypes.SELECT
            }
        );

        res.json({
            success: true,
            history: history
        });
    } catch (error) {
        console.error('❌ Erro ao buscar histórico:', error);
        res.status(500).json({ error: 'Erro ao buscar histórico.' });
    }
};

// ====================================================================
// ADMIN: REMOVER COMORBIDADE DO HISTÓRICO
// Apenas administradores podem fazer remoção permanente
// ====================================================================
exports.adminRemoveComorbidity = async (req, res) => {
    try {
        const { comorbidityId, reason } = req.body;

        if (!comorbidityId) {
            return res.status(400).json({ error: 'comorbidityId é obrigatório.' });
        }

        await sequelize.query(
            `UPDATE user_comorbidities
             SET
                removed_by_admin = true,
                admin_removal_reason = :reason,
                removed_at = NOW()
             WHERE id = :id`,
            {
                replacements: { id: comorbidityId, reason: reason || 'Sem motivo informado' },
                type: QueryTypes.UPDATE
            }
        );

        console.log(`🔒 ADMIN removeu comorbidade ID ${comorbidityId}. Motivo: ${reason}`);

        res.json({
            success: true,
            message: 'Comorbidade removida do histórico pelo administrador.'
        });
    } catch (error) {
        console.error('❌ Erro ao remover comorbidade:', error);
        res.status(500).json({ error: 'Erro ao remover comorbidade.' });
    }
};

// ====================================================================
// CONFIRMAR COMORBIDADES EM LOTE
// Quando o usuário clica em "Confirmar Comorbidades"
// ====================================================================
exports.confirmComorbidities = async (req, res) => {
    let t;
    try {
        const { userId, comorbidities, otherComorbidities } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'userId é obrigatório.' });
        }

        t = await sequelize.transaction();
        const savedComorbidities = [];

        // 1. Salvar comorbidades dos checkboxes
        if (comorbidities && Array.isArray(comorbidities)) {
            for (const comorbidity of comorbidities) {
                // Verifica se já existe
                const existing = await sequelize.query(
                    `SELECT id, removed_by_admin FROM user_comorbidities
                     WHERE user_id = :userId AND comorbidity = :comorbidity`,
                    {
                        replacements: { userId, comorbidity },
                        type: QueryTypes.SELECT,
                        transaction: t
                    }
                );

                if (existing.length > 0 && existing[0].removed_by_admin) {
                    continue; // Pula se foi removida pelo admin
                }

                if (existing.length > 0) {
                    // Atualiza existente
                    await sequelize.query(
                        `UPDATE user_comorbidities
                         SET is_active = true, confirmed_at = NOW(), last_updated_at = NOW()
                         WHERE id = :id`,
                        {
                            replacements: { id: existing[0].id },
                            type: QueryTypes.UPDATE,
                            transaction: t
                        }
                    );
                } else {
                    // Cria nova
                    await sequelize.query(
                        `INSERT INTO user_comorbidities
                         (user_id, comorbidity, is_active, is_custom, confirmed_at, first_marked_at)
                         VALUES (:userId, :comorbidity, true, false, NOW(), NOW())`,
                        {
                            replacements: { userId, comorbidity },
                            type: QueryTypes.INSERT,
                            transaction: t
                        }
                    );
                }
                savedComorbidities.push(comorbidity);
            }
        }

        // 2. Salvar comorbidade customizada (campo "Outras")
        if (otherComorbidities && otherComorbidities.trim().length > 0) {
            const customComorbidity = otherComorbidities.trim();

            const existing = await sequelize.query(
                `SELECT id FROM user_comorbidities
                 WHERE user_id = :userId AND comorbidity = :comorbidity`,
                {
                    replacements: { userId, comorbidity: customComorbidity },
                    type: QueryTypes.SELECT,
                    transaction: t
                }
            );

            if (existing.length === 0) {
                await sequelize.query(
                    `INSERT INTO user_comorbidities
                     (user_id, comorbidity, is_active, is_custom, confirmed_at, first_marked_at)
                     VALUES (:userId, :comorbidity, true, true, NOW(), NOW())`,
                    {
                        replacements: { userId, comorbidity: customComorbidity },
                        type: QueryTypes.INSERT,
                        transaction: t
                    }
                );
                savedComorbidities.push(customComorbidity);
            }
        }

        await t.commit();

        console.log(`✅ Comorbidades confirmadas para user ${userId}:`, savedComorbidities);

        res.json({
            success: true,
            message: `${savedComorbidities.length} comorbidade(s) confirmada(s) e salva(s) no histórico médico.`,
            savedComorbidities: savedComorbidities
        });

    } catch (error) {
        if (t) await t.rollback();
        console.error('❌ Erro ao confirmar comorbidades:', error);
        res.status(500).json({ error: 'Erro ao salvar comorbidades.', details: error.message });
    }
};

// ====================================================================
// ADMIN: LISTAR TODAS AS COMORBIDADES (todos os usuários)
// Para painel de administração
// ====================================================================
exports.adminGetAllComorbidities = async (req, res) => {
    try {
        const allComorbidities = await sequelize.query(
            `SELECT
                uc.id,
                uc.user_id,
                u.name as user_name,
                u.email as user_email,
                uc.comorbidity,
                uc.is_active,
                uc.is_custom,
                uc.confirmed_at,
                uc.removed_by_admin,
                uc.first_marked_at,
                uc.last_updated_at
             FROM user_comorbidities uc
             LEFT JOIN users u ON uc.user_id = u.id
             ORDER BY uc.first_marked_at DESC`,
            {
                type: QueryTypes.SELECT
            }
        );

        res.json({
            success: true,
            total: allComorbidities.length,
            comorbidities: allComorbidities
        });
    } catch (error) {
        console.error('❌ Erro ao listar todas comorbidades:', error);
        res.status(500).json({ error: 'Erro ao buscar dados.' });
    }
};
