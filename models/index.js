const sequelize = require('../config/database');
const User = require('./User');
// --- ADICIONADO: Importar o novo modelo ---
const Referral = require('./Referral');

const db = {
    sequelize,
    User,
    Referral // --- ADICIONADO: Exportar o novo modelo
};

// Função para sincronizar o banco de dados
db.sync = async () => {
    try {
        await sequelize.authenticate();
        console.log('✅ Conexão com o banco de dados estabelecida com sucesso.');
        
        // Sincroniza os modelos com o banco (alter: true cria tabelas novas ou atualiza)
        await sequelize.sync({ alter: true });
        console.log('✅ Tabelas sincronizadas (Users, Referrals, etc).');
    } catch (error) {
        console.error('❌ Não foi possível conectar ao banco de dados:', error);
    }
};

module.exports = db;