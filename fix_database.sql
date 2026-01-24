-- ====================================================================
-- SCRIPT DE CORREÇÃO DO BANCO DE DADOS - CONECTA SAÚDE
-- Execute este arquivo no DBeaver para criar as tabelas que faltam
-- ====================================================================

-- 1. CRIAR TABELA HISTORY (Principal - obrigatória)
CREATE TABLE IF NOT EXISTS history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  service_slug VARCHAR(100) NOT NULL,
  cost INTEGER NOT NULL DEFAULT 0,
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. CRIAR ÍNDICE para melhorar performance
CREATE INDEX IF NOT EXISTS idx_history_user_id ON history(user_id);
CREATE INDEX IF NOT EXISTS idx_history_created_at ON history(created_at DESC);

-- 3. VERIFICAÇÃO: Liste todas as tabelas para confirmar
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 4. VERIFICAÇÃO: Mostre a estrutura da tabela history
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'history'
ORDER BY ordinal_position;
