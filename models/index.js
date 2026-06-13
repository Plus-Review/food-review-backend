const { DataTypes } = require('sequelize');
const sequelize = require('../config/db'); 
const User = require('./User');
const Umkm = require('./Umkm');
const Review = require('./Review'); 
const Favorite = require('./Favorite.js')(sequelize, DataTypes);

User.hasMany(Umkm, { foreignKey: 'userId', as: 'umkms' });
Umkm.belongsTo(User, { foreignKey: 'userId', as: 'owner' });
Umkm.hasMany(Review, { foreignKey: 'umkmId', as: 'reviews' });
Review.belongsTo(Umkm, { foreignKey: 'umkmId' });
User.hasMany(Review, { foreignKey: 'userId' });
Review.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(Favorite, { foreignKey: 'user_id' });
Favorite.belongsTo(User, { foreignKey: 'user_id' });
Umkm.hasMany(Favorite, { foreignKey: 'umkm_id' });
Favorite.belongsTo(Umkm, { foreignKey: 'umkm_id', as: 'umkmDetail' });

module.exports = {
    sequelize,
    User,
    Umkm,
    Review,
    Favorite
};