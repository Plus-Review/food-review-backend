const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    const authHeader = req.header('Authorization') || '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ message: "Akses ditolak, silakan login" });
    }

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified; // Menyimpan ID user ke request
        next();
    } catch (err) {
        res.status(401).json({ message: "Sesi login tidak valid. Silakan login ulang." });
    }
};
