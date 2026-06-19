require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sequelize = require('./config/db');
const User = require('./models/User');
const Umkm = require('./models/Umkm');
const Review = require('./models/Review'); 
const Notification = require('./models/Notification');
const path = require('path');
const app = express();
const allowedOrigins = (process.env.CLIENT_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    console.warn('Peringatan: JWT_SECRET belum kuat. Gunakan secret panjang dan acak sebelum deploy.');
}

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 500,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Terlalu banyak request. Coba lagi beberapa menit.' },
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Percobaan login/registrasi terlalu sering. Coba lagi nanti.' },
});

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || (allowedOrigins.length === 0 && process.env.NODE_ENV !== 'production')) {
            callback(null, true);
            return;
        }

        callback(new Error('Origin tidak diizinkan oleh konfigurasi CORS.'));
    },
}));
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use('/api', apiLimiter);
app.use(['/api/auth/login', '/api/auth/register', '/api/admin/login'], authLimiter);
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/umkm', require('./routes/umkmRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    fallthrough: false,
    maxAge: '7d',
    immutable: true,
    setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', 'inline');
    },
}));

// Relasi model
User.hasMany(Umkm, { foreignKey: 'userId', onDelete: 'CASCADE' });
Umkm.belongsTo(User, { foreignKey: 'userId' });
Umkm.hasMany(Review, { foreignKey: 'umkmId', onDelete: 'CASCADE' });
Review.belongsTo(Umkm, { foreignKey: 'umkmId' });
User.hasMany(Review, { foreignKey: 'userId', onDelete: 'CASCADE' });
Review.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(Notification, { foreignKey: 'userId', onDelete: 'CASCADE' });
Notification.belongsTo(User, { foreignKey: 'userId' });
Notification.belongsTo(Umkm, { foreignKey: 'relatedUmkmId' });

app.get('/', (req, res) => {
    res.send('API Food Review Kampus Berjalan Lancar!');
});

app.use((err, req, res, next) => {
    if (res.headersSent) {
        next(err);
        return;
    }

    if (err?.type === 'entity.too.large') {
        return res.status(413).json({ message: 'Payload terlalu besar.' });
    }

    if (err?.message?.includes('CORS')) {
        return res.status(403).json({ message: 'Origin tidak diizinkan.' });
    }

    res.status(err?.status || 500).json({
        message: process.env.NODE_ENV === 'production'
            ? 'Terjadi kesalahan server.'
            : err?.message || 'Terjadi kesalahan server.',
    });
});

const PORT = process.env.PORT || 5000;
sequelize.sync({ alter: true })
    .then(() => {
        console.log('--- Database & Tabel Berhasil Disinkronkan ---');
        app.listen(PORT, () => {
            console.log(`Server aktif di: http://localhost:${PORT}`);
        });
    })
    .catch((err) => {
        console.error('Gagal sinkronisasi database:', err);
    });
