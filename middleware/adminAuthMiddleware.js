const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
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

        req.admin = verified;
        next();
    } catch {
        res.status(401).json({ message: 'Sesi admin tidak valid. Silakan login ulang.' });
    }
};
