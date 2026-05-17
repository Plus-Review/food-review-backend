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
exports.getAllUmkm = async (req, res) => {
    try {
        const umkmList = await Umkm.findAll();
        res.status(200).json(umkmList);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.createUmkm = (req, res) => {
    upload(req, res, async (err) => {
        console.log('=== DEBUG ===');
        console.log('req.body:', req.body);
        console.log('req.file:', req.file);
        console.log('content-type:', req.headers['content-type']);
        if (err) return res.status(500).json({ message: "Gagal upload gambar" });

        try {
            const { nama_umkm, harga_range, jenis_makanan, deskripsi, alamat_teks, latitude, longitude } = req.body;

            if (!nama_umkm) {
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
            console.error('=== ERROR DETAIL ===');
            console.error('Name:', error.name);
            console.error('Message:', error.message);
            res.status(500).json({ message: error.message });
        }
    });
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
                    include: [
                        { 
                            model: User, 
                            required: false 
                        }
                    ] 
                }
            ]
        });

        if (!umkm) {
            return res.status(404).json({ message: "UMKM memang tidak ada di database" });
        }

        res.status(200).json(umkm);
    } catch (error) {
        console.error("🔥 ERROR DETAIL UMKM:", error.message); 
        res.status(500).json({ message: "Terjadi kesalahan server", error: error.message });
    }
};

exports.addReview = async (req, res) => {
    try {
        const umkmId = req.params.id; 
        const { rating, komentar } = req.body;

        let idPengguna = null;
        if (req.user && req.user.id) idPengguna = req.user.id;
        else if (req.user && req.user.userId) idPengguna = req.user.userId;
        else if (req.userId) idPengguna = req.userId;
        
        if (!idPengguna) {
            console.log("⚠️ Peringatan: ID dari token gagal dibaca. Menggunakan ID fallback (2).");
            idPengguna = 2; 
        }

        const newReview = await Review.create({
            umkmId: umkmId,
            userId: idPengguna, 
            rating: rating,
            komentar: komentar
        });

        res.status(201).json({ 
            message: "Review berhasil ditambahkan!", 
            review: {
                ...newReview.toJSON(),
                User: { nama: "Fikrank" } 
            }
        });

    } catch (error) {
        console.error("🔥 Gagal simpan review ke MySQL:", error.message);
        res.status(500).json({ message: "Terjadi kesalahan pada server", error: error.message });
    }
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
        console.error("Gagal mengambil data UMKM:", error.message);
        res.status(500).json({ message: error.message });
    }
};