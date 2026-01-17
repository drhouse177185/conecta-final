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

async function forceRepair() {
    try {
        await sequelize.authenticate();
        console.log('🔧 Conectado. Iniciando verificação de colunas...');

        const tableName = 'users';

        // 1. Adiciona blocked_features se não existir
        try {
            await sequelize.query(`
                ALTER TABLE "${tableName}" 
                ADD COLUMN IF NOT EXISTS "blocked_features" JSONB DEFAULT '{"preConsulta": false, "preOp": false}';
            `);
            console.log('✅ Coluna blocked_features verificada/criada.');
        } catch (e) {
            console.log(`⚠️ Erro ao criar blocked_features (pode já existir): ${e.message}`);
        }

        // 2. Adiciona credits se não existir
        try {
            await sequelize.query(`
                ALTER TABLE "${tableName}" 
                ADD COLUMN IF NOT EXISTS "credits" INTEGER DEFAULT 100;
            `);
            console.log('✅ Coluna credits verificada/criada.');
        } catch (e) {
            console.log(`⚠️ Erro ao criar credits: ${e.message}`);
        }

        // 3. Garante que os dados existentes não sejam nulos
        await sequelize.query(`UPDATE "${tableName}" SET "blocked_features" = '{"preConsulta": false, "preOp": false}' WHERE "blocked_features" IS NULL`);
        await sequelize.query(`UPDATE "${tableName}" SET "credits" = 100 WHERE "credits" IS NULL`);
        
        console.log('🏁 Reparo concluído. Dados normalizados.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro fatal:', error);
        process.exit(1);
    }
}

forceRepair();