const { Sequelize } = require('sequelize');
require('dotenv').config();

// Configuração da conexão com o PostgreSQL
// Suporta DATABASE_URL (Render) ou variáveis individuais (.env local)
let sequelize;

// Função para construir a URL correta do PostgreSQL
function getDatabaseUrl() {
    let dbUrl = process.env.DATABASE_URL;

    // Remove prefixo jdbc: se existir (formato Java)
    if (dbUrl && dbUrl.startsWith('jdbc:')) {
        dbUrl = dbUrl.replace('jdbc:', '');
    }

    // Verifica se a URL tem credenciais (usuário:senha@)
    // Formato esperado: postgresql://user:password@host:port/database
    if (dbUrl && !dbUrl.includes('@')) {
        // URL sem credenciais, construir URL completa
        console.log('⚠️ DATABASE_URL sem credenciais, construindo URL completa...');
        const user = process.env.DB_USER;
        const password = process.env.DB_PASSWORD;
        const host = process.env.DB_HOST;
        const port = process.env.DB_PORT || 5432;
        const database = process.env.DB_NAME;

        if (user && password && host && database) {
            dbUrl = `postgresql://${user}:${password}@${host}:${port}/${database}`;
            console.log('✅ URL construída com sucesso');
        } else {
            console.log('❌ Variáveis individuais incompletas, usando fallback');
            return null;
        }
    }

    return dbUrl;
}

// Tenta usar DATABASE_URL primeiro
const databaseUrl = getDatabaseUrl();

if (databaseUrl) {
    console.log('🔗 Conectando usando DATABASE_URL...');
    sequelize = new Sequelize(databaseUrl, {
        dialect: 'postgres',
        logging: false,
        dialectOptions: {
            ssl: {
                require: true,
                rejectUnauthorized: false
            }
        },
        pool: {
            max: 5,
            min: 0,
            acquire: 30000,
            idle: 10000
        }
    });
} else {
    // Fallback: usar variáveis individuais
    console.log('🔗 Conectando usando variáveis individuais...');
    sequelize = new Sequelize(
        process.env.DB_NAME,
        process.env.DB_USER,
        process.env.DB_PASSWORD,
        {
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 5432,
            dialect: 'postgres',
            logging: false,
            dialectOptions: {
                ssl: {
                    require: true,
                    rejectUnauthorized: false
                }
            },
            pool: {
                max: 5,
                min: 0,
                acquire: 30000,
                idle: 10000
            }
        }
    );
}

module.exports = sequelize;