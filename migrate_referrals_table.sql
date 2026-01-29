-- ================================================================
-- MIGRAÇÃO: ADICIONA COLUNAS FALTANTES NA TABELA REFERRALS
-- ================================================================
-- Execute este script no DBeaver para atualizar a tabela existente
-- Data: 29/01/2026
-- ================================================================

-- Adiciona coluna diagnostic_possibilities se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'referrals'
        AND column_name = 'diagnostic_possibilities'
    ) THEN
        ALTER TABLE referrals ADD COLUMN diagnostic_possibilities TEXT;
        RAISE NOTICE 'Coluna diagnostic_possibilities adicionada';
    ELSE
        RAISE NOTICE 'Coluna diagnostic_possibilities já existe';
    END IF;
END $$;

-- Adiciona coluna referral_pdf_data se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'referrals'
        AND column_name = 'referral_pdf_data'
    ) THEN
        ALTER TABLE referrals ADD COLUMN referral_pdf_data JSONB;
        RAISE NOTICE 'Coluna referral_pdf_data adicionada';
    ELSE
        RAISE NOTICE 'Coluna referral_pdf_data já existe';
    END IF;
END $$;

-- Adiciona coluna email_sent se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'referrals'
        AND column_name = 'email_sent'
    ) THEN
        ALTER TABLE referrals ADD COLUMN email_sent BOOLEAN DEFAULT false;
        RAISE NOTICE 'Coluna email_sent adicionada';
    ELSE
        RAISE NOTICE 'Coluna email_sent já existe';
    END IF;
END $$;

-- Adiciona coluna email_sent_at se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'referrals'
        AND column_name = 'email_sent_at'
    ) THEN
        ALTER TABLE referrals ADD COLUMN email_sent_at TIMESTAMP;
        RAISE NOTICE 'Coluna email_sent_at adicionada';
    ELSE
        RAISE NOTICE 'Coluna email_sent_at já existe';
    END IF;
END $$;

-- Adiciona coluna updated_at se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'referrals'
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE referrals ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        RAISE NOTICE 'Coluna updated_at adicionada';
    ELSE
        RAISE NOTICE 'Coluna updated_at já existe';
    END IF;
END $$;

-- Adiciona coluna cancelled_at se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'referrals'
        AND column_name = 'cancelled_at'
    ) THEN
        ALTER TABLE referrals ADD COLUMN cancelled_at TIMESTAMP;
        RAISE NOTICE 'Coluna cancelled_at adicionada';
    ELSE
        RAISE NOTICE 'Coluna cancelled_at já existe';
    END IF;
END $$;

-- Adiciona coluna cancelled_by se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'referrals'
        AND column_name = 'cancelled_by'
    ) THEN
        ALTER TABLE referrals ADD COLUMN cancelled_by INTEGER REFERENCES users(id);
        RAISE NOTICE 'Coluna cancelled_by adicionada';
    ELSE
        RAISE NOTICE 'Coluna cancelled_by já existe';
    END IF;
END $$;

-- Renomeia coluna cpf para patient_cpf se necessário
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'referrals'
        AND column_name = 'cpf'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'referrals'
        AND column_name = 'patient_cpf'
    ) THEN
        ALTER TABLE referrals RENAME COLUMN cpf TO patient_cpf;
        RAISE NOTICE 'Coluna cpf renomeada para patient_cpf';
    ELSE
        RAISE NOTICE 'Coluna patient_cpf já existe ou cpf não existe';
    END IF;
END $$;

-- Cria índices se não existirem
CREATE INDEX IF NOT EXISTS idx_referrals_user_id ON referrals(user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
CREATE INDEX IF NOT EXISTS idx_referrals_specialty ON referrals(specialty);
CREATE INDEX IF NOT EXISTS idx_referrals_created_at ON referrals(created_at DESC);

-- Adiciona comentários nas colunas
COMMENT ON TABLE referrals IS 'Tabela de encaminhamentos a especialistas gerados na Pós-Consulta';
COMMENT ON COLUMN referrals.user_id IS 'ID do usuário que recebeu o encaminhamento';
COMMENT ON COLUMN referrals.specialty IS 'Especialidade para qual foi encaminhado (Cardiologia, etc)';
COMMENT ON COLUMN referrals.reason IS 'Motivo do encaminhamento';
COMMENT ON COLUMN referrals.diagnostic_possibilities IS 'Possibilidades diagnósticas identificadas';
COMMENT ON COLUMN referrals.referral_pdf_data IS 'Dados JSON para gerar o PDF de encaminhamento';
COMMENT ON COLUMN referrals.status IS 'Status: pendente, enviado, cancelado';
COMMENT ON COLUMN referrals.email_sent IS 'Indica se o email foi enviado';
COMMENT ON COLUMN referrals.email_sent_at IS 'Data/hora do envio do email';

-- Verifica a estrutura final da tabela
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'referrals'
ORDER BY ordinal_position;

-- Conta quantos encaminhamentos existem
SELECT COUNT(*) as total_encaminhamentos FROM referrals;

-- ✅ MIGRAÇÃO CONCLUÍDA
SELECT '✅ Migração concluída com sucesso!' as status;
