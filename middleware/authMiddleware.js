const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async (req, res, next) => {
    const authHeader = req.header('Authorization') || '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ message: "Akses ditolak, silakan login" });
    }

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        const userId = verified.id || verified.userId;
        const user = await User.findByPk(userId, {
            attributes: ['id', 'username', 'name', 'email', 'profileImage', 'role', 'emailVerified', 'tokenVersion'],
        });

        if (!user) {
            return res.status(401).json({ message: 'Akun tidak ditemukan. Silakan login ulang.' });
        }

        if (Number(verified.tokenVersion || 0) !== Number(user.tokenVersion || 0)) {
            return res.status(401).json({ message: 'Sesi sudah berakhir. Silakan login kembali.' });
        }

        if ((user.role || 'user') !== 'admin' && user.emailVerified === false) {
            return res.status(403).json({
                message: 'Email belum diverifikasi.',
                code: 'EMAIL_NOT_VERIFIED',
                requiresVerification: true,
                email: user.email,
            });
        }

        req.user = {
            ...verified,
            id: user.id,
            userId: user.id,
            role: user.role || 'user',
        };
        next();
    } catch (err) {
        res.status(401).json({ message: "Sesi login tidak valid. Silakan login ulang." });
    }
};
