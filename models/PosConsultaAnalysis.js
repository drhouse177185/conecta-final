const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PosConsultaAnalysis = sequelize.define('PosConsultaAnalysis', {
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
    patientName: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'patient_name'
    },
    analysisResult: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'analysis_result'
    },
    findings: {
        type: DataTypes.JSONB,
        allowNull: true,
        field: 'findings'
    },
    filesProcessed: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'files_processed'
    }
}, {
    tableName: 'pos_consulta_analyses',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true
});

module.exports = PosConsultaAnalysis;
