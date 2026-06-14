const { User } = require('../models');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Op } = require('sequelize');

const uploadsDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const profileStorage = multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        cb(null, `profile-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
});

const profileUpload = multer({
    storage: profileStorage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('File profil harus berupa gambar.'));
        }
        cb(null, true);
    },
}).single('profileImage');

const serializeUser = (user) => ({
    id: user.id,
    username: user.username,
    email: user.email,
    profileImage: user.profileImage || null,
});

const passwordRuleMessage = "Password wajib memiliki huruf besar, huruf kecil, angka, dan karakter unik.";

const isStrongPassword = (password) => (
    /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password)
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
        const username = String(req.body.username || '').trim();
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');

        if (!username || !email || !password) {
            return res.status(400).json({ message: "Username, email, dan password wajib diisi." });
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
            return res.status(409).json({ message: "Email sudah terdaftar." });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await User.create({
            username,
            email,
            password: hashedPassword,
            profileImage: null,
        });

        res.status(201).json({ message: "User berhasil terdaftar!", data: serializeUser(newUser) });
    } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ message: "Username atau email sudah digunakan." });
        }

        res.status(500).json({ message: err.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ where: { email } });

        if (!user) return res.status(404).json({ message: "User tidak ditemukan" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: "Password salah" });

        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1d' });

        res.json({ message: "Login Berhasil", token, user: serializeUser(user) });
    } catch (err) {
        res.status(500).json({ message: err.message });
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
        res.status(500).json({ message: err.message });
    }
};

exports.getStats = async (req, res) => {
    try {
        const totalUsers = await User.count();
        res.json({ totalUsers });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user) {
            return res.status(404).json({ message: "User tidak ditemukan" });
        }

        const username = String(req.body.username || '').trim();
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');

        if (!username || !email) {
            return res.status(400).json({ message: "Nama dan email wajib diisi." });
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

        user.username = username;
        user.email = email;

        if (password.trim()) {
            if (!isStrongPassword(password)) {
                return res.status(400).json({ message: passwordRuleMessage });
            }

            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(password, salt);
        }

        if (req.file) {
            user.profileImage = req.file.filename;
        }

        await user.save();

        res.json({ message: "Profile berhasil diperbarui.", user: serializeUser(user) });
    } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ message: "Nama atau email sudah digunakan." });
        }

        res.status(500).json({ message: err.message });
    }
};
