-- CRIAÇÃO DAS TABELAS (Execute isso no seu banco de dados PostgreSQL)

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    cpf VARCHAR(14) UNIQUE,
    age INTEGER,
    sex CHAR(1) CHECK (sex IN ('M', 'F')),
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    block_pre_consulta BOOLEAN DEFAULT FALSE,
    block_pre_op BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS catalog_exams (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(20) CHECK (category IN ('lab', 'img')),
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS catalog_surgeries (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS referrals (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    specialty VARCHAR(100) NOT NULL,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'agendado', 'cancelado')),
    request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- DADOS INICIAIS (SEED)
INSERT INTO users (name, email, password_hash, role) VALUES 
('Dr. Tiago Admin', 'admin@conecta.com', '123456', 'admin')
ON CONFLICT (email) DO NOTHING;

INSERT INTO catalog_exams (slug, name, category) VALUES
('hemograma', 'Hemograma Completo', 'lab'),
('glicemia', 'Glicemia em Jejum', 'lab'),
('rx_torax', 'Raio-X de Tórax', 'img')
ON CONFLICT (slug) DO NOTHING;
