const db = require('../models');
const Favorite = db.Favorite;
const Umkm = db.Umkm; // Sesuaikan dengan nama model UMKM-mu

exports.toggleFavorite = async (req, res) => {
    try {
        // Asumsi middleware auth menyimpan data token di req.user
        const userId = req.user.id || req.user.userId; 
        const { umkm_id } = req.body;

        const cekFavorit = await Favorite.findOne({
            where: { user_id: userId, umkm_id: umkm_id }
        });

        if (cekFavorit) {
            await cekFavorit.destroy(); // Jika sudah ada, hapus (Batal favorit)
            return res.status(200).json({ message: "Dihapus dari favorit" });
        } else {
            await Favorite.create({ user_id: userId, umkm_id: umkm_id }); // Jika belum, tambah
            return res.status(201).json({ message: "Ditambahkan ke favorit" });
        }
    } catch (error) {
        res.status(500).json({ message: "Terjadi kesalahan", error: error.message });
    }
};

exports.getMyFavorites = async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        
        const favorites = await Favorite.findAll({
            where: { user_id: userId },
            include: [{ model: Umkm, as: 'umkmDetail' }] // Membawa detail warung
        });
        
        res.status(200).json(favorites);
    } catch (error) {
        res.status(500).json({ message: "Terjadi kesalahan", error: error.message });
    }
};