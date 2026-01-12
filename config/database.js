const { Sequelize } = require('sequelize');
require('dotenv').config();

// Configuração da conexão com o PostgreSQL usando os dados do .env
const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 5432,
        dialect: 'postgres',
        logging: false, // Define como console.log se quiser ver o SQL cru
        dialectOptions: {
            ssl: {
                require: true,
                rejectUnauthorized: false // Obrigatório para conexão externa no Render
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

module.exports = sequelize;