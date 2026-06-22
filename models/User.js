const { DataTypes } = require('sequelize');
const sequelize = require('../config/db'); // Memanggil langsung koneksi DB

const User = sequelize.define('User', {
  username: { type: DataTypes.STRING, allowNull: false, unique: true },
  name: { type: DataTypes.STRING, allowNull: true },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  password: { type: DataTypes.STRING, allowNull: false },
  profileImage: { type: DataTypes.STRING, allowNull: true },
  emailVerified: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  emailVerificationTokenHash: { type: DataTypes.STRING(64), allowNull: true },
  emailVerificationExpiresAt: { type: DataTypes.DATE, allowNull: true },
  passwordResetTokenHash: { type: DataTypes.STRING(64), allowNull: true },
  passwordResetExpiresAt: { type: DataTypes.DATE, allowNull: true },
  tokenVersion: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    defaultValue: 0,
  },
  role: {
    type: DataTypes.ENUM('user', 'admin'),
    allowNull: false,
    defaultValue: 'user',
  },
});

module.exports = User;
