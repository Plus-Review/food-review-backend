const { User } = require('../models');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Op } = require('sequelize');
const {
    cleanEmail,
    cleanText,
    createUploadFilename,
    getSafeErrorMessage,
    imageFileFilter,
    isValidEmail,
} = require('../utils/security');
const { isDefaultAdminUsername, normalizeAdminUsername } = require('../utils/adminCredentials');
const { ensureDefaultAdmins } = require('../utils/adminSeed');
const { sendPasswordResetEmail, sendVerificationEmail } = require('../utils/mailer');

const uploadsDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const profileStorage = multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
        cb(null, createUploadFilename('profile', file));
    },
});

const profileUpload = multer({
    storage: profileStorage,
    limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 8 },
    fileFilter: imageFileFilter('Foto profil'),
}).single('profileImage');

const serializeUser = (user) => ({
    id: user.id,
    username: user.username,
    name: user.name || user.username,
    email: user.email,
    profileImage: user.profileImage || null,
    role: user.role || 'user',
    emailVerified: user.emailVerified !== false,
});

const passwordRuleMessage = "Password wajib memiliki huruf besar, huruf kecil, angka, dan karakter unik.";
const VERIFICATION_TTL_MS = 15 * 60 * 1000;
const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const BCRYPT_ROUNDS = 12;

const isStrongPassword = (password) => (
    password.length >= 8
    && password.length <= 72
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password)
);

const hashOneTimeToken = (token) => crypto
    .createHash('sha256')
    .update(String(token || ''))
    .digest('hex');

const createVerificationCode = () => crypto.randomInt(100000, 1000000).toString();

const setVerificationChallenge = (user, code) => {
    user.emailVerified = false;
    user.emailVerificationTokenHash = hashOneTimeToken(code);
    user.emailVerificationExpiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);
};

const hasMatchingTokenHash = (candidate, storedHash) => {
    if (!storedHash || !/^[a-f0-9]{64}$/i.test(storedHash)) return false;
    const candidateHash = Buffer.from(hashOneTimeToken(candidate), 'hex');
    const expectedHash = Buffer.from(storedHash, 'hex');
    return candidateHash.length === expectedHash.length
        && crypto.timingSafeEqual(candidateHash, expectedHash);
};

const getDevelopmentValue = (value) => (
    process.env.NODE_ENV === 'production' ? undefined : value
);

exports.uploadProfileImage = (req, res, next) => {
    profileUpload(req, res, (err) => {
        if (!err) {
            next();
            return;
        }

        const message = err.code === 'LIMIT_FILE_SIZE'
            ? 'Ukuran foto profil maksimal 2MB.'
            : err.message || 'Gagal upload foto profil.';
        res.status(400).json({ message });
    });
};

exports.register = async (req, res) => {
    try {
        const username = cleanText(req.body.username, 60);
        const email = cleanEmail(req.body.email);
        const password = String(req.body.password || '');

        if (!username || !email || !password) {
            return res.status(400).json({ message: "Username, email, dan password wajib diisi." });
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({ message: "Format email tidak valid." });
        }

        if (!isStrongPassword(password)) {
            return res.status(400).json({ message: passwordRuleMessage });
        }

        const usernameExists = await User.findOne({ where: { username } });
        if (usernameExists) {
            return res.status(409).json({ message: "Username sudah digunakan." });
        }

        const emailExists = await User.findOne({ where: { email } });
        if (emailExists) {
            return res.status(409).json({
                message: emailExists.emailVerified === false
                    ? "Email sudah terdaftar tetapi belum diverifikasi. Kirim ulang kode verifikasi."
                    : "Email sudah terdaftar.",
                code: emailExists.emailVerified === false ? 'EMAIL_NOT_VERIFIED' : 'EMAIL_EXISTS',
                requiresVerification: emailExists.emailVerified === false,
                email: emailExists.emailVerified === false ? email : undefined,
            });
        }

        const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
        const hashedPassword = await bcrypt.hash(password, salt);
        const verificationCode = createVerificationCode();

        const newUser = await User.create({
            username,
            name: username,
            email,
            password: hashedPassword,
            profileImage: null,
            emailVerified: false,
            emailVerificationTokenHash: hashOneTimeToken(verificationCode),
            emailVerificationExpiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
            tokenVersion: 0,
            role: 'user',
        });

        let delivery = { delivered: false, development: false };
        try {
            delivery = await sendVerificationEmail({
                to: email,
                name: username,
                code: verificationCode,
            });
        } catch (mailError) {
            console.error('Gagal mengirim email verifikasi:', mailError.message);
        }

        res.status(201).json({
            message: delivery.delivered
                ? "Akun berhasil dibuat. Periksa email untuk kode verifikasi."
                : "Akun berhasil dibuat. Kode verifikasi belum terkirim; gunakan tombol kirim ulang.",
            data: serializeUser(newUser),
            requiresVerification: true,
            email,
            emailSent: delivery.delivered,
            devVerificationCode: delivery.development
                ? getDevelopmentValue(verificationCode)
                : undefined,
        });
    } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ message: "Username atau email sudah digunakan." });
        }

        res.status(500).json({ message: getSafeErrorMessage(err) });
    }
};

exports.login = async (req, res) => {
    try {
        const rawLoginId = cleanText(req.body.loginId, 160);
        const rawEmail = cleanText(req.body.email, 160);
        const loginId = rawLoginId || rawEmail;
        const password = String(req.body.password || '');

        if (!loginId || !password) {
            return res.status(401).json({ message: "Email atau password salah." });
        }

        const isEmailLogin = isValidEmail(cleanEmail(loginId));
        const isLegacyEmailField = !rawLoginId && Boolean(rawEmail);
        const normalizedUsername = normalizeAdminUsername(loginId);
        const isAdminUsernameLogin = !isEmailLogin && isDefaultAdminUsername(normalizedUsername);

        if (isLegacyEmailField && !isEmailLogin && !isAdminUsernameLogin) {
            return res.status(401).json({ message: "Email atau password salah." });
        }

        if (!isEmailLogin && !isAdminUsernameLogin) {
            return res.status(401).json({ message: "Akun biasa wajib login menggunakan email." });
        }

        if (isAdminUsernameLogin) {
            await ensureDefaultAdmins();
        }

        const user = await User.findOne({
            where: isEmailLogin
                ? { email: cleanEmail(loginId) }
                : { username: normalizedUsername, role: 'admin' },
        });

        if (!user) {
            return res.status(401).json({
                message: isAdminUsernameLogin
                    ? "Username atau password admin salah."
                    : "Email atau password salah.",
            });
        }

        const role = user.role || 'user';
        if (isEmailLogin && role === 'admin') {
            return res.status(401).json({ message: "Admin wajib login menggunakan username admin." });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({
                message: isAdminUsernameLogin
                    ? "Username atau password admin salah."
                    : "Email atau password salah.",
            });
        }

        if (role !== 'admin' && user.emailVerified === false) {
            return res.status(403).json({
                message: "Email belum diverifikasi. Masukkan kode yang telah dikirim ke email kamu.",
                code: 'EMAIL_NOT_VERIFIED',
                requiresVerification: true,
                email: user.email,
            });
        }

        const token = jwt.sign({
            id: user.id,
            userId: user.id,
            role,
            username: user.username,
            name: user.name || user.username,
            tokenVersion: Number(user.tokenVersion || 0),
        }, process.env.JWT_SECRET, { expiresIn: '1d' });
        const serializedUser = serializeUser(user);

        res.json({
            message: role === 'admin' ? "Login admin berhasil." : "Login Berhasil",
            token,
            user: serializedUser,
            admin: role === 'admin' ? {
                id: serializedUser.id,
                username: serializedUser.username,
                name: serializedUser.name,
                email: serializedUser.email,
                profileImage: serializedUser.profileImage,
                role: 'admin',
            } : undefined,
        });
    } catch (err) {
        res.status(500).json({ message: getSafeErrorMessage(err) });
    }
};

exports.verifyEmail = async (req, res) => {
    try {
        const email = cleanEmail(req.body.email);
        const code = cleanText(req.body.code, 6);
        const user = await User.findOne({ where: { email, role: 'user' } });

        if (!user || !/^\d{6}$/.test(code)) {
            return res.status(400).json({ message: 'Kode verifikasi tidak valid atau sudah kedaluwarsa.' });
        }

        if (user.emailVerified !== false) {
            return res.json({ message: 'Email sudah terverifikasi. Silakan login.' });
        }

        const expiresAt = new Date(user.emailVerificationExpiresAt || 0).getTime();
        if (expiresAt <= Date.now() || !hasMatchingTokenHash(code, user.emailVerificationTokenHash)) {
            return res.status(400).json({ message: 'Kode verifikasi tidak valid atau sudah kedaluwarsa.' });
        }

        user.emailVerified = true;
        user.emailVerificationTokenHash = null;
        user.emailVerificationExpiresAt = null;
        await user.save();

        res.json({ message: 'Email berhasil diverifikasi. Akun kamu siap digunakan.' });
    } catch (err) {
        res.status(500).json({ message: getSafeErrorMessage(err) });
    }
};

exports.resendVerification = async (req, res) => {
    try {
        const email = cleanEmail(req.body.email);
        const user = await User.findOne({ where: { email, role: 'user' } });
        const genericMessage = 'Jika akun belum terverifikasi, kode baru akan dikirim ke email tersebut.';

        if (!user || user.emailVerified !== false) {
            return res.json({ message: genericMessage });
        }

        const previousExpiry = new Date(user.emailVerificationExpiresAt || 0).getTime();
        const estimatedSentAt = previousExpiry - VERIFICATION_TTL_MS;
        if (estimatedSentAt > 0 && Date.now() - estimatedSentAt < VERIFICATION_RESEND_COOLDOWN_MS) {
            return res.status(429).json({ message: 'Tunggu sebentar sebelum meminta kode baru.' });
        }

        const verificationCode = createVerificationCode();
        setVerificationChallenge(user, verificationCode);
        await user.save();

        let delivery = { delivered: false, development: false };
        try {
            delivery = await sendVerificationEmail({
                to: user.email,
                name: user.name || user.username,
                code: verificationCode,
            });
        } catch (mailError) {
            console.error('Gagal mengirim ulang email verifikasi:', mailError.message);
        }

        res.json({
            message: delivery.delivered
                ? genericMessage
                : 'Kode baru dibuat tetapi email belum terkirim. Periksa konfigurasi email aplikasi.',
            emailSent: delivery.delivered,
            devVerificationCode: delivery.development
                ? getDevelopmentValue(verificationCode)
                : undefined,
        });
    } catch (err) {
        res.status(500).json({ message: getSafeErrorMessage(err) });
    }
};

exports.forgotPassword = async (req, res) => {
    const genericMessage = 'Jika email terdaftar, tautan reset password akan dikirim beberapa saat lagi.';

    try {
        const email = cleanEmail(req.body.email);
        const user = await User.findOne({ where: { email, role: 'user' } });

        if (!user) {
            return res.json({ message: genericMessage });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        user.passwordResetTokenHash = hashOneTimeToken(resetToken);
        user.passwordResetExpiresAt = new Date(Date.now() + RESET_TTL_MS);
        await user.save();

        let delivery = { delivered: false, development: false };
        try {
            delivery = await sendPasswordResetEmail({
                to: user.email,
                name: user.name || user.username,
                token: resetToken,
            });
        } catch (mailError) {
            console.error('Gagal mengirim email reset password:', mailError.message);
        }

        res.json({
            message: genericMessage,
            emailSent: delivery.delivered,
            devResetToken: delivery.development
                ? getDevelopmentValue(resetToken)
                : undefined,
        });
    } catch (err) {
        console.error('Gagal memproses permintaan reset password:', err.message);
        res.json({ message: genericMessage });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const token = String(req.body.token || '');
        const password = String(req.body.password || '');

        if (!/^[a-f0-9]{64}$/i.test(token) || !isStrongPassword(password)) {
            return res.status(400).json({
                message: !isStrongPassword(password)
                    ? passwordRuleMessage
                    : 'Tautan reset password tidak valid atau sudah kedaluwarsa.',
            });
        }

        const user = await User.findOne({
            where: {
                role: 'user',
                passwordResetTokenHash: hashOneTimeToken(token),
                passwordResetExpiresAt: { [Op.gt]: new Date() },
            },
        });

        if (!user) {
            return res.status(400).json({ message: 'Tautan reset password tidak valid atau sudah kedaluwarsa.' });
        }

        const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
        user.password = await bcrypt.hash(password, salt);
        user.passwordResetTokenHash = null;
        user.passwordResetExpiresAt = null;
        user.tokenVersion = Number(user.tokenVersion || 0) + 1;
        await user.save();

        res.json({ message: 'Password berhasil diperbarui. Silakan login dengan password baru.' });
    } catch (err) {
        res.status(500).json({ message: getSafeErrorMessage(err) });
    }
};

exports.getProfile = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user) {
            return res.status(404).json({ message: "User tidak ditemukan" });
        }

        res.json({ user: serializeUser(user) });
    } catch (err) {
        res.status(500).json({ message: getSafeErrorMessage(err) });
    }
};

exports.getStats = async (req, res) => {
    try {
        const totalUsers = await User.count({ where: { role: 'user' } });
        res.json({ totalUsers });
    } catch (err) {
        res.status(500).json({ message: getSafeErrorMessage(err) });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user) {
            return res.status(404).json({ message: "User tidak ditemukan" });
        }

        const username = cleanText(req.body.username, 60);
        const email = cleanEmail(req.body.email);
        const password = String(req.body.password || '');

        if (!username || !email) {
            return res.status(400).json({ message: "Nama dan email wajib diisi." });
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({ message: "Format email tidak valid." });
        }

        const hasChanges = username !== user.username
            || email !== user.email
            || Boolean(password.trim())
            || Boolean(req.file);

        if (!hasChanges) {
            return res.status(400).json({ message: "Isi perubahan terlebih dahulu sebelum menyimpan." });
        }

        const usernameExists = await User.findOne({
            where: {
                username,
                id: { [Op.ne]: user.id },
            },
        });
        if (usernameExists) {
            return res.status(409).json({ message: "Nama sudah digunakan." });
        }

        const emailExists = await User.findOne({
            where: {
                email,
                id: { [Op.ne]: user.id },
            },
        });
        if (emailExists) {
            return res.status(409).json({ message: "Email sudah terdaftar." });
        }

        const emailChanged = email !== user.email;
        const verificationCode = emailChanged && (user.role || 'user') !== 'admin'
            ? createVerificationCode()
            : null;

        user.username = username;
        user.email = email;
        if ((user.role || 'user') !== 'admin') {
            user.name = username;
        }

        if (password.trim()) {
            if (!isStrongPassword(password)) {
                return res.status(400).json({ message: passwordRuleMessage });
            }

            const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
            user.password = await bcrypt.hash(password, salt);
            user.tokenVersion = Number(user.tokenVersion || 0) + 1;
        }

        if (req.file) {
            user.profileImage = req.file.filename;
        }

        if (verificationCode) {
            setVerificationChallenge(user, verificationCode);
        }

        await user.save();

        let delivery = { delivered: false, development: false };
        if (verificationCode) {
            try {
                delivery = await sendVerificationEmail({
                    to: user.email,
                    name: user.name || user.username,
                    code: verificationCode,
                });
            } catch (mailError) {
                console.error('Gagal mengirim verifikasi email baru:', mailError.message);
            }
        }

        res.json({
            message: verificationCode
                ? 'Profile diperbarui. Verifikasi email baru sebelum melanjutkan.'
                : 'Profile berhasil diperbarui.',
            user: serializeUser(user),
            requiresVerification: Boolean(verificationCode),
            email: verificationCode ? user.email : undefined,
            emailSent: verificationCode ? delivery.delivered : undefined,
            sessionInvalidated: Boolean(password.trim()),
            devVerificationCode: verificationCode && delivery.development
                ? getDevelopmentValue(verificationCode)
                : undefined,
        });
    } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ message: "Nama atau email sudah digunakan." });
        }

        res.status(500).json({ message: getSafeErrorMessage(err) });
    }
};
