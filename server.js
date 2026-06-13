require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const os = require('os');
const cluster = require('cluster');
const numCPUs = os.cpus().length;

// ─── IMPORT DATABASE & MODELS ───
const sequelize = require('./config/db');
const { DataTypes } = require('sequelize'); // Wajib untuk Favorite
const User = require('./models/User');
const Umkm = require('./models/Umkm');
const Review = require('./models/Review'); 
const FavoriteModel = require('./models/Favorite')(sequelize, DataTypes); // Import Model Favorit

const app = express();

// 🌟 1. MIDDLEWARE WAJIB DI ATAS (SANGAT PENTING!)
app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));

// 🌟 2. DAFTARKAN ROUTES (Harus di bawah CORS)
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/umkm', require('./routes/umkmRoutes'));
app.use('/api/favorit', require('./routes/favoriteRoutes')); // Rute Favorit
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 🌟 3. RELASI MODEL (Lengkap dengan Favorit)
User.hasMany(Umkm, { foreignKey: 'userId', onDelete: 'CASCADE' });
Umkm.belongsTo(User, { foreignKey: 'userId' });

Umkm.hasMany(Review, { foreignKey: 'umkmId', onDelete: 'CASCADE' });
Review.belongsTo(Umkm, { foreignKey: 'umkmId' });

User.hasMany(Review, { foreignKey: 'userId', onDelete: 'CASCADE' });
Review.belongsTo(User, { foreignKey: 'userId' });

// Relasi Favorit
User.hasMany(FavoriteModel, { foreignKey: 'user_id', onDelete: 'CASCADE' });
FavoriteModel.belongsTo(User, { foreignKey: 'user_id' });

Umkm.hasMany(FavoriteModel, { foreignKey: 'umkm_id', onDelete: 'CASCADE' });
FavoriteModel.belongsTo(Umkm, { foreignKey: 'umkm_id', as: 'umkmDetail' });

app.get('/', (req, res) => {
    res.send('API Food Review Kampus Berjalan Lancar!');
});

const PORT = process.env.PORT || 5000;

// 🌟 4. LOGIKA CLUSTER & SYNC DIPERBAIKI (Agar tidak bertabrakan)
if (cluster.isMaster) {
    console.log(`Master Node sedang berjalan dengan PID ${process.pid}`);
    console.log(`Menyiapkan ${numCPUs} pekerja (workers) untuk menahan beban...`);

    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`Pekerja ${worker.process.pid} mati. Menghidupkan ulang...`);
        cluster.fork();
    });
} else {
    // Sinkronisasi Database dulu, LALU jalankan server (Cukup 1 kali panggil app.listen)
    sequelize.sync()
        .then(() => {
            console.log(`--- Database & Tabel Berhasil Disinkronkan (Worker ${process.pid}) ---`);
            app.listen(PORT, () => {
                console.log(`Server aktif di: http://localhost:${PORT}`);
            });
        })
        .catch((err) => {
            console.error('Gagal sinkronisasi database:', err);
        });
}