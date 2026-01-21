const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

const Referral = sequelize.define('Referral', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    patientName: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'patient_name' // Mapeia para snake_case no banco
    },
    cpf: {
        type: DataTypes.STRING,
        allowNull: true
    },
    specialty: {
        type: DataTypes.STRING,
        allowNull: true
    },
    reason: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    status: {
        type: DataTypes.STRING,
        defaultValue: 'pendente'
    },
    userId: {
        type: DataTypes.INTEGER,
        field: 'user_id',
        references: {
            model: 'users',
            key: 'id'
        }
    }
}, {
    tableName: 'referrals',
    timestamps: true,      // Cria created_at e updated_at
    underscored: true      // Usa snake_case nas colunas automáticas
});

// Define o relacionamento se necessário, mas o index.js geralmente cuida das associações finais
// Referral.belongsTo(User, { foreignKey: 'userId', as: 'user' });

module.exports = Referral;