-- ====================================================================
-- TABELA DE COMORBIDADES DOS USUÁRIOS - CONECTA SAÚDE
-- ====================================================================
-- Esta tabela mantém um histórico permanente das comorbidades marcadas
-- pelos usuários. Mesmo se o usuário desmarcar, o registro permanece.
-- Apenas administradores podem remover completamente do histórico.
-- ====================================================================

-- 1. CRIAR TABELA user_comorbidities
CREATE TABLE IF NOT EXISTS user_comorbidities (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comorbidity VARCHAR(100) NOT NULL,

  -- Status da comorbidade
  is_active BOOLEAN DEFAULT true,  -- true = usuário marcou, false = usuário desmarcou

  -- Controle de remoção pelo admin
  removed_by_admin BOOLEAN DEFAULT false,
  admin_removal_reason TEXT,  -- Motivo da remoção (opcional)
  removed_at TIMESTAMP,  -- Quando foi removida pelo admin

  -- Timestamps
  first_marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- Primeira vez que foi marcada
  last_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- Última modificação

  -- Impede duplicatas: um usuário não pode ter a mesma comorbidade registrada 2x
  CONSTRAINT unique_user_comorbidity UNIQUE(user_id, comorbidity)
);

-- 2. CRIAR ÍNDICES para performance
CREATE INDEX IF NOT EXISTS idx_user_comorbidities_user_id ON user_comorbidities(user_id);
CREATE INDEX IF NOT EXISTS idx_user_comorbidities_active ON user_comorbidities(user_id, is_active) WHERE removed_by_admin = false;

-- 3. CRIAR FUNÇÃO de atualização automática do timestamp
CREATE OR REPLACE FUNCTION update_comorbidity_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. CRIAR TRIGGER para atualizar timestamp automaticamente
DROP TRIGGER IF EXISTS trigger_update_comorbidity_timestamp ON user_comorbidities;
CREATE TRIGGER trigger_update_comorbidity_timestamp
    BEFORE UPDATE ON user_comorbidities
    FOR EACH ROW
    EXECUTE FUNCTION update_comorbidity_timestamp();

-- ====================================================================
-- QUERIES DE VERIFICAÇÃO
-- ====================================================================

-- 5. VERIFICAÇÃO: Confirme que a tabela foi criada
SELECT 'Tabela user_comorbidities criada com sucesso!' as mensagem;

-- 6. VERIFICAÇÃO: Mostre a estrutura da tabela
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default,
  character_maximum_length
FROM information_schema.columns
WHERE table_name = 'user_comorbidities'
ORDER BY ordinal_position;

-- ====================================================================
-- QUERIES ÚTEIS PARA TESTES
-- ====================================================================

-- Ver todas as comorbidades ativas de um usuário (user_id = 1)
-- SELECT * FROM user_comorbidities
-- WHERE user_id = 1 AND is_active = true AND removed_by_admin = false;

-- Ver histórico completo de comorbidades de um usuário
-- SELECT * FROM user_comorbidities
-- WHERE user_id = 1
-- ORDER BY first_marked_at DESC;

-- Ver comorbidades que foram desmarcadas mas ainda no histórico
-- SELECT * FROM user_comorbidities
-- WHERE user_id = 1 AND is_active = false AND removed_by_admin = false;
