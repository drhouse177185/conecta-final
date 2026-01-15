const { sequelize } = require('../models'); 
const { QueryTypes } = require('sequelize');

// --- HELPER: Formata array JS para formato Postgres '{a,b}' ---
function toPgArray(arr) {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return '{}';
    // Remove aspas simples/duplas internas para evitar quebra do SQL e formata
    const items = arr.map(item => {
        const str = String(item).replace(/"/g, '').replace(/'/g, ''); 
        return `"${str}"`;
    }).join(',');
    return `{${items}}`;
}

exports.saveHistory = async (req, res) => {
    const t = await sequelize.transaction(); 
    
    try {
        const { userId, serviceSlug, cost, details } = req.body;
        
        console.log(`[HISTORY] Salvando ${serviceSlug} para User ${userId}. Custo: ${cost}`);

        // 1. Identificar o Serviço ID
        const [service] = await sequelize.query(
            `SELECT id FROM catalogo_servicos WHERE slug = :slug`,
            { replacements: { slug: serviceSlug }, type: QueryTypes.SELECT, transaction: t }
        );
        
        if (!service) throw new Error(`Serviço '${serviceSlug}' não encontrado no catálogo.`);

        // 2. Descontar Créditos
        const [userCheck] = await sequelize.query(
            `UPDATE usuarios SET creditos = creditos - :cost WHERE id = :uid AND creditos >= :cost RETURNING creditos`,
            { replacements: { cost, uid: userId }, type: QueryTypes.UPDATE, transaction: t }
        );

        if (!userCheck || userCheck.length === 0) {
            throw new Error("Saldo insuficiente ou usuário não encontrado.");
        }

        // 3. Criar Histórico de Uso
        const [historyResults] = await sequelize.query(
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
        
        // Proteção contra retorno undefined
        const historyId = historyResults[0]?.id;
        if (!historyId) throw new Error("Falha ao gerar ID do histórico.");

        // 4. Salvar nas Tabelas Específicas (COM CASTING EXPLÍCITO)
        if (serviceSlug === 'pre_consulta') {
            await sequelize.query(
                `INSERT INTO detalhes_pre_consulta (historico_uso_id, comorbidades, exames_solicitados, rotina, dst, gravidez)
                 VALUES (:hid, CAST(:comorbs AS TEXT[]), CAST(:exams AS TEXT[]), :rot, :dst, :grav)`,
                {
                    replacements: {
                        hid: historyId,
                        comorbs: toPgArray(details.comorbidades), 
                        exams: toPgArray(details.exames),
                        rot: !!details.flags?.rotina, // Garante booleano
                        dst: !!details.flags?.dst,
                        grav: !!details.flags?.gravidez
                    },
                    type: QueryTypes.INSERT,
                    transaction: t
                }
            );
        }
        else if (serviceSlug === 'pos_consulta') {
            // Verifica e sanitiza campos da IA
            const ai = details.aiResult || {};

            const [posDetails] = await sequelize.query(
                `INSERT INTO detalhes_pos_consulta (historico_uso_id, resumo_clinico, hipoteses_diagnosticas, especialista_indicado, conduta_sugerida, procedimentos_sugeridos)
                 VALUES (:hid, :resumo, :hipoteses, :especialista, :followup, CAST(:procs AS TEXT[])) RETURNING id`,
                {
                    replacements: {
                        hid: historyId,
                        resumo: ai.summary || "Sem resumo",
                        hipoteses: ai.diagnostic_possibilities || "N/A",
                        especialista: ai.specialist || "Clínico Geral",
                        followup: ai.follow_up || "Seguir orientação médica",
                        procs: toPgArray(ai.recommended_procedures)
                    },
                    type: QueryTypes.INSERT,
                    transaction: t
                }
            );
            
            const posId = posDetails[0]?.id;
            
            if (posId && ai.findings && Array.isArray(ai.findings)) {
                for (const item of ai.findings) {
                    await sequelize.query(
                        `INSERT INTO resultados_exames_itens (detalhe_pos_consulta_id, nome_exame, valor_encontrado, status_exame, expliacao_ia)
                         VALUES (:pid, :nome, :val, :status, :expl)`,
                        {
                            replacements: {
                                pid: posId,
                                nome: item.item || "Exame",
                                val: String(item.value || ""),
                                status: item.status || "Indefinido",
                                expl: item.explanation || ""
                            },
                            type: QueryTypes.INSERT,
                            transaction: t
                        }
                    );
                }
            }
        }
        else if (serviceSlug === 'pre_operatorio') {
            const ai = details.aiResult || {};
            const isCleared = (!ai.missing_exams || ai.missing_exams.length === 0);
            
            await sequelize.query(
                `INSERT INTO analises_pre_operatorias (historico_uso_id, cirurgia_proposta, score_asa, indice_lee, exames_faltantes, status_liberacao)
                 VALUES (:hid, :cirurgia, :asa, :lee, CAST(:missing AS TEXT[]), :cleared)`,
                {
                    replacements: {
                        hid: historyId,
                        cirurgia: details.surgeryName || "Cirurgia Geral",
                        asa: ai.asa || "-",
                        lee: ai.lee || "-",
                        missing: toPgArray(ai.missing_exams),
                        cleared: isCleared
                    },
                    type: QueryTypes.INSERT,
                    transaction: t
                }
            );
        }

        await t.commit();
        console.log(`[HISTORY] Sucesso! Novo saldo: ${userCheck[0].creditos}`);
        res.json({ success: true, newCredits: userCheck[0].creditos }); 

    } catch (error) {
        if (t) await t.rollback();
        console.error("❌ ERRO NO HISTORY CONTROLLER:", error);
        res.status(500).json({ message: "Erro ao salvar dados", error: error.message });
    }
};