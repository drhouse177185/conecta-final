const sequelize = require('../config/database');
const User = require('./User');

const db = {
    sequelize,
    User
};

// Função para sincronizar o banco de dados
db.sync = async () => {
    try {
        await sequelize.authenticate();
        console.log('✅ Conexão com o banco de dados estabelecida com sucesso.');
        
        // Sincroniza os modelos com o banco (alter: true apenas atualiza, não apaga dados)
        await sequelize.sync({ alter: true });
        console.log('✅ Tabelas sincronizadas.');
    } catch (error) {
        console.error('❌ Não foi possível conectar ao banco de dados:', error);
    }
};

module.exports = db;