require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { sequelize } = require('./models');
const { ensureDefaultAdmins } = require('./utils/adminSeed');
const { isMailerConfigured, verifyMailerConnection } = require('./utils/mailer');
const path = require('path');
const app = express();
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}
const allowedOrigins = (process.env.CLIENT_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const hasWeakJwtSecret = !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16;
if (hasWeakJwtSecret) {
    const message = 'JWT_SECRET wajib berupa secret panjang dan acak minimal 16 karakter.';
    if (process.env.NODE_ENV === 'production') {
        throw new Error(message);
    }
    console.warn(`Peringatan: ${message}`);
}

if (process.env.NODE_ENV === 'production' && !isMailerConfigured()) {
    throw new Error('Konfigurasi SMTP wajib diisi agar verifikasi email dan reset password dapat digunakan.');
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

const credentialRecoveryLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Permintaan keamanan akun terlalu sering. Coba lagi dalam 15 menit.' },
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
app.use([
    '/api/auth/verify-email',
    '/api/auth/resend-verification',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
], credentialRecoveryLimiter);
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

app.get('/api/health', async (req, res) => {
    try {
        await sequelize.authenticate();
        res.status(200).json({ status: 'ok', service: 'plus-review-api' });
    } catch {
        res.status(503).json({ status: 'unavailable', service: 'plus-review-api' });
    }
});

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
const shouldAlterSchema = process.env.DB_SYNC_ALTER === 'true'
    || (process.env.NODE_ENV !== 'production' && process.env.DB_SYNC_ALTER !== 'false');
const syncOptions = shouldAlterSchema ? { alter: true } : {};
const smtpVerifySetting = String(process.env.SMTP_VERIFY_ON_START || '').toLowerCase();
const shouldVerifySmtpOnStart = smtpVerifySetting === 'true'
    || (process.env.NODE_ENV === 'production' && smtpVerifySetting !== 'false');

let httpServer;

sequelize.sync(syncOptions)
    .then(async () => {
        if (shouldVerifySmtpOnStart) {
            await verifyMailerConnection();
            console.log('--- Koneksi SMTP Berhasil Diverifikasi ---');
        }
        await ensureDefaultAdmins();
        console.log('--- Database & Tabel Berhasil Disinkronkan ---');
        httpServer = app.listen(PORT, () => {
            console.log(`Server aktif di: http://localhost:${PORT}`);
        });
    })
    .catch(async (err) => {
        console.error('Gagal memulai server:', err);
        try {
            await sequelize.close();
        } finally {
            process.exit(1);
        }
    });

const shutdown = (signal) => {
    console.log(`${signal} diterima. Menutup server dengan aman...`);

    const forceExitTimer = setTimeout(() => process.exit(1), 10000);
    forceExitTimer.unref();

    const closeDatabase = async () => {
        try {
            await sequelize.close();
            process.exit(0);
        } catch (error) {
            console.error('Gagal menutup koneksi database:', error.message);
            process.exit(1);
        }
    };

    if (httpServer) {
        httpServer.close(closeDatabase);
        return;
    }

    void closeDatabase();
};

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
