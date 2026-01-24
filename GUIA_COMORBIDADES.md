# 🏥 GUIA DO SISTEMA DE COMORBIDADES - CONECTA SAÚDE

## 📋 VISÃO GERAL

O sistema de comorbidades foi criado para manter um **histórico médico permanente** das condições de saúde dos pacientes. Este sistema garante que:

✅ **Toda comorbidade marcada pelo paciente é registrada permanentemente**
✅ **Paciente pode desmarcar, mas o registro permanece no histórico**
✅ **Apenas administradores podem remover completamente do histórico**
✅ **Histórico médico completo e auditável**

---

## 🚀 INSTALAÇÃO - PASSO A PASSO

### **PASSO 1: Criar a Tabela no Banco de Dados**

1. **Abra o DBeaver**
2. **Abra um novo Editor SQL** (Ctrl + ])
3. **Copie e execute** o arquivo: `create_comorbidities_table.sql`

OU execute este SQL:

```sql
CREATE TABLE IF NOT EXISTS user_comorbidities (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comorbidity VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  removed_by_admin BOOLEAN DEFAULT false,
  admin_removal_reason TEXT,
  removed_at TIMESTAMP,
  first_marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_user_comorbidity UNIQUE(user_id, comorbidity)
);

CREATE INDEX idx_user_comorbidities_user_id ON user_comorbidities(user_id);
CREATE INDEX idx_user_comorbidities_active ON user_comorbidities(user_id, is_active)
WHERE removed_by_admin = false;
```

### **PASSO 2: Reinicie o Servidor**

```bash
# Se estiver rodando com nodemon, ele reinicia automaticamente
# Senão, pare e inicie novamente:
npm start
```

### **PASSO 3: Teste no Aplicativo**

1. Faça login como paciente
2. Vá para **Pré-Consulta**
3. Marque uma comorbidade (ex: "Hipertensão")
4. ✅ Veja a mensagem: "Hipertensão registrada no histórico médico"

---

## 🎯 COMO FUNCIONA

### **Para o PACIENTE:**

1. **Marcar Comorbidade:**
   - Clica no checkbox ✅
   - Sistema salva AUTOMATICAMENTE
   - Mensagem de confirmação aparece
   - **Registro criado no banco de dados**

2. **Desmarcar Comorbidade:**
   - Clica no checkbox ☐ (tira o check)
   - Sistema atualiza para `is_active = false`
   - **Registro PERMANECE no histórico**
   - Só muda o status para "inativa"

3. **Ver Histórico:**
   - (Funcionalidade futura)
   - Paciente poderá ver todas comorbidades (ativas e inativas)

### **Para o ADMINISTRADOR:**

1. **Ver Todas as Comorbidades:**
   ```http
   GET /api/admin/comorbidities
   ```

2. **Remover Permanentemente:**
   ```http
   POST /api/admin/comorbidities/remove
   Body: {
     "comorbidityId": 123,
     "reason": "Erro de digitação do paciente"
   }
   ```

---

## 📊 ESTRUTURA DA TABELA

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | INTEGER | ID único do registro |
| `user_id` | INTEGER | ID do usuário (FK para users) |
| `comorbidity` | VARCHAR | Nome da comorbidade ("Hipertensão", etc) |
| `is_active` | BOOLEAN | `true` = marcado, `false` = desmarcado |
| `removed_by_admin` | BOOLEAN | `true` = admin removeu |
| `admin_removal_reason` | TEXT | Motivo da remoção pelo admin |
| `first_marked_at` | TIMESTAMP | Quando foi marcada pela 1ª vez |
| `last_updated_at` | TIMESTAMP | Última modificação |
| `removed_at` | TIMESTAMP | Quando foi removida pelo admin |

---

## 🔍 QUERIES ÚTEIS

### **Ver comorbidades ativas de um paciente:**
```sql
SELECT * FROM user_comorbidities
WHERE user_id = 1 AND is_active = true AND removed_by_admin = false;
```

### **Ver histórico completo:**
```sql
SELECT
  u.name as paciente,
  uc.comorbidity,
  uc.is_active,
  uc.first_marked_at as primeira_vez,
  uc.last_updated_at as ultima_atualizacao
FROM user_comorbidities uc
JOIN users u ON uc.user_id = u.id
WHERE uc.user_id = 1
ORDER BY uc.first_marked_at DESC;
```

### **Ver comorbidades que foram desmarcadas:**
```sql
SELECT * FROM user_comorbidities
WHERE user_id = 1 AND is_active = false AND removed_by_admin = false;
```

### **Estatísticas gerais:**
```sql
-- Total de pacientes com hipertensão
SELECT COUNT(DISTINCT user_id) as total_pacientes
FROM user_comorbidities
WHERE comorbidity = 'Hipertensão' AND is_active = true AND removed_by_admin = false;

-- Comorbidade mais comum
SELECT comorbidity, COUNT(*) as total
FROM user_comorbidities
WHERE is_active = true AND removed_by_admin = false
GROUP BY comorbidity
ORDER BY total DESC;
```

---

## 🔐 ENDPOINTS DA API

### **1. Marcar/Desmarcar Comorbidade (Paciente)**
```http
POST /api/comorbidities/toggle
Content-Type: application/json

{
  "userId": 1,
  "comorbidity": "Hipertensão",
  "isActive": true
}
```

**Resposta:**
```json
{
  "success": true,
  "action": "created",
  "message": "Comorbidade registrada no histórico médico."
}
```

### **2. Listar Comorbidades Ativas do Usuário**
```http
GET /api/comorbidities/:userId
```

**Resposta:**
```json
{
  "success": true,
  "comorbidities": [
    {
      "id": 1,
      "comorbidity": "Hipertensão",
      "is_active": true,
      "first_marked_at": "2026-01-24T10:00:00Z",
      "last_updated_at": "2026-01-24T10:00:00Z"
    }
  ]
}
```

### **3. Ver Histórico Completo**
```http
GET /api/comorbidities/:userId/history
```

### **4. [ADMIN] Remover Comorbidade**
```http
POST /api/admin/comorbidities/remove
Content-Type: application/json

{
  "comorbidityId": 123,
  "reason": "Erro de digitação"
}
```

### **5. [ADMIN] Ver Todas as Comorbidades**
```http
GET /api/admin/comorbidities
```

---

## ✅ CHECKLIST DE TESTE

- [ ] Criar tabela `user_comorbidities` no banco
- [ ] Reiniciar servidor Node.js
- [ ] Fazer login como paciente
- [ ] Marcar comorbidade (Hipertensão)
- [ ] Verificar mensagem de sucesso
- [ ] Verificar no banco se foi criado registro
- [ ] Desmarcar comorbidade
- [ ] Verificar que `is_active` mudou para `false`
- [ ] Verificar que registro ainda existe
- [ ] Marcar novamente (deve atualizar, não duplicar)
- [ ] Fazer logout e login novamente
- [ ] Verificar se checkbox está marcado (carregou do banco)

---

## 🎨 EXEMPLO DE USO REAL

**Cenário:** Paciente João tem hipertensão

1. **24/01/2026 10:00** - João marca "Hipertensão" ✅
   ```sql
   INSERT: is_active=true, first_marked_at=2026-01-24 10:00
   ```

2. **25/01/2026 14:30** - João desmarca (achou que não tinha mais) ☐
   ```sql
   UPDATE: is_active=false, last_updated_at=2026-01-25 14:30
   ```

3. **26/01/2026 09:15** - Médico corrige, João marca novamente ✅
   ```sql
   UPDATE: is_active=true, last_updated_at=2026-01-26 09:15
   ```

4. **Histórico mantido:**
   - Primeira marcação: 24/01/2026 10:00
   - Última atualização: 26/01/2026 09:15
   - Status atual: ATIVA ✅

---

## 🚨 IMPORTANTE - LGPD

Este sistema registra **dados sensíveis de saúde**. Certifique-se de:

✅ Ter **consentimento do paciente** para armazenar dados médicos
✅ Implementar **segurança adequada** (HTTPS, criptografia)
✅ Permitir que **paciente solicite exclusão** de dados (LGPD Art. 18)
✅ **Logs de auditoria** (quem acessou, quando, por quê)

---

## 📞 SUPORTE

Se tiver dúvidas ou problemas:

1. Verifique os **logs do console** do navegador (F12)
2. Verifique os **logs do servidor** Node.js
3. Teste as queries SQL direto no DBeaver
4. Verifique se a tabela foi criada corretamente

---

**Sistema desenvolvido com 💙 para CONECTA SAÚDE**
