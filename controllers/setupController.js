const sequelize = require('../models');

exports.installDatabase = async (req, res) => {
    try {
        console.log("--- INICIANDO INSTALAÇÃO DO BANCO DE DADOS ---");

        // 1. Criação das Tabelas (se não existirem)
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
        
        // Verifica se a tabela analises_pre_operatorias existe, senão cria
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

        // Garante que a coluna status_liberacao exista (caso a tabela já existisse antes)
        try {
            await sequelize.query(`ALTER TABLE analises_pre_operatorias ADD COLUMN IF NOT EXISTS status_liberacao BOOLEAN DEFAULT FALSE;`);
        } catch(e) { console.log("Coluna status_liberacao já existe ou erro ignorável."); }


        // 2. População do Catálogo (Seed)
        // Primeiro verificamos se já tem dados para não duplicar
        const [results] = await sequelize.query(`SELECT count(*) as total FROM catalogo_servicos`);
        
        if (results[0].total == 0) {
            console.log("Populando catálogo de serviços...");
            await sequelize.query(`
                INSERT INTO catalogo_servicos (slug, nome, descricao, preco_creditos) VALUES 
                ('pre_consulta', 'Pré-Consulta Inteligente', 'Geração de guia de exames baseada em perfil e comorbidades.', 80),
                ('pos_consulta', 'Análise de Exames (IA)', 'Interpretação e resumo de laudos de exames via OCR e IA.', 10),
                ('pre_operatorio', 'Risco Cirúrgico', 'Calculadora de risco ASA/Lee e verificação de exames pré-operatórios.', 100);
            `);
        } else {
            console.log("Catálogo já populado.");
        }

        console.log("--- INSTALAÇÃO CONCLUÍDA COM SUCESSO ---");
        res.json({ success: true, message: "Banco de dados atualizado e populado com sucesso!" });

    } catch (error) {
        console.error("Erro na instalação:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};