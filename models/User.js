const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
            isEmail: true
        }
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'password_hash', // Mapeia para a coluna password_hash no banco
        // Senha padrão hash para compatibilidade
        defaultValue: '$2a$10$EpWxTcR/I7l9i.O1qO7.BO/Zq.JpL/m9.8p/h.0q.1r.2s.3t'
    },
    cpf: {
        type: DataTypes.STRING,
        allowNull: true
    },
    age: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    sex: {
        type: DataTypes.STRING(1), 
        allowNull: true
    },
    role: {
        type: DataTypes.STRING,
        defaultValue: 'user'
    },
    credits: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    // --- CORREÇÃO PRINCIPAL AQUI ---
    blockedFeatures: {
        type: DataTypes.JSONB,
        field: 'blocked_features', // Mapeia explicitamente para snake_case no banco
        defaultValue: { preConsulta: false, preOp: false }
    },
    // --- CAMPOS DE VERIFICAÇÃO DE EMAIL ---
    emailVerified: {
        type: DataTypes.BOOLEAN,
        field: 'email_verified',
        defaultValue: false
    },
    emailVerifiedAt: {
        type: DataTypes.DATE,
        field: 'email_verified_at',
        allowNull: true
    }
}, {
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false, // A tabela não tem updated_at
    underscored: true
});

module.exports = User;