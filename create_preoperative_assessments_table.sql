-- ================================================================
-- CRIA TABELA DE AVALIACOES PRE-OPERATORIAS
-- ================================================================
-- Execute este script no DBeaver para criar a tabela de avaliacoes
-- Data: 30/01/2026
-- ================================================================

CREATE TABLE IF NOT EXISTS preoperative_assessments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    patient_name VARCHAR(255) NOT NULL,
    patient_age INTEGER NOT NULL,
    patient_cpf VARCHAR(20) NOT NULL,
    surgery_name VARCHAR(255) NOT NULL,
    clearance_status VARCHAR(50) NOT NULL DEFAULT 'pendente',  -- 'liberado' ou 'pendente'
    missing_exams TEXT[],  -- Array de exames pendentes (se houver)
    asa_score VARCHAR(50),  -- Score ASA (ASA I, II, III, etc)
    lee_index VARCHAR(50),  -- Indice de Lee
    ai_report TEXT,  -- Relatorio completo da IA
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indices para performance
CREATE INDEX IF NOT EXISTS idx_preop_user_id ON preoperative_assessments(user_id);
CREATE INDEX IF NOT EXISTS idx_preop_status ON preoperative_assessments(clearance_status);
CREATE INDEX IF NOT EXISTS idx_preop_surgery ON preoperative_assessments(surgery_name);
CREATE INDEX IF NOT EXISTS idx_preop_created_at ON preoperative_assessments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_preop_cpf ON preoperative_assessments(patient_cpf);

-- Comentarios nas colunas
COMMENT ON TABLE preoperative_assessments IS 'Tabela de avaliacoes pre-operatorias geradas no calculo de risco';
COMMENT ON COLUMN preoperative_assessments.user_id IS 'ID do usuario que realizou a avaliacao';
COMMENT ON COLUMN preoperative_assessments.patient_name IS 'Nome do paciente';
COMMENT ON COLUMN preoperative_assessments.patient_age IS 'Idade do paciente';
COMMENT ON COLUMN preoperative_assessments.patient_cpf IS 'CPF do paciente';
COMMENT ON COLUMN preoperative_assessments.surgery_name IS 'Nome da cirurgia proposta';
COMMENT ON COLUMN preoperative_assessments.clearance_status IS 'Status: liberado ou pendente';
COMMENT ON COLUMN preoperative_assessments.missing_exams IS 'Lista de exames pendentes para liberacao';
COMMENT ON COLUMN preoperative_assessments.asa_score IS 'Classificacao ASA do paciente';
COMMENT ON COLUMN preoperative_assessments.lee_index IS 'Indice de Lee cardiaco';
COMMENT ON COLUMN preoperative_assessments.ai_report IS 'Relatorio completo gerado pela IA';

-- Verifica se a tabela foi criada
SELECT
    tablename,
    schemaname
FROM pg_tables
WHERE tablename = 'preoperative_assessments';

-- Conta quantas avaliacoes existem
SELECT COUNT(*) as total_avaliacoes FROM preoperative_assessments;
