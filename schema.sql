-- =============================================================================
-- SCRIPT DE CRIAÇÃO DO BANCO DE DADOS - CONECTA SAÚDE
-- Dialeto: PostgreSQL
-- Autor: Assistente (Baseado no Backend Node.js/Sequelize)
-- =============================================================================

-- Habilita extensão para UUID (caso queira usar IDs complexos no futuro)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. TABELA DE USUÁRIOS
-- Armazena os dados de login, perfil e saldo de créditos.
-- -----------------------------------------------------------------------------
CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    senha VARCHAR(255) NOT NULL, -- Hash bcrypt
    cpf VARCHAR(14), -- Formato 000.000.000-00
    idade INT CHECK (idade >= 0),
    sexo CHAR(1) CHECK (sexo IN ('M', 'F')),
    creditos INT NOT NULL DEFAULT 0 CHECK (creditos >= 0),
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    
    -- Configurações JSON para flexibilidade (ex: bloqueios do admin)
    blocked_features JSONB DEFAULT '{"preConsulta": false, "preOp": false}',
    
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE usuarios IS 'Tabela principal de contas de acesso e saldo de créditos.';
COMMENT ON COLUMN usuarios.creditos IS 'Saldo atual do usuário para gastar em serviços.';
COMMENT ON COLUMN usuarios.blocked_features IS 'Objeto JSON para controle de permissões granulares.';

-- -----------------------------------------------------------------------------
-- 2. TABELA DE SERVIÇOS (Equivalente a "Produtos" / "Uso Pré Consulta")
-- Define o catálogo do que o app oferece e quanto custa em créditos.
-- -----------------------------------------------------------------------------
CREATE TABLE catalogo_servicos (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(50) NOT NULL UNIQUE, -- Identificador único para código (ex: 'pre_consulta')
    nome VARCHAR(100) NOT NULL,
    descricao TEXT,
    preco_creditos INT NOT NULL CHECK (preco_creditos >= 0),
    ativo BOOLEAN DEFAULT TRUE, -- Se false, não aparece no app
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE catalogo_servicos IS 'Catálogo de funcionalidades (Pré-Consulta, Pós-Consulta, etc) e seus custos.';

-- -----------------------------------------------------------------------------
-- 3. TABELA DE HISTÓRICO DE USO (Equivalente a "Pedidos" / "Uso Pós Consulta")
-- Registra cada vez que um usuário gasta créditos em uma funcionalidade.
-- -----------------------------------------------------------------------------
CREATE TABLE historico_usos (
    id SERIAL PRIMARY KEY,
    usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    servico_id INT NOT NULL REFERENCES catalogo_servicos(id),
    
    -- Armazena o resultado da IA ou lista de exames gerados em JSON
    -- Isso evita criar tabelas complexas para dados variáveis
    dados_resultado JSONB, 
    
    custo_cobrado INT NOT NULL, -- Quanto custou no momento do uso (histórico de preço)
    status VARCHAR(20) DEFAULT 'Concluido' CHECK (status IN ('Pendente', 'Concluido', 'Erro')),
    data_uso TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE historico_usos IS 'Log de transações onde o usuário consumiu serviços do app.';
COMMENT ON COLUMN historico_usos.dados_resultado IS 'JSON contendo o retorno da IA (ex: lista de exames, laudo resumido).';

-- -----------------------------------------------------------------------------
-- 4. TABELA DE DETALHES PRÉ-OPERATÓRIOS (Equivalente a "Uso Pré Operatorio")
-- Tabela específica para armazenar os cálculos de risco cirúrgico.
-- -----------------------------------------------------------------------------
CREATE TABLE analises_pre_operatorias (
    id SERIAL PRIMARY KEY,
    historico_uso_id INT NOT NULL REFERENCES historico_usos(id) ON DELETE CASCADE,
    cirurgia_proposta VARCHAR(150) NOT NULL,
    score_asa VARCHAR(50), -- Classificação ASA
    indice_lee VARCHAR(50), -- Índice de Risco Cardíaco
    exames_faltantes TEXT[], -- Array de strings com exames pendentes
    data_analise TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE analises_pre_operatorias IS 'Detalhes específicos quando o serviço utilizado for Avaliação Pré-Operatória.';

-- -----------------------------------------------------------------------------
-- 5. TABELA DE PAGAMENTOS
-- Registra as recargas de créditos feitas via Mercado Pago.
-- -----------------------------------------------------------------------------
CREATE TABLE pagamentos (
    id SERIAL PRIMARY KEY,
    usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE SET NULL,
    mp_preference_id VARCHAR(150), -- ID da preferência do Mercado Pago
    mp_payment_id VARCHAR(150), -- ID do pagamento confirmado
    
    valor_reais DECIMAL(10,2) NOT NULL CHECK (valor_reais > 0),
    creditos_adicionados INT NOT NULL CHECK (creditos_adicionados > 0),
    
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'refunded')),
    metodo_pagamento VARCHAR(50), -- pix, credit_card, etc.
    data_pagamento TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE pagamentos IS 'Registro financeiro de compra de créditos.';

-- -----------------------------------------------------------------------------
-- ÍNDICES DE PERFORMANCE
-- -----------------------------------------------------------------------------

-- Busca rápida de usuário por email (Login)
CREATE INDEX idx_usuarios_email ON usuarios(email);

-- Busca rápida do histórico de um usuário específico
CREATE INDEX idx_historico_usuario ON historico_usos(usuario_id);

-- Busca rápida de pagamentos por status (para conciliação)
CREATE INDEX idx_pagamentos_status ON pagamentos(status);

-- -----------------------------------------------------------------------------
-- CARGA INICIAL DE DADOS (SEED)
-- Popula os serviços padrões do Conecta Saúde
-- -----------------------------------------------------------------------------
INSERT INTO catalogo_servicos (slug, nome, descricao, preco_creditos) VALUES 
('pre_consulta', 'Pré-Consulta Inteligente', 'Geração de guia de exames baseada em perfil e comorbidades (Choosing Wisely).', 80),
('pos_consulta', 'Análise de Exames (IA)', 'Interpretação e resumo de laudos de exames via OCR e IA.', 10),
('pre_operatorio', 'Risco Cirúrgico', 'Calculadora de risco ASA/Lee e verificação de exames pré-operatórios.', 100);

-- =============================================================================
-- EXEMPLOS DE CONSULTAS ÚTEIS (QUERIES)
-- =============================================================================

/* 1. Listar consumo do usuário:
      Mostra o nome do usuário, qual serviço usou, quanto pagou e quando.
*/
-- SELECT u.nome, s.nome AS servico, h.custo_cobrado, h.data_uso
-- FROM usuarios u
-- JOIN historico_usos h ON u.id = h.usuario_id
-- JOIN catalogo_servicos s ON h.servico_id = s.id
-- WHERE u.email = 'paciente@email.com'
-- ORDER BY h.data_uso DESC;

/* 2. Relatório Financeiro:
      Total de Reais ganhos e Total de Créditos vendidos apenas de pagamentos aprovados.
*/
-- SELECT 
--    COUNT(id) as total_transacoes,
--    SUM(valor_reais) as receita_total,
--    SUM(creditos_adicionados) as creditos_emitidos
-- FROM pagamentos
-- WHERE status = 'approved';

/* 3. Detalhes de Risco Cirúrgico:
      Busca o resultado da análise pré-operatória ligada ao usuário.
*/
-- SELECT u.nome, apo.cirurgia_proposta, apo.score_asa, apo.indice_lee
-- FROM analises_pre_operatorias apo
-- JOIN historico_usos h ON apo.historico_uso_id = h.id
-- JOIN usuarios u ON h.usuario_id = u.id;

 ... (Mantenha o código anterior)

-- -----------------------------------------------------------------------------
-- 6. DETALHES DA PRÉ-CONSULTA (NOVA)
-- Armazena o input (comorbidades) e o output (exames solicitados) estruturados.
-- -----------------------------------------------------------------------------
CREATE TABLE detalhes_pre_consulta (
    id SERIAL PRIMARY KEY,
    historico_uso_id INT NOT NULL REFERENCES historico_usos(id) ON DELETE CASCADE,
    comorbidades TEXT[], -- Array: ['HAS', 'Diabetes']
    exames_solicitados TEXT[], -- Array: ['Hemograma', 'Glicemia']
    rotina BOOLEAN DEFAULT FALSE,
    dst BOOLEAN DEFAULT FALSE,
    gravidez BOOLEAN DEFAULT FALSE
);

-- -----------------------------------------------------------------------------
-- 7. DETALHES DA PÓS-CONSULTA (NOVA)
-- Armazena o cabeçalho da análise da IA.
-- -----------------------------------------------------------------------------
CREATE TABLE detalhes_pos_consulta (
    id SERIAL PRIMARY KEY,
    historico_uso_id INT NOT NULL REFERENCES historico_usos(id) ON DELETE CASCADE,
    resumo_clinico TEXT,
    hipoteses_diagnosticas TEXT,
    especialista_indicado VARCHAR(100),
    conduta_sugerida TEXT, -- O campo follow_up
    procedimentos_sugeridos TEXT[] -- Array de exames sugeridos
);

-- -----------------------------------------------------------------------------
-- 8. ITENS DE RESULTADOS DE EXAMES (NOVA - DATA SCIENCE)
-- Cada linha de exame lida vira um registro aqui.
-- Ex: Glicemia | 99 mg/dL | Normal
-- -----------------------------------------------------------------------------
CREATE TABLE resultados_exames_itens (
    id SERIAL PRIMARY KEY,
    detalhe_pos_consulta_id INT NOT NULL REFERENCES detalhes_pos_consulta(id) ON DELETE CASCADE,
    nome_exame VARCHAR(150),
    valor_encontrado VARCHAR(100),
    status_exame VARCHAR(50), -- 'Normal', 'Alterado', 'Crítico'
    expliacao_ia TEXT
);

-- OBS: A tabela 'analises_pre_operatorias' já existe no seu schema original 
-- e atende bem, mas certifique-se que ela tem a coluna 'status_liberacao'.
ALTER TABLE analises_pre_operatorias ADD COLUMN IF NOT EXISTS status_liberacao BOOLEAN DEFAULT FALSE;