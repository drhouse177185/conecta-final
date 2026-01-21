const sequelize = require('../config/database');
const User = require('./User');
const Referral = require('./Referral'); // Garante a importação do novo modelo

// Define relacionamentos
Referral.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(Referral, { foreignKey: 'userId', as: 'referrals' });

const db = {
    sequelize,
    User,
    Referral // Exporta o novo modelo
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