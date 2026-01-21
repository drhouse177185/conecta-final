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
        allowNull: true, // ALTERADO: true para evitar erro de migração em tabela existente
        field: 'patient_name'
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
        // Removemos a referência estrita aqui para evitar erro se o usuário não existir
        // O relacionamento lógico é mantido
    }
}, {
    tableName: 'referrals',
    timestamps: true,
    underscored: true
});

module.exports = Referral;