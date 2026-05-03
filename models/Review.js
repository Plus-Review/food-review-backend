const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Review = sequelize.define('Review', {
  rating: { type: DataTypes.INTEGER, allowNull: false },
  isi_review: { type: DataTypes.TEXT, allowNull: false },
}, { timestamps: true });

module.exports = Review;