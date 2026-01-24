# 🏥 GUIA DO SISTEMA DE CONFIRMAÇÃO DE COMORBIDADES

## 📋 O QUE FOI IMPLEMENTADO

Um sistema de **confirmação explícita** de comorbidades que aumenta a confiabilidade dos dados médicos.

### **ANTES (Sistema Antigo):**
- ❌ Comorbidades salvas automaticamente ao marcar
- ❌ Paciente pode desmarcar a qualquer momento
- ❌ Sem confirmação explícita
- ❌ Baixa confiabilidade dos dados

### **AGORA (Sistema Novo):**
- ✅ Paciente **confirma explicitamente** as comorbidades
- ✅ Após confirmação, **não pode mais editar**
- ✅ Apenas **admin pode remover** do histórico
- ✅ **Alta confiabilidade** dos dados médicos
- ✅ Registra **data/hora da confirmação**

---

## 🚀 INSTALAÇÃO - PASSO A PASSO

### **PASSO 1: Atualizar a Tabela no Banco de Dados**

Abra o **DBeaver** e execute o SQL:

```sql
-- Arquivo: update_comorbidities_table.sql

-- 1. ADICIONAR CAMPO DE CONFIRMAÇÃO
ALTER TABLE user_comorbidities
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP;

-- 2. ADICIONAR CAMPO PARA TEXTO LIVRE ("Outras" comorbidades)
ALTER TABLE user_comorbidities
ADD COLUMN IF NOT EXISTS is_custom BOOLEAN DEFAULT false;

-- 3. VERIFICAR SE FOI CRIADO
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'user_comorbidities';
```

### **PASSO 2: Reiniciar o Servidor**

```bash
# O servidor reinicia automaticamente com nodemon
# Ou manualmente:
npm start
```

### **PASSO 3: Testar no Aplicativo**

1. Faça **login** como paciente
2. Vá em **Pré-Consulta**
3. **Confirme seus dados** (Nome e Idade)
4. **Marque** comorbidades (ex: Hipertensão, Diabetes)
5. **Digite** outra comorbidade em "Outras" (ex: "Asma")
6. Clique em **"Confirmar Comorbidades"** 🔒
7. ✅ Checkboxes ficam **desabilitados**
8. ✅ Botão muda para **"Confirmado"**
9. ✅ Dados salvos **permanentemente**

---

## 🎯 COMO FUNCIONA

### **FLUXO DO PACIENTE:**

```
1. Login
   ↓
2. Pré-Consulta → Confirmar Dados
   ↓
3. Marcar Comorbidades
   - [✓] Hipertensão
   - [✓] Diabetes
   - Outras: "Asma"
   ↓
4. Clicar "Confirmar Comorbidades" 🔒
   ↓
5. Sistema salva com data/hora de confirmação
   ↓
6. Checkboxes DESABILITADOS
   ↓
7. Não pode mais editar
```

### **APÓS CONFIRMAÇÃO:**

- 🔒 **Checkboxes bloqueados** (não pode desmarcar)
- 🔒 **Campo "Outras" bloqueado** (não pode editar)
- 🔒 **Botão muda para "Confirmado"** (cinza)
- ✅ **Dados salvos permanentemente**
- ✅ **Data/hora registrada** (campo `confirmed_at`)

---

## 📊 ESTRUTURA ATUALIZADA DA TABELA

```sql
user_comorbidities
├── id (SERIAL PRIMARY KEY)
├── user_id (INTEGER) - Quem é o paciente
├── comorbidity (VARCHAR) - Nome da comorbidade
├── is_active (BOOLEAN) - Ativo ou desmarcado
├── is_custom (BOOLEAN) - ✨ NOVO: Digitada ou checkbox
├── confirmed_at (TIMESTAMP) - ✨ NOVO: Quando confirmou
├── removed_by_admin (BOOLEAN) - Admin removeu?
├── admin_removal_reason (TEXT) - Motivo da remoção
├── first_marked_at (TIMESTAMP) - Primeira vez
├── last_updated_at (TIMESTAMP) - Última modificação
└── removed_at (TIMESTAMP) - Quando admin removeu
```

---

## 🔍 QUERIES ÚTEIS

### **Ver comorbidades confirmadas de um paciente:**
```sql
SELECT
  u.name as paciente,
  uc.comorbidity,
  uc.is_custom,
  uc.confirmed_at,
  uc.first_marked_at
FROM user_comorbidities uc
JOIN users u ON uc.user_id = u.id
WHERE uc.user_id = 1
  AND uc.confirmed_at IS NOT NULL
ORDER BY uc.confirmed_at DESC;
```

### **Comorbidades aguardando confirmação:**
```sql
SELECT * FROM user_comorbidities
WHERE user_id = 1
  AND confirmed_at IS NULL
  AND is_active = true;
```

### **Comorbidades customizadas (digitadas pelo paciente):**
```sql
SELECT
  u.name,
  uc.comorbidity,
  uc.confirmed_at
FROM user_comorbidities uc
JOIN users u ON uc.user_id = u.id
WHERE uc.is_custom = true
ORDER BY uc.confirmed_at DESC;
```

### **Estatísticas de confirmação:**
```sql
-- Percentual de comorbidades confirmadas
SELECT
  COUNT(*) as total,
  COUNT(confirmed_at) as confirmadas,
  ROUND(100.0 * COUNT(confirmed_at) / COUNT(*), 2) as percentual_confirmacao
FROM user_comorbidities
WHERE is_active = true AND removed_by_admin = false;
```

---

## 🔐 ENDPOINT DA API

### **Confirmar Comorbidades em Lote**
```http
POST /api/comorbidities/confirm
Content-Type: application/json

{
  "userId": 1,
  "comorbidities": ["Hipertensão", "Diabetes"],
  "otherComorbidities": "Asma"
}
```

**Resposta de Sucesso:**
```json
{
  "success": true,
  "message": "3 comorbidade(s) confirmada(s) e salva(s) no histórico médico.",
  "savedComorbidities": ["Hipertensão", "Diabetes", "Asma"]
}
```

---

## 🎨 EXEMPLO VISUAL

### **ANTES DE CONFIRMAR:**
```
[✓] Hipertensão     [ ] Diabetes
[✓] Cardiopatia     [ ] Obesidade
[✓] Colesterol Alto [ ] Tabagismo

Outras: Asma

[🟢 Confirmar Comorbidades]  ← Botão verde ativo
```

### **DEPOIS DE CONFIRMAR:**
```
[✓] Hipertensão (desabilitado, cinza)
[ ] Diabetes (desabilitado, cinza)
[✓] Cardiopatia (desabilitado, cinza)
...

Outras: Asma (desabilitado, cinza)

[⚪ Confirmado]  ← Botão cinza com ícone duplo de check
```

---

## 👨‍⚕️ PARA O ADMINISTRADOR

### **Remover comorbidade confirmada:**

Apenas o admin pode remover comorbidades confirmadas. Use o endpoint:

```http
POST /api/admin/comorbidities/remove
Content-Type: application/json

{
  "comorbidityId": 123,
  "reason": "Paciente confirmou por engano - não tem diabetes"
}
```

---

## ⚠️ REGRAS DE NEGÓCIO

1. ✅ **Paciente pode marcar/desmarcar** ANTES de confirmar
2. 🔒 **Após confirmar, não pode mais editar**
3. 🔒 **Apenas admin pode remover** do histórico
4. ✅ **Campo "Outras" aceita texto livre**
5. ✅ **Data/hora de confirmação registrada**
6. ✅ **Comorbidades confirmadas = dados confiáveis**

---

## 🚨 IMPORTANTE - LGPD

Este sistema registra **dados sensíveis de saúde** com **confirmação explícita**.

### **Benefícios para LGPD:**
- ✅ **Consentimento explícito** (botão de confirmação)
- ✅ **Auditoria completa** (data/hora registrada)
- ✅ **Rastreabilidade** (quem confirmou, quando)
- ✅ **Direito ao esquecimento** (admin pode remover)

---

## ✅ CHECKLIST DE TESTE

- [ ] Executar SQL de atualização da tabela
- [ ] Reiniciar servidor Node.js
- [ ] Fazer login no app
- [ ] Ir para Pré-Consulta
- [ ] Marcar 2-3 comorbidades
- [ ] Digitar algo em "Outras"
- [ ] Clicar em "Confirmar Comorbidades"
- [ ] Verificar que checkboxes ficaram desabilitados
- [ ] Verificar que botão mudou para "Confirmado"
- [ ] Verificar no banco se `confirmed_at` foi preenchido
- [ ] Fazer logout e login novamente
- [ ] Verificar que checkboxes continuam desabilitados
- [ ] Tentar clicar nos checkboxes (não deve permitir)

---

## 🎯 VANTAGENS DESTE SISTEMA

| Aspecto | Antes | Agora |
|---------|-------|-------|
| **Confiabilidade** | Baixa (pode mudar a qualquer momento) | Alta (confirmação explícita) |
| **Auditoria** | Apenas data de criação | Data de criação + data de confirmação |
| **Segurança** | Paciente pode alterar | Bloqueado após confirmação |
| **LGPD** | Consentimento implícito | Consentimento explícito |
| **Dados médicos** | Incertos | Confirmados pelo paciente |

---

## 📞 SUPORTE

**Se tiver problemas:**

1. Verifique se executou o SQL de atualização
2. Verifique os logs do console (F12)
3. Verifique os logs do servidor Node.js
4. Teste a query SQL direto no DBeaver

---

**Sistema desenvolvido com 💙 para CONECTA SAÚDE**
