const { sequelize } = require('../models'); 
const { QueryTypes } = require('sequelize');

// --- HELPER: Formata array JS para formato Postgres '{a,b}' ---
function toPgArray(arr) {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return '{}';
    const items = arr.map(item => {
        const str = String(item).replace(/"/g, '').replace(/'/g, ''); 
        return `"${str}"`;
    }).join(',');
    return `{${items}}`;
}

exports.saveHistory = async (req, res) => {
    let t; // Declara a transação fora para escopo global no try/catch

    try {
        t = await sequelize.transaction(); 
        const { userId, serviceSlug, cost, details } = req.body;
        
        console.log(`[HISTORY] INÍCIO: Processando ${serviceSlug} para User ID ${userId}. Custo: ${cost}`);

        // 1. Identificar o Serviço ID
        const [services] = await sequelize.query(
            `SELECT id FROM catalogo_servicos WHERE slug = :slug`,
            { replacements: { slug: serviceSlug }, type: QueryTypes.SELECT, transaction: t }
        );
        
        if (!services) {
            throw new Error(`Serviço '${serviceSlug}' não encontrado ou inativo.`);
        }
        const serviceId = services.id; // Correção na extração do ID

        // 2. VERIFICAÇÃO EXPLÍCITA DE SALDO
        // Forçamos a conversão para Int para evitar erros de tipo string vs number
        const users = await sequelize.query(
            `SELECT id, CAST(creditos AS INTEGER) as creditos FROM usuarios WHERE id = :uid`,
            { replacements: { uid: userId }, type: QueryTypes.SELECT, transaction: t }
        );

        if (!users || users.length === 0) {
            await t.rollback();
            console.error(`[HISTORY] ERRO: Usuário ID ${userId} não existe no banco.`);
            return res.status(404).json({ message: "Usuário não encontrado." });
        }

        const currentUser = users[0];
        const currentBalance = Number(currentUser.creditos);
        const serviceCost = Number(cost);

        console.log(`[HISTORY] AUDITORIA: User ${userId} | Saldo: ${currentBalance} | Custo: ${serviceCost}`);

        if (currentBalance < serviceCost) {
            await t.rollback();
            console.warn(`[HISTORY] FALHA: Saldo insuficiente.`);
            return res.status(402).json({ 
                success: false, 
                message: `Saldo insuficiente. Você tem ${currentBalance} créditos, mas precisa de ${serviceCost}.`,
                currentCredits: currentBalance 
            });
        }

        // 3. Descontar Créditos (Update Atômico)
        await sequelize.query(
            `UPDATE usuarios SET creditos = creditos - :cost WHERE id = :uid`,
            { replacements: { cost: serviceCost, uid: userId }, type: QueryTypes.UPDATE, transaction: t }
        );

        // 4. Criar Histórico de Uso
        const [historyResult] = await sequelize.query(
            `INSERT INTO historico_usos (usuario_id, servico_id, custo_cobrado, status, dados_resultado) 
             VALUES (:uid, :sid, :cost, 'Concluido', :rawJson) RETURNING id`,
            { 
                replacements: { 
                    uid: userId, 
                    sid: serviceId, 
                    cost: serviceCost, 
                    rawJson: JSON.stringify(details) 
                }, 
                type: QueryTypes.INSERT, 
                transaction: t 
            }
        );
        
        const historyId = historyResult[0]?.id;
        if (!historyId) throw new Error("Falha ao gerar ID do histórico.");

        // 5. Salvar nas Tabelas Específicas
        if (serviceSlug === 'pre_consulta') {
            await sequelize.query(
                `INSERT INTO detalhes_pre_consulta (historico_uso_id, comorbidades, exames_solicitados, rotina, dst, gravidez)
                 VALUES (:hid, CAST(:comorbs AS TEXT[]), CAST(:exams AS TEXT[]), :rot, :dst, :grav)`,
                {
                    replacements: {
                        hid: historyId,
                        comorbs: toPgArray(details.comorbidades), 
                        exams: toPgArray(details.exames),
                        rot: !!details.flags?.rotina,
                        dst: !!details.flags?.dst,
                        grav: !!details.flags?.gravidez
                    },
                    type: QueryTypes.INSERT,
                    transaction: t
                }
            );
        }
        else if (serviceSlug === 'pos_consulta') {
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
        
        const newBalance = currentBalance - serviceCost;
        console.log(`[HISTORY] SUCESSO! Novo saldo do User ${userId}: ${newBalance}`);
        res.json({ success: true, newCredits: newBalance }); 

    } catch (error) {
        if (t) await t.rollback();
        console.error("❌ ERRO NO HISTORY CONTROLLER:", error.message);
        // Retorna erro detalhado para facilitar debug no frontend
        res.status(500).json({ message: "Erro interno no servidor.", debug: error.message });
    }
};