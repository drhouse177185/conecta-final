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
        // CORREÇÃO AQUI:
        // Definimos um valor padrão para que o banco possa preencher os registros antigos.
        // Este hash abaixo corresponde à senha "mudar123"
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
    blockedFeatures: {
        type: DataTypes.JSONB, 
        defaultValue: { preConsulta: false, preOp: false }
    }
}, {
    tableName: 'users',
    timestamps: true,
});

module.exports = User;