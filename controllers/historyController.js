const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

exports.saveHistory = async (req, res) => {
    let t; // Declara a transação fora para escopo global no try/catch

    try {
        t = await sequelize.transaction();
        const { userId, serviceSlug, cost, details } = req.body;

        console.log(`[HISTORY] INÍCIO: Processando ${serviceSlug} para User ID ${userId}. Custo: ${cost}`);

        // 2. VERIFICAÇÃO EXPLÍCITA DE SALDO (usando tabela 'users' em inglês)
        const users = await sequelize.query(
            `SELECT id, CAST(credits AS INTEGER) as credits FROM users WHERE id = :uid`,
            { replacements: { uid: userId }, type: QueryTypes.SELECT, transaction: t }
        );

        if (!users || users.length === 0) {
            await t.rollback();
            console.error(`[HISTORY] ERRO: Usuário ID ${userId} não existe no banco.`);
            return res.status(404).json({ message: "Usuário não encontrado." });
        }

        const currentUser = users[0];
        const currentBalance = Number(currentUser.credits);
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

        // 3. Descontar Créditos (Update Atômico) - usando tabela 'users' em inglês
        await sequelize.query(
            `UPDATE users SET credits = credits - :cost WHERE id = :uid`,
            { replacements: { cost: serviceCost, uid: userId }, type: QueryTypes.UPDATE, transaction: t }
        );

        // 4. Criar Histórico de Uso (usando tabela 'history' em inglês, simplificada)
        const [historyResult] = await sequelize.query(
            `INSERT INTO history (user_id, service_slug, cost, details, created_at)
             VALUES (:uid, :slug, :cost, :details::jsonb, NOW()) RETURNING id`,
            {
                replacements: {
                    uid: userId,
                    slug: serviceSlug,
                    cost: serviceCost,
                    details: JSON.stringify(details)
                },
                type: QueryTypes.INSERT,
                transaction: t
            }
        );

        const historyId = historyResult[0]?.id;
        if (!historyId) throw new Error("Falha ao gerar ID do histórico.");

        console.log(`[HISTORY] Histórico ID ${historyId} criado com sucesso.`);

        // NOTA: As tabelas específicas (detalhes_pre_consulta, detalhes_pos_consulta, etc.)
        // não existem no banco atual. Todos os dados estão salvos no campo JSON 'details'
        // da tabela 'history'. Se precisar das tabelas específicas, execute o schema.sql completo.

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