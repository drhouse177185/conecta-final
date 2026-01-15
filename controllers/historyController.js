// --- CORREÇÃO: Voltamos com as chaves { } para extrair a instância corretamente ---
const { sequelize } = require('../models'); 
const { QueryTypes } = require('sequelize');

exports.saveHistory = async (req, res) => {
    // Inicia transação segura
    const t = await sequelize.transaction(); 
    
    try {
        const { userId, serviceSlug, cost, details } = req.body;
        
        // 1. Identificar o Serviço ID
        const [service] = await sequelize.query(
            `SELECT id FROM catalogo_servicos WHERE slug = :slug`,
            { replacements: { slug: serviceSlug }, type: QueryTypes.SELECT, transaction: t }
        );
        
        if (!service) throw new Error("Serviço não encontrado");

        // 2. Descontar Créditos do Usuário
        const [userCheck] = await sequelize.query(
            `UPDATE usuarios SET creditos = creditos - :cost WHERE id = :uid AND creditos >= :cost RETURNING creditos`,
            { replacements: { cost, uid: userId }, type: QueryTypes.UPDATE, transaction: t }
        );

        if (!userCheck || userCheck.length === 0) {
            throw new Error("Saldo insuficiente no servidor.");
        }

        // 3. Criar Histórico de Uso
        const [history] = await sequelize.query(
            `INSERT INTO historico_usos (usuario_id, servico_id, custo_cobrado, status, dados_resultado) 
             VALUES (:uid, :sid, :cost, 'Concluido', :rawJson) RETURNING id`,
            { 
                replacements: { 
                    uid: userId, 
                    sid: service.id, 
                    cost, 
                    rawJson: JSON.stringify(details) 
                }, 
                type: QueryTypes.INSERT, 
                transaction: t 
            }
        );
        
        const historyId = history[0].id;

        // 4. Salvar nas Tabelas Específicas
        if (serviceSlug === 'pre_consulta') {
            await sequelize.query(
                `INSERT INTO detalhes_pre_consulta (historico_uso_id, comorbidades, exames_solicitados, rotina, dst, gravidez)
                 VALUES (:hid, :comorbs, :exams, :rot, :dst, :grav)`,
                {
                    replacements: {
                        hid: historyId,
                        comorbs: details.comorbidades || [], 
                        exams: details.exames || [],
                        rot: details.flags.rotina,
                        dst: details.flags.dst,
                        grav: details.flags.gravidez
                    },
                    type: QueryTypes.INSERT,
                    transaction: t
                }
            );
        }
        else if (serviceSlug === 'pos_consulta') {
            const [posDetails] = await sequelize.query(
                `INSERT INTO detalhes_pos_consulta (historico_uso_id, resumo_clinico, hipoteses_diagnosticas, especialista_indicado, conduta_sugerida, procedimentos_sugeridos)
                 VALUES (:hid, :resumo, :hipoteses, :especialista, :followup, :procs) RETURNING id`,
                {
                    replacements: {
                        hid: historyId,
                        resumo: details.aiResult.summary,
                        hipoteses: details.aiResult.diagnostic_possibilities,
                        especialista: details.aiResult.specialist,
                        followup: details.aiResult.follow_up,
                        procs: details.aiResult.recommended_procedures
                    },
                    type: QueryTypes.INSERT,
                    transaction: t
                }
            );
            
            const posId = posDetails[0].id;
            if (details.aiResult.findings && details.aiResult.findings.length > 0) {
                for (const item of details.aiResult.findings) {
                    await sequelize.query(
                        `INSERT INTO resultados_exames_itens (detalhe_pos_consulta_id, nome_exame, valor_encontrado, status_exame, expliacao_ia)
                         VALUES (:pid, :nome, :val, :status, :expl)`,
                        {
                            replacements: {
                                pid: posId,
                                nome: item.item,
                                val: item.value,
                                status: item.status,
                                expl: item.explanation
                            },
                            type: QueryTypes.INSERT,
                            transaction: t
                        }
                    );
                }
            }
        }
        else if (serviceSlug === 'pre_operatorio') {
            const isCleared = (!details.aiResult.missing_exams || details.aiResult.missing_exams.length === 0);
            
            await sequelize.query(
                `INSERT INTO analises_pre_operatorias (historico_uso_id, cirurgia_proposta, score_asa, indice_lee, exames_faltantes, status_liberacao)
                 VALUES (:hid, :cirurgia, :asa, :lee, :missing, :cleared)`,
                {
                    replacements: {
                        hid: historyId,
                        cirurgia: details.surgeryName,
                        asa: details.aiResult.asa,
                        lee: details.aiResult.lee,
                        missing: details.aiResult.missing_exams || [],
                        cleared: isCleared
                    },
                    type: QueryTypes.INSERT,
                    transaction: t
                }
            );
        }

        await t.commit();
        res.json({ success: true, newCredits: userCheck[0].creditos }); 

    } catch (error) {
        if (t) await t.rollback();
        console.error("Erro ao salvar histórico:", error);
        res.status(500).json({ message: "Erro ao salvar dados", error: error.message });
    }
};