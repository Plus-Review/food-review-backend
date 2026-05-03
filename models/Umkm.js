const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Umkm = sequelize.define('Umkm', {
  nama_umkm: { type: DataTypes.STRING, allowNull: false },
  harga_range: { type: DataTypes.STRING },
  jenis_makanan: { type: DataTypes.STRING },
  deskripsi: { type: DataTypes.TEXT },
  alamat_teks: { type: DataTypes.STRING },
  latitude: { type: DataTypes.DOUBLE }, 
  longitude: { type: DataTypes.DOUBLE }, 
  avg_rating: { type: DataTypes.FLOAT, defaultValue: 0 },
  last_reviewed_at: { type: DataTypes.DATE }
});

module.exports = Umkm;