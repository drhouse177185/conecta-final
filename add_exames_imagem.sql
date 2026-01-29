-- ================================================================
-- ADICIONA EXAMES DE IMAGEM AO CATÁLOGO
-- ================================================================
-- Execute este script no DBeaver para popular a tabela com exames de imagem
-- Data: 28/01/2026
-- ================================================================

-- IMPORTANTE: Este script só adiciona exames que não existem (usa INSERT ... WHERE NOT EXISTS)

-- Adiciona cada exame apenas se não existir
INSERT INTO catalogo_itens (tipo, nome, ativo, ordem)
SELECT 'img', 'Raio-X de Tórax', true, 100
WHERE NOT EXISTS (SELECT 1 FROM catalogo_itens WHERE nome = 'Raio-X de Tórax');

INSERT INTO catalogo_itens (tipo, nome, ativo, ordem)
SELECT 'img', 'USG Abdome Total', true, 101
WHERE NOT EXISTS (SELECT 1 FROM catalogo_itens WHERE nome = 'USG Abdome Total');

INSERT INTO catalogo_itens (tipo, nome, ativo, ordem)
SELECT 'img', 'Mamografia Bilateral', true, 102
WHERE NOT EXISTS (SELECT 1 FROM catalogo_itens WHERE nome = 'Mamografia Bilateral');

INSERT INTO catalogo_itens (tipo, nome, ativo, ordem)
SELECT 'img', 'Eletrocardiograma', true, 103
WHERE NOT EXISTS (SELECT 1 FROM catalogo_itens WHERE nome = 'Eletrocardiograma');

INSERT INTO catalogo_itens (tipo, nome, ativo, ordem)
SELECT 'img', 'USG Transvaginal', true, 104
WHERE NOT EXISTS (SELECT 1 FROM catalogo_itens WHERE nome = 'USG Transvaginal');

INSERT INTO catalogo_itens (tipo, nome, ativo, ordem)
SELECT 'img', 'USG Próstata (Via Abdominal)', true, 105
WHERE NOT EXISTS (SELECT 1 FROM catalogo_itens WHERE nome = 'USG Próstata (Via Abdominal)');

INSERT INTO catalogo_itens (tipo, nome, ativo, ordem)
SELECT 'img', 'Tomografia de Crânio', true, 106
WHERE NOT EXISTS (SELECT 1 FROM catalogo_itens WHERE nome = 'Tomografia de Crânio');

INSERT INTO catalogo_itens (tipo, nome, ativo, ordem)
SELECT 'img', 'Tomografia de Tórax', true, 107
WHERE NOT EXISTS (SELECT 1 FROM catalogo_itens WHERE nome = 'Tomografia de Tórax');

INSERT INTO catalogo_itens (tipo, nome, ativo, ordem)
SELECT 'img', 'USG de Mamas', true, 108
WHERE NOT EXISTS (SELECT 1 FROM catalogo_itens WHERE nome = 'USG de Mamas');

INSERT INTO catalogo_itens (tipo, nome, ativo, ordem)
SELECT 'img', 'USG Obstétrica', true, 109
WHERE NOT EXISTS (SELECT 1 FROM catalogo_itens WHERE nome = 'USG Obstétrica');

INSERT INTO catalogo_itens (tipo, nome, ativo, ordem)
SELECT 'img', 'Raio-X Seios da Face', true, 110
WHERE NOT EXISTS (SELECT 1 FROM catalogo_itens WHERE nome = 'Raio-X Seios da Face');

INSERT INTO catalogo_itens (tipo, nome, ativo, ordem)
SELECT 'img', 'Ecocardiograma', true, 111
WHERE NOT EXISTS (SELECT 1 FROM catalogo_itens WHERE nome = 'Ecocardiograma');

-- Verifica quantos exames de imagem foram adicionados
SELECT COUNT(*) as total_exames_imagem FROM catalogo_itens WHERE tipo = 'img';

-- Lista todos os exames de imagem cadastrados
SELECT id, nome, ativo, ordem
FROM catalogo_itens
WHERE tipo = 'img'
ORDER BY ordem ASC;
