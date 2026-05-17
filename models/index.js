const sequelize = require('../config/db'); 
const User = require('./User');
const Umkm = require('./Umkm');
const Review = require('./Review'); 

User.hasMany(Umkm, { foreignKey: 'userId', as: 'umkms' });
Umkm.belongsTo(User, { foreignKey: 'userId', as: 'owner' });
Umkm.hasMany(Review, { foreignKey: 'umkmId', as: 'reviews' });
Review.belongsTo(Umkm, { foreignKey: 'umkmId' });
User.hasMany(Review, { foreignKey: 'userId' });
Review.belongsTo(User, { foreignKey: 'userId' });

module.exports = {
    sequelize,
    User,
    Umkm,
    Review 
};