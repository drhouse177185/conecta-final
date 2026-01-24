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

        // IMPORTANTE: Não usa alter: true para evitar modificações automáticas no schema
        // Se precisar ajustar o schema, use /api/install_db
        await sequelize.sync();
        console.log('✅ Modelos validados com sucesso.');
        console.log('💡 Se houver erro de coluna faltando, acesse /api/install_db');
    } catch (error) {
        console.error('❌ Não foi possível conectar ao banco de dados:', error);
    }
};

module.exports = db;