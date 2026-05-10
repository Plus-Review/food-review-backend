const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    const token = req.header('Authorization')?.split(' ')[1];
    if (!token) return res.status(401).json({ message: "Akses ditolak, silakan login" });

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified; // Menyimpan ID user ke request
        next();
    } catch (err) {
        res.status(400).json({ message: "Token tidak valid" });
    }
};