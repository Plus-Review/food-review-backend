module.exports = (sequelize, DataTypes) => {
    const Favorite = sequelize.define("Favorite", {
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        umkm_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        }
    });

    return Favorite;
};