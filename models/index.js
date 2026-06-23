const sequelize = require('../config/db');
const User = require('./User');
const Umkm = require('./Umkm');
const Review = require('./Review');
const SavedUmkm = require('./SavedUmkm');
const Notification = require('./Notification');
const PendingRegistration = require('./PendingRegistration');

User.hasMany(Umkm, { foreignKey: 'userId', as: 'umkms' });
Umkm.belongsTo(User, { foreignKey: 'userId', as: 'owner' });
Umkm.hasMany(Review, { foreignKey: 'umkmId', as: 'reviews' });
Review.belongsTo(Umkm, { foreignKey: 'umkmId' });
User.hasMany(Review, { foreignKey: 'userId' });
Review.belongsTo(User, { foreignKey: 'userId' });
User.belongsToMany(Umkm, { through: SavedUmkm, as: 'savedUmkms', foreignKey: 'userId', otherKey: 'umkmId' });
Umkm.belongsToMany(User, { through: SavedUmkm, as: 'savedByUsers', foreignKey: 'umkmId', otherKey: 'userId' });
SavedUmkm.belongsTo(User, { foreignKey: 'userId' });
SavedUmkm.belongsTo(Umkm, { foreignKey: 'umkmId' });
User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });
Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Notification.belongsTo(Umkm, { foreignKey: 'relatedUmkmId', as: 'umkm' });

module.exports = {
    sequelize,
    User,
    Umkm,
    Review,
    SavedUmkm,
    Notification,
    PendingRegistration,
};
