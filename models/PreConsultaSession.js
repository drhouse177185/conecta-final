const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PreConsultaSession = sequelize.define('PreConsultaSession', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'user_id'
    },
    examList: {
        type: DataTypes.ARRAY(DataTypes.TEXT),
        allowNull: false,
        field: 'exam_list'
    },
    comorbiditiesUsed: {
        type: DataTypes.JSONB,
        allowNull: true,
        field: 'comorbidities_used'
    },
    isConfirmed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_confirmed'
    },
    confirmedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'confirmed_at'
    }
}, {
    tableName: 'pre_consulta_sessions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true
});

module.exports = PreConsultaSession;
