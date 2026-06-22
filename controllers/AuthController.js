const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.register = async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Cek apakah email sudah terdaftar
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'Email sudah terdaftar!' });
        }

        // Enkripsi password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 🌟 BUAT USER BARU DAN PAKSA ROLE-NYA MENJADI 'user'
        const newUser = await User.create({
            username,
            email,
            password: hashedPassword,
            role: 'user' // Mencegah user nakal mengirim role 'admin' lewat API
        });

        res.status(201).json({ 
            message: 'Registrasi berhasil', 
            data: { id: newUser.id, username: newUser.username, email: newUser.email, role: newUser.role }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ where: { email } });

        if (!user) return res.status(404).json({ message: "User tidak ditemukan" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: "Password salah" });

        // 🌟 PERBAIKAN 1: Masukkan role ke dalam token JWT agar Middleware Admin bisa membacanya
        const token = jwt.sign(
            { id: user.id, role: user.role }, 
            process.env.JWT_SECRET || 'plus_ultra', 
            { expiresIn: '1d' }
        );

        // 🌟 PERBAIKAN 2: Sertakan role (dan email) untuk dikirim ke Frontend!
        res.json({ 
            message: "Login Berhasil", 
            token, 
            user: { 
                id: user.id, 
                username: user.username,
                email: user.email,
                role: user.role // 👈 INI KUNCINYA AGAR REDIRECT BERHASIL
            } 
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};