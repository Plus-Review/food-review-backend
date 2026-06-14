const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Umkm = sequelize.define('Umkm', {
  nama_umkm: { type: DataTypes.STRING, allowNull: false },
  harga_range: { type: DataTypes.STRING },
  jam_operasional: { type: DataTypes.STRING },
  jenis_makanan: { type: DataTypes.STRING },
  deskripsi: { type: DataTypes.TEXT },
  alamat_teks: { type: DataTypes.STRING },
  latitude: { type: DataTypes.DOUBLE }, 
  longitude: { type: DataTypes.DOUBLE }, 
  avg_rating: { type: DataTypes.FLOAT, defaultValue: 0 },
  image: { type: DataTypes.STRING }, // Menyimpan nama file (contoh: 171534.jpg)
  images: { type: DataTypes.JSON },
  userId: { type: DataTypes.INTEGER } // Penting untuk relasi pemilik UMKM
});

module.exports = Umkm;
