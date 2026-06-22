const adminMiddleware = (req, res, next) => {
    // Asumsi req.user sudah diisi oleh authMiddleware sebelumnya
    if (req.user && req.user.role === 'admin') {
        next(); // Jika admin, silakan lewat
    } else {
        return res.status(403).json({ message: "Akses ditolak! Hanya Admin yang berhak melakukan aksi ini." });
    }
};

module.exports = adminMiddleware;