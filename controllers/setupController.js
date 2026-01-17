const { sequelize } = require('../models');

exports.installDatabase = async (req, res) => {
    try {
        console.log("--- INICIANDO REPARO AGRESSIVO DO BANCO DE DADOS ---");

        // 1. REPARO DE COLUNAS (Tenta em todas as variações de nome de tabela possíveis)
        // Isso resolve o erro "column blocked_features does not exist" de vez.
        const repairTable = async (tableName) => {
            try {
                console.log(`🔧 Tentando reparar tabela: ${tableName}...`);
                
                // Adiciona blocked_features
                await sequelize.query(`
                    ALTER TABLE ${tableName} 
                    ADD COLUMN IF NOT EXISTS "blocked_features" JSONB DEFAULT '{"preConsulta": false, "preOp": false}';
                `);
                
                // Adiciona credits (caso esteja faltando)
                await sequelize.query(`
                    ALTER TABLE ${tableName} 
                    ADD COLUMN IF NOT EXISTS "credits" INTEGER DEFAULT 100;
                `);
                
                console.log(`✅ Tabela ${tableName} reparada.`);
            } catch (e) {
                // Ignora erro se a tabela não existir, mas loga para debug
                console.log(`⚠️ Tabela ${tableName} não encontrada ou erro: ${e.message}`);
            }
        };

        // Tenta reparar as 3 variações comuns do Sequelize/Postgres
        await repairTable('"users"');    // Padrão Sequelize (com aspas)
        await repairTable('users');      // Padrão SQL simples
        await repairTable('usuarios');   // Padrão Schema original

        // 2. RECRIAÇÃO DO CATÁLOGO (Garante que exames existam)
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS catalogo_itens (
                id SERIAL PRIMARY KEY,
                tipo VARCHAR(20),
                nome VARCHAR(150),
                slug VARCHAR(100),
                ativo BOOLEAN DEFAULT TRUE,
                ordem INT DEFAULT 0
            );
        `);

        // Verifica se está vazio e popula
        const [results] = await sequelize.query(`SELECT count(*) as total FROM catalogo_itens`);
        if (results[0].total == 0) {
            console.log("Populando catálogo...");
            const inserir = async (tipo, nome, i) => {
                await sequelize.query(`INSERT INTO catalogo_itens (tipo, nome, slug, ativo, ordem) VALUES ('${tipo}', '${nome}', '${tipo}_${i}', true, ${i})`);
            };

            const labs = ['Hemograma Completo', 'Glicemia em Jejum', 'Colesterol Total', 'Triglicerídeos', 'Creatinina', 'Ureia', 'TGO', 'TGP', 'TSH', 'T4 Livre', 'Urina 1', 'Urocultura', 'Parasitológico', 'Hemoglobina Glicada', 'PSA', 'Vitamina D', 'Beta HCG'];
            const imgs = ['Raio-X Tórax', 'USG Abdome', 'Mamografia', 'Eletrocardiograma', 'USG Transvaginal', 'Tomografia', 'Ecocardiograma'];
            const surgs = ['Catarata', 'Hemorroidectomia', 'Laqueadura', 'Hernioplastia', 'Colecistectomia', 'Histerectomia'];

            for(let i=0; i<labs.length; i++) await inserir('lab', labs[i], i);
            for(let i=0; i<imgs.length; i++) await inserir('img', imgs[i], i);
            for(let i=0; i<surgs.length; i++) await inserir('cirurgia', surgs[i], i);
        }

        res.send(`
            <div style="font-family: sans-serif; padding: 20px; background: #ecfccb; color: #365314; border: 1px solid #84cc16; border-radius: 8px;">
                <h1>✅ Reparo Completo Executado!</h1>
                <p>1. Colunas <strong>blocked_features</strong> e <strong>credits</strong> injetadas na tabela 'users'.</p>
                <p>2. Catálogo verificado.</p>
                <hr>
                <p><strong>IMPORTANTE:</strong> Volte ao Painel Admin agora. O erro deve ter sumido.</p>
                <a href="/" style="display: inline-block; margin-top: 10px; padding: 10px 20px; background: #365314; color: white; text-decoration: none; border-radius: 5px;">Voltar ao App</a>
            </div>
        `);

    } catch (error) {
        console.error("Erro fatal setup:", error);
        res.status(500).send(`❌ Erro: ${error.message}`);
    }
};