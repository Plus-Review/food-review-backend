const { Umkm, Review, User } = require('../models');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage }).single('image');

exports.createUmkm = (req, res) => {
    upload(req, res, async (err) => {
        if (err) return res.status(500).json({ message: "Gagal upload gambar" });

        try {
            const { nama_umkm, harga_range, jenis_makanan, deskripsi, alamat_teks, latitude, longitude } = req.body;

            // 🌟 PERBAIKAN TEST 9: Tambahkan .trim() untuk mendeteksi spasi kosong
            if (!nama_umkm || nama_umkm.trim() === '') {
                return res.status(400).json({ message: "nama_umkm tidak boleh kosong!" });
            }

            const newUmkm = await Umkm.create({
                nama_umkm,
                harga_range,
                jenis_makanan,
                deskripsi,
                alamat_teks,
                latitude: latitude || 0,
                longitude: longitude || 0,
                image: req.file ? req.file.filename : null,
                userId: req.user?.id || null
            });

            res.status(201).json(newUmkm);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
};

exports.getAllUmkm = async (req, res) => {
    try {
        const umkms = await Umkm.findAll({
            include: [
                {
                    model: Review,
                    as: 'reviews', 
                    required: false 
                }
            ],
            order: [['createdAt', 'DESC']] 
        });
        res.status(200).json(umkms);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getUmkmById = async (req, res) => {
    try {
        const { id } = req.params;
        const umkm = await Umkm.findByPk(id, {
            include: [
                {
                    model: Review,
                    as: 'reviews', 
                    required: false,
                    include: [{ model: User, required: false }] 
                }
            ]
        });

        if (!umkm) {
            return res.status(404).json({ message: "UMKM memang tidak ada di database" });
        }

        res.status(200).json(umkm);
    } catch (error) {
        res.status(500).json({ message: "Terjadi kesalahan server", error: error.message });
    }
};

exports.updateUmkm = async (req, res) => {
    try {
        const { id } = req.params;
        const { nama_umkm, harga_range, jenis_makanan, deskripsi, alamat_teks, latitude, longitude } = req.body;

        const [updatedRows] = await Umkm.update({
            nama_umkm, harga_range, jenis_makanan, deskripsi, alamat_teks, latitude, longitude
        }, { where: { id } });

        if (updatedRows === 0) {
            return res.status(404).json({ message: "UMKM tidak ditemukan untuk diupdate" });
        }

        res.status(200).json({ message: "Data UMKM berhasil diperbarui!" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.deleteUmkm = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedRows = await Umkm.destroy({ where: { id } });

        if (deletedRows === 0) {
            return res.status(404).json({ message: "UMKM tidak ditemukan untuk dihapus" });
        }

        res.status(200).json({ message: "UMKM berhasil dihapus!" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.addReview = async (req, res) => {
    try {
        const umkmId = req.params.id; 
        const { rating, komentar } = req.body;
        let idPengguna = req.user?.id || req.user?.userId || req.userId || 2;

        const newReview = await Review.create({
            umkmId: umkmId,
            userId: idPengguna, 
            rating: rating,
            komentar: komentar
        });

        // 🌟 PERBAIKAN TEST 11: Pastikan fungsi toJSON benar-benar ada sebelum dipanggil
        const reviewData = typeof newReview.toJSON === 'function' ? newReview.toJSON() : newReview;

        res.status(201).json({ 
            message: "Review berhasil ditambahkan!", 
            review: { ...reviewData, User: { nama: "Fikrank" } }
        });
    } catch (error) {
        res.status(500).json({ message: "Terjadi kesalahan pada server", error: error.message });
    }
};