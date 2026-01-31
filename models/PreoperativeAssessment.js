const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PreoperativeAssessment = sequelize.define('PreoperativeAssessment', {
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
        allowNull: false,
        field: 'patient_name'
    },
    patientAge: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'patient_age'
    },
    patientCpf: {
        type: DataTypes.STRING(20),
        allowNull: false,
        field: 'patient_cpf'
    },
    surgeryName: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: 'surgery_name'
    },
    clearanceStatus: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'pendente',
        field: 'clearance_status'
    },
    missingExams: {
        type: DataTypes.ARRAY(DataTypes.TEXT),
        allowNull: true,
        field: 'missing_exams'
    },
    asaScore: {
        type: DataTypes.STRING(50),
        allowNull: true,
        field: 'asa_score'
    },
    leeIndex: {
        type: DataTypes.STRING(50),
        allowNull: true,
        field: 'lee_index'
    },
    aiReport: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'ai_report'
    }
}, {
    tableName: 'preoperative_assessments',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true
});

module.exports = PreoperativeAssessment;
