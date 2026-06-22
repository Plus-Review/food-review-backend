const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Review = sequelize.define('Review', {
  rating: { type: DataTypes.INTEGER, allowNull: false },
  komentar: { type: DataTypes.TEXT, allowNull: false },
  // 🌟 TAMBAHKAN BARIS INI UNTUK MENYIMPAN FOTO REVIEW:
  images: { type: DataTypes.TEXT }, 
}, { timestamps: true });

module.exports = Review;