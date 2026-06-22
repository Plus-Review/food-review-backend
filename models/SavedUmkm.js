const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const SavedUmkm = sequelize.define('SavedUmkm', {
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  umkmId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  indexes: [
    {
      unique: true,
      fields: ['userId', 'umkmId'],
    },
  ],
});

module.exports = SavedUmkm;
