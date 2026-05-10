const sequelize = require('../config/db'); 
const User = require('./User');
const Umkm = require('./Umkm');

User.hasMany(Umkm, { foreignKey: 'userId', as: 'umkms' });
Umkm.belongsTo(User, { foreignKey: 'userId', as: 'owner' });

module.exports = {
    sequelize, // Objek koneksi (penting untuk sync database)
    User,      // Model User
    Umkm,      // Model Umkm
};