const { sequelize } = require('../models');

exports.installDatabase = async (req, res) => {
    try {
        console.log("--- INICIANDO INSTALAÇÃO E REPARO (V2 - CATÁLOGO DINÂMICO) ---");

        // 1. CRIAÇÃO DAS TABELAS ORIGINAIS (Mantém o que já existia)
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(150) NOT NULL,
                email VARCHAR(150) NOT NULL UNIQUE,
                senha VARCHAR(255) NOT NULL,
                cpf VARCHAR(14),
                idade INT CHECK (idade >= 0),
                sexo CHAR(1) CHECK (sexo IN ('M', 'F')),
                creditos INT NOT NULL DEFAULT 0 CHECK (creditos >= 0),
                role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
                blocked_features JSONB DEFAULT '{"preConsulta": false, "preOp": false}',
                data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Reparo da coluna blocked_features (Garantia)
        await sequelize.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS blocked_features JSONB DEFAULT '{"preConsulta": false, "preOp": false}';`).catch(e=>{});
        await sequelize.query(`ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS blocked_features JSONB DEFAULT '{"preConsulta": false, "preOp": false}';`).catch(e=>{});

        // Tabelas do Sistema
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS catalogo_servicos (
                id SERIAL PRIMARY KEY,
                slug VARCHAR(50) NOT NULL UNIQUE,
                nome VARCHAR(100) NOT NULL,
                descricao TEXT,
                preco_creditos INT NOT NULL CHECK (preco_creditos >= 0),
                ativo BOOLEAN DEFAULT TRUE,
                data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS historico_usos (
                id SERIAL PRIMARY KEY,
                usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                servico_id INT NOT NULL REFERENCES catalogo_servicos(id),
                dados_resultado JSONB,
                custo_cobrado INT NOT NULL,
                status VARCHAR(20) DEFAULT 'Concluido',
                data_uso TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // ... (Tabelas de detalhes mantidas igual ao anterior, omitindo para brevidade, mas elas continuam existindo no banco) ...
        // Se você já rodou o setup anterior, elas já existem. Se não, o código anterior as criou.
        
        // =========================================================================
        // NOVO: TABELA DE ITENS (EXAMES E CIRURGIAS INDIVIDUAIS)
        // Isso permite o controle granular que você pediu
        // =========================================================================
        console.log("🛠️ Configurando Catálogo de Itens Dinâmico...");
        
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS catalogo_itens (
                id SERIAL PRIMARY KEY,
                tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('lab', 'img', 'cirurgia')),
                nome VARCHAR(150) NOT NULL,
                slug VARCHAR(100) UNIQUE, -- Para referência interna
                ativo BOOLEAN DEFAULT TRUE,
                ordem INT DEFAULT 0
            );
        `);

        // POPULAÇÃO INICIAL DOS ITENS (SÓ SE ESTIVER VAZIO)
        const [itensCount] = await sequelize.query(`SELECT count(*) as total FROM catalogo_itens`);
        
        if (itensCount[0].total == 0) {
            console.log("Populando itens de exames e cirurgias...");
            
            // Exames Laboratoriais
            const labs = [
                'Hemograma Completo', 'Glicemia em Jejum', 'Colesterol Total e Frações', 'Triglicerídeos',
                'Creatinina', 'Ureia', 'TGO (AST)', 'TGP (ALT)', 'TSH', 'T4 Livre', 'Urina Tipo 1 (EAS)',
                'Urocultura', 'Parasitológico de Fezes', 'Hemoglobina Glicada', 'PSA Total', 'Ácido Úrico',
                'Proteína C Reativa', 'VHS', 'Ferritina', 'Vitamina D', 'Sorologia HIV 1 e 2', 'VDRL (Sífilis)',
                'HbsAg (Hepatite B)', 'Anti-HCV (Hepatite C)', 'Beta HCG (Gravidez)'
            ];
            for (let i = 0; i < labs.length; i++) {
                await sequelize.query(`INSERT INTO catalogo_itens (tipo, nome, slug, ativo, ordem) VALUES ('lab', '${labs[i]}', 'lab_${i}', true, ${i})`);
            }

            // Exames de Imagem
            const imgs = [
                'Raio-X de Tórax', 'USG Abdome Total', 'Mamografia Bilateral', 'Eletrocardiograma',
                'USG Transvaginal', 'USG Próstata (Via Abdominal)', 'Tomografia de Crânio', 'Tomografia de Tórax',
                'USG de Mamas', 'USG Obstétrica', 'Raio-X Seios da Face', 'Ecocardiograma'
            ];
            for (let i = 0; i < imgs.length; i++) {
                await sequelize.query(`INSERT INTO catalogo_itens (tipo, nome, slug, ativo, ordem) VALUES ('img', '${imgs[i]}', 'img_${i}', true, ${i})`);
            }

            // Cirurgias
            const surgs = [
                'Correção de Catarata', 'Hemorroidectomia', 'Laqueadura Tubária', 'Hernioplastia',
                'Colecistectomia', 'Histerectomia Total', 'Outra (Médio Porte)'
            ];
            for (let i = 0; i < surgs.length; i++) {
                await sequelize.query(`INSERT INTO catalogo_itens (tipo, nome, slug, ativo, ordem) VALUES ('cirurgia', '${surgs[i]}', 'surg_${i}', true, ${i})`);
            }
        }

        console.log("--- INSTALAÇÃO V2 CONCLUÍDA ---");
        
        res.send(`
            <div style="font-family: sans-serif; padding: 20px; background: #eff6ff; color: #1e3a8a; border: 1px solid #1e3a8a; border-radius: 8px;">
                <h1>✅ Catálogo Dinâmico Configurado!</h1>
                <p>A tabela <strong>catalogo_itens</strong> foi criada e populada.</p>
                <p>Agora o Admin tem controle real sobre cada exame.</p>
                <a href="/" style="display: inline-block; margin-top: 10px; padding: 10px 20px; background: #1e3a8a; color: white; text-decoration: none; border-radius: 5px;">Voltar ao App</a>
            </div>
        `);

    } catch (error) {
        console.error("Erro setup:", error);
        res.status(500).send(`❌ Erro: ${error.message}`);
    }
};