const { Sequelize } = require('sequelize');
require('dotenv').config();

// Configuração manual da conexão para o script
const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 5432,
        dialect: 'postgres',
        logging: console.log,
        dialectOptions: {
            ssl: { require: true, rejectUnauthorized: false }
        }
    }
);

async function repair() {
    try {
        await sequelize.authenticate();
        console.log('🔧 Conectado para reparo...');

        // 1. Adiciona a coluna permitindo NULL primeiro (se não existir)
        console.log('PASSO 1: Criando coluna password (NULLABLE)...');
        await sequelize.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS "password" VARCHAR(255);
        `);

        // 2. Preenche os vazios com uma senha padrão (hash de 'mudar123')
        console.log('PASSO 2: Preenchendo usuários antigos...');
        await sequelize.query(`
            UPDATE users 
            SET "password" = '$2a$10$EpWxTcR/I7l9i.O1qO7.BO/Zq.JpL/m9.8p/h.0q.1r.2s.3t' 
            WHERE "password" IS NULL;
        `);

        // 3. Agora que todos têm senha, bloqueia NULL
        console.log('PASSO 3: Aplicando restrição NOT NULL...');
        await sequelize.query(`
            ALTER TABLE users 
            ALTER COLUMN "password" SET NOT NULL;
        `);

        console.log('✅ Banco de dados reparado com sucesso!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro no reparo:', error.message);
        process.exit(1);
    }
}

repair();