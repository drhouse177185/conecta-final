-- ================================================================
-- CRIA TABELA DE ENCAMINHAMENTOS A ESPECIALISTAS
-- ================================================================
-- Execute este script no DBeaver para criar a tabela de encaminhamentos
-- Data: 28/01/2026
-- ================================================================

CREATE TABLE IF NOT EXISTS referrals (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    patient_name VARCHAR(255) NOT NULL,
    patient_cpf VARCHAR(20),
    specialty VARCHAR(100) NOT NULL,
    reason TEXT,
    diagnostic_possibilities TEXT,
    referral_pdf_data JSONB,  -- Dados para gerar o PDF
    status VARCHAR(50) DEFAULT 'pendente',  -- pendente, enviado, cancelado
    email_sent BOOLEAN DEFAULT false,
    email_sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    cancelled_at TIMESTAMP,
    cancelled_by INTEGER REFERENCES users(id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_referrals_user_id ON referrals(user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
CREATE INDEX IF NOT EXISTS idx_referrals_specialty ON referrals(specialty);
CREATE INDEX IF NOT EXISTS idx_referrals_created_at ON referrals(created_at DESC);

-- Comentários nas colunas
COMMENT ON TABLE referrals IS 'Tabela de encaminhamentos a especialistas gerados na Pós-Consulta';
COMMENT ON COLUMN referrals.user_id IS 'ID do usuário que recebeu o encaminhamento';
COMMENT ON COLUMN referrals.specialty IS 'Especialidade para qual foi encaminhado (Cardiologia, etc)';
COMMENT ON COLUMN referrals.reason IS 'Motivo do encaminhamento';
COMMENT ON COLUMN referrals.referral_pdf_data IS 'Dados JSON para gerar o PDF de encaminhamento';
COMMENT ON COLUMN referrals.status IS 'Status: pendente, enviado, cancelado';

-- Verifica se a tabela foi criada
SELECT
    tablename,
    schemaname
FROM pg_tables
WHERE tablename = 'referrals';

-- Conta quantos encaminhamentos existem
SELECT COUNT(*) as total_encaminhamentos FROM referrals;
