-- TABELA DE USUÁRIOS
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    cpf VARCHAR(14) UNIQUE,
    age INTEGER,
    sex CHAR(1),
    role VARCHAR(20) DEFAULT 'user',
    credits INTEGER DEFAULT 100,
    claimed_free_bonus BOOLEAN DEFAULT FALSE,
    blocked_features JSONB DEFAULT '{"preConsulta": false, "preOp": false}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABELA DE TRANSAÇÕES
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    amount INTEGER NOT NULL,
    description VARCHAR(255),
    type VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABELA DE REGISTROS MÉDICOS (IA)
CREATE TABLE IF NOT EXISTS medical_records (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    type VARCHAR(50),
    content JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- NOVA TABELA: ENCAMINHAMENTOS (AME/ESPECIALISTAS)
-- Armazena as solicitações geradas na Pós-Consulta para o Admin processar
CREATE TABLE IF NOT EXISTS referrals (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    patient_name VARCHAR(255),
    patient_cpf VARCHAR(20),
    specialty VARCHAR(100),
    reason TEXT,
    status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);