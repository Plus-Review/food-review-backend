const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const PendingRegistration = sequelize.define('PendingRegistration', {
    username: {
        type: DataTypes.STRING(60),
        allowNull: false,
    },
    email: {
        type: DataTypes.STRING(160),
        allowNull: false,
    },
    passwordHash: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    verificationTokenHash: {
        type: DataTypes.STRING(64),
        allowNull: false,
    },
    verificationExpiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    lastVerificationSentAt: {
        type: DataTypes.DATE,
        allowNull: false,
    },
}, {
    indexes: [
        { name: 'pending_registration_username_unique', unique: true, fields: ['username'] },
        { name: 'pending_registration_email_unique', unique: true, fields: ['email'] },
        { name: 'pending_registration_expiry_idx', fields: ['verificationExpiresAt'] },
    ],
});

module.exports = PendingRegistration;
