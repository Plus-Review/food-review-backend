require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const os = require('os');
const cluster = require('cluster');
const bcrypt = require('bcryptjs'); // 🌟 PERBAIKAN 1: Import bcryptjs
const numCPUs = os.cpus().length;

// ─── IMPORT DATABASE & MODELS ───
const sequelize = require('./config/db');
const { DataTypes } = require('sequelize');
const User = require('./models/User');
const Umkm = require('./models/Umkm');
const Review = require('./models/Review'); 
const FavoriteModel = require('./models/Favorite')(sequelize, DataTypes);

const app = express();

// 🌟 1. MIDDLEWARE WAJIB DI ATAS
app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));

// 🌟 2. DAFTARKAN ROUTES
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/umkm', require('./routes/umkmRoutes'));
app.use('/api/favorit', require('./routes/favoriteRoutes'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 🌟 3. RELASI MODEL
User.hasMany(Umkm, { foreignKey: 'userId', onDelete: 'CASCADE' });
Umkm.belongsTo(User, { foreignKey: 'userId' });

Umkm.hasMany(Review, { foreignKey: 'umkmId', onDelete: 'CASCADE' });
Review.belongsTo(Umkm, { foreignKey: 'umkmId' });

User.hasMany(Review, { foreignKey: 'userId', onDelete: 'CASCADE' });
Review.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(FavoriteModel, { foreignKey: 'user_id', onDelete: 'CASCADE' });
FavoriteModel.belongsTo(User, { foreignKey: 'user_id' });

Umkm.hasMany(FavoriteModel, { foreignKey: 'umkm_id', onDelete: 'CASCADE' });
FavoriteModel.belongsTo(Umkm, { foreignKey: 'umkm_id', as: 'umkmDetail' });

app.get('/', (req, res) => {
    res.send('API Food Review Kampus Berjalan Lancar!');
});

const PORT = process.env.PORT || 5000;

// 🌟 FUNGSI PEMBUAT ADMIN (Dipindahkan ke atas agar bisa dibaca oleh Cluster)
const createDefaultAdmin = async () => {
    try {
        const adminExists = await User.findOne({ where: { role: 'admin' } });

        if (!adminExists) {
            console.log('⏳ Sedang membuat akun Admin default...');
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('admin123', salt);

            await User.create({
                username: 'Super Admin',
                email: 'admin@plusreview.com',
                password: hashedPassword,
                role: 'admin'
            });
            console.log('✅ Akun Admin berhasil dibuat!');
            console.log('📧 Email : admin@plusreview.com');
            console.log('🔑 Pass  : admin123');
        } else {
            console.log('ℹ️ Akun Admin sudah tersedia di database.');
        }
    } catch (error) {
        console.error('❌ Gagal membuat akun admin:', error.message);
    }
};

// 🌟 4. LOGIKA CLUSTER & SYNC DIPERBAIKI SANGAT AMAN
if (cluster.isMaster) {
    console.log(`Master Node sedang berjalan dengan PID ${process.pid}`);
    
    // PERBAIKAN 2, 3, & 4: 
    // Sinkronisasi dan pembuatan admin HANYA DILAKUKAN SEKALI di Master Node!
    sequelize.sync({ alter: true }) // Gunakan alter: true untuk menambah kolom role & status
        .then(async () => {
            console.log(`--- Database & Tabel Berhasil Disinkronkan ---`);
            
            // Panggil fungsinya di sini!
            await createDefaultAdmin(); 

            console.log(`Menyiapkan ${numCPUs} pekerja (workers) untuk menahan beban...`);
            for (let i = 0; i < numCPUs; i++) {
                cluster.fork();
            }
        })
        .catch((err) => {
            console.error('Gagal sinkronisasi database:', err);
        });

    cluster.on('exit', (worker, code, signal) => {
        console.log(`Pekerja ${worker.process.pid} mati. Menghidupkan ulang...`);
        cluster.fork();
    });
} else {
    // Pekerja (Worker) tugasnya hanya menjalankan server Express, tidak mengotak-atik database
    app.listen(PORT, () => {
        console.log(`Server aktif di: http://localhost:${PORT} (Worker ${process.pid})`);
    });
}