const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { isDefaultAdminUsername, normalizeAdminUsername } = require('../utils/adminCredentials');

module.exports = async (req, res, next) => {
    const authHeader = req.header('Authorization') || '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ message: 'Akses admin ditolak. Silakan login admin.' });
    }

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        if (verified?.role !== 'admin') {
            return res.status(403).json({ message: 'Akun ini tidak memiliki akses admin.' });
        }

        const tokenUsername = normalizeAdminUsername(verified.username);
        if (!isDefaultAdminUsername(tokenUsername)) {
            return res.status(403).json({ message: 'Akun admin tidak aktif atau tidak ditemukan.' });
        }

        const adminId = verified.id || verified.userId || verified.adminId;
        if (!adminId) {
            return res.status(401).json({ message: 'Sesi admin lama tidak valid. Silakan login ulang.' });
        }

        let admin = await User.findOne({
            where: {
                id: adminId,
                role: 'admin',
                ...(tokenUsername ? { username: tokenUsername } : {}),
            },
            attributes: ['id', 'username', 'name', 'email', 'profileImage', 'role', 'tokenVersion'],
        });

        if (!admin && tokenUsername) {
            admin = await User.findOne({
                where: {
                    username: tokenUsername,
                    role: 'admin',
                },
                attributes: ['id', 'username', 'name', 'email', 'profileImage', 'role', 'tokenVersion'],
            });
        }

        if (!admin) {
            return res.status(403).json({ message: 'Akun admin tidak aktif atau tidak ditemukan.' });
        }

        if (Number(verified.tokenVersion || 0) !== Number(admin.tokenVersion || 0)) {
            return res.status(401).json({ message: 'Sesi admin sudah berakhir. Silakan login ulang.' });
        }

        req.admin = {
            role: 'admin',
            adminId: admin.id,
            userId: admin.id,
            username: admin.username,
            name: admin.name || admin.username,
            email: admin.email,
            profileImage: admin.profileImage || null,
        };
        next();
    } catch (error) {
        res.status(401).json({ message: 'Sesi admin tidak valid. Silakan login ulang.' });
    }
};
