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

        // --- CORREÇÃO 1: SENHA (Mantida por segurança) ---
        console.log('PASSO 1: Verificando coluna password...');
        await sequelize.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "password" VARCHAR(255);`);
        await sequelize.query(`UPDATE users SET "password" = '$2a$10$EpWxTcR/I7l9i.O1qO7.BO/Zq.JpL/m9.8p/h.0q.1r.2s.3t' WHERE "password" IS NULL;`);
        await sequelize.query(`ALTER TABLE users ALTER COLUMN "password" SET NOT NULL;`);

        // --- CORREÇÃO 2: DATAS (O Erro Atual) ---
        console.log('PASSO 2: Verificando createdAt e updatedAt...');
        
        // Cria colunas de data permitindo valor padrão (CURRENT_TIMESTAMP)
        // Isso preenche automaticamente as linhas existentes com a data/hora de agora
        await sequelize.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
        `);
        
        await sequelize.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
        `);

        // Garante que não haja nulos (backfill para segurança extra)
        await sequelize.query(`UPDATE users SET "createdAt" = CURRENT_TIMESTAMP WHERE "createdAt" IS NULL;`);
        await sequelize.query(`UPDATE users SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;`);

        // Aplica a restrição de NOT NULL agora que todos têm dados
        console.log('PASSO 3: Aplicando restrições de data...');
        await sequelize.query(`ALTER TABLE users ALTER COLUMN "createdAt" SET NOT NULL;`);
        await sequelize.query(`ALTER TABLE users ALTER COLUMN "updatedAt" SET NOT NULL;`);

        console.log('✅ Banco de dados reparado com sucesso!');
        process.exit(0);
    } catch (error) {
        // Ignora erro se a coluna já for NOT NULL (significa que já foi corrigido antes)
        if (error.original && error.original.code === '42701') {
             console.log('⚠️ Aviso: Algumas colunas já existiam, mas o processo continuou.');
        } else {
             console.error('❌ Erro no reparo:', error.message);
        }
        process.exit(1);
    }
}

repair();