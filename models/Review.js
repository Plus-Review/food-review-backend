const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Review = sequelize.define('Review', {
  rating: { type: DataTypes.INTEGER, allowNull: false },
  komentar: { type: DataTypes.TEXT, allowNull: false },
}, { timestamps: true });

module.exports = Review;