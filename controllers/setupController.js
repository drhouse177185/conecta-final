const { sequelize } = require('../models');

exports.installDatabase = async (req, res) => {
    try {
        console.log("--- INICIANDO INSTALAÇÃO E REPARO DO BANCO DE DADOS ---");

        // 1. CRIAÇÃO DAS TABELAS (Para bancos novos)
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

        // =========================================================================
        // 2. COMANDOS DE REPARO (A MÁGICA AQUI!)
        // Isso conserta tabelas antigas que foram criadas sem essa coluna
        // =========================================================================
        console.log("🛠️ Verificando e reparando colunas ausentes...");
        
        await sequelize.query(`
            ALTER TABLE usuarios 
            ADD COLUMN IF NOT EXISTS blocked_features JSONB DEFAULT '{"preConsulta": false, "preOp": false}';
        `).catch(e => console.log("Aviso: Tentativa de reparar 'blocked_features' em usuarios."));

        // Se por acaso seu banco criou como 'users' (padrão inglês), repara também
        await sequelize.query(`
            ALTER TABLE IF EXISTS users 
            ADD COLUMN IF NOT EXISTS blocked_features JSONB DEFAULT '{"preConsulta": false, "preOp": false}';
        `).catch(e => console.log("Aviso: Tabela 'users' não existe, ignorando."));

        // =========================================================================

        // 3. Criação das Outras Tabelas
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

        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS detalhes_pre_consulta (
                id SERIAL PRIMARY KEY,
                historico_uso_id INT NOT NULL REFERENCES historico_usos(id) ON DELETE CASCADE,
                comorbidades TEXT[],
                exames_solicitados TEXT[],
                rotina BOOLEAN DEFAULT FALSE,
                dst BOOLEAN DEFAULT FALSE,
                gravidez BOOLEAN DEFAULT FALSE
            );
        `);

        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS detalhes_pos_consulta (
                id SERIAL PRIMARY KEY,
                historico_uso_id INT NOT NULL REFERENCES historico_usos(id) ON DELETE CASCADE,
                resumo_clinico TEXT,
                hipoteses_diagnosticas TEXT,
                especialista_indicado VARCHAR(100),
                conduta_sugerida TEXT,
                procedimentos_sugeridos TEXT[]
            );
        `);

        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS resultados_exames_itens (
                id SERIAL PRIMARY KEY,
                detalhe_pos_consulta_id INT NOT NULL REFERENCES detalhes_pos_consulta(id) ON DELETE CASCADE,
                nome_exame VARCHAR(150),
                valor_encontrado VARCHAR(100),
                status_exame VARCHAR(50),
                expliacao_ia TEXT
            );
        `);
        
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS analises_pre_operatorias (
                id SERIAL PRIMARY KEY,
                historico_uso_id INT NOT NULL REFERENCES historico_usos(id) ON DELETE CASCADE,
                cirurgia_proposta VARCHAR(150) NOT NULL,
                score_asa VARCHAR(50),
                indice_lee VARCHAR(50),
                exames_faltantes TEXT[],
                data_analise TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status_liberacao BOOLEAN DEFAULT FALSE
            );
        `);

        // Garante coluna status_liberacao
        await sequelize.query(`ALTER TABLE analises_pre_operatorias ADD COLUMN IF NOT EXISTS status_liberacao BOOLEAN DEFAULT FALSE;`)
              .catch(e => {});

        // 4. População do Catálogo (Seed)
        const [results] = await sequelize.query(`SELECT count(*) as total FROM catalogo_servicos`);
        
        if (results[0].total == 0) {
            console.log("Populando catálogo de serviços...");
            await sequelize.query(`
                INSERT INTO catalogo_servicos (slug, nome, descricao, preco_creditos) VALUES 
                ('pre_consulta', 'Pré-Consulta Inteligente', 'Geração de guia de exames baseada em perfil e comorbidades.', 80),
                ('pos_consulta', 'Análise de Exames (IA)', 'Interpretação e resumo de laudos de exames via OCR e IA.', 10),
                ('pre_operatorio', 'Risco Cirúrgico', 'Calculadora de risco ASA/Lee e verificação de exames pré-operatórios.', 100);
            `);
        }

        console.log("--- INSTALAÇÃO E REPARO CONCLUÍDOS ---");
        
        res.send(`
            <div style="font-family: sans-serif; padding: 20px; background: #dcfce7; color: #166534; border-radius: 8px; border: 1px solid #166534;">
                <h1>✅ Banco de Dados Reparado com Sucesso!</h1>
                <p>As colunas ausentes (blocked_features) foram adicionadas.</p>
                <hr style="border-color: #166534; opacity: 0.3;">
                <p><strong>Próximo passo:</strong> Volte ao Painel Admin e recarregue a página.</p>
                <a href="/" style="display: inline-block; margin-top: 10px; padding: 10px 20px; background: #166534; color: white; text-decoration: none; border-radius: 5px;">Voltar ao App</a>
            </div>
        `);

    } catch (error) {
        console.error("Erro na instalação:", error);
        res.status(500).send(`❌ Erro: ${error.message}`);
    }
};