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
        allowNull: true,
        field: 'patient_name'
    },
    patientCpf: {
        type: DataTypes.STRING(20),
        allowNull: true,
        field: 'patient_cpf'
    },
    specialty: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    reason: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    diagnosticPossibilities: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'diagnostic_possibilities'
    },
    referralPdfData: {
        type: DataTypes.JSONB,
        allowNull: true,
        field: 'referral_pdf_data'
    },
    status: {
        type: DataTypes.STRING(50),
        defaultValue: 'pendente'
    },
    emailSent: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'email_sent'
    },
    emailSentAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'email_sent_at'
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'user_id'
    },
    cancelledAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'cancelled_at'
    },
    cancelledBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'cancelled_by'
    }
}, {
    tableName: 'referrals',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true
});

module.exports = Referral;