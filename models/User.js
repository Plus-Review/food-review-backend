const { DataTypes } = require('sequelize');
const sequelize = require('../config/db'); // Memanggil langsung koneksi DB

const User = sequelize.define('User', {
    username: { 
        type: DataTypes.STRING, 
        allowNull: false 
    },
    email: { 
        type: DataTypes.STRING, 
        allowNull: false, 
        unique: true 
    },
    password: { 
        type: DataTypes.STRING, 
        allowNull: false 
    },
    // 🌟 KOLOM ROLE TETAP ADA
    role: { 
        type: DataTypes.STRING, 
        allowNull: false,
        defaultValue: 'user' 
    }
});

module.exports = User; // Ekspor langsung sebagai Object Model