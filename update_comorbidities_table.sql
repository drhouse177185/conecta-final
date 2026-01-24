-- ====================================================================
-- ATUALIZAÇÃO DA TABELA user_comorbidities - ADICIONAR CONFIRMAÇÃO
-- ====================================================================
-- Adiciona campo para registrar quando o usuário confirmou explicitamente
-- a comorbidade, aumentando a confiabilidade dos dados
-- ====================================================================

-- 1. ADICIONAR CAMPO DE CONFIRMAÇÃO
ALTER TABLE user_comorbidities
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP;

-- 2. ADICIONAR CAMPO PARA TEXTO LIVRE ("Outras" comorbidades)
ALTER TABLE user_comorbidities
ADD COLUMN IF NOT EXISTS is_custom BOOLEAN DEFAULT false;

-- 3. COMENTÁRIOS EXPLICATIVOS
COMMENT ON COLUMN user_comorbidities.confirmed_at IS 'Data/hora em que o usuário confirmou explicitamente ter essa comorbidade';
COMMENT ON COLUMN user_comorbidities.is_custom IS 'true se foi digitada pelo usuário (campo "Outras"), false se foi checkbox padrão';

-- 4. VERIFICAÇÃO
SELECT 'Campos de confirmação adicionados com sucesso!' as mensagem;

-- 5. MOSTRAR ESTRUTURA ATUALIZADA
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'user_comorbidities'
ORDER BY ordinal_position;
