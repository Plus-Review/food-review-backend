const { Umkm, Review, User } = require('../models');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        // Ditambah angka random agar nama file tidak bentrok jika di-upload bersamaan
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});

// 🌟 PERBAIKAN: Gunakan .fields() untuk menerima berbagai jenis file dari frontend
const upload = multer({ storage }).fields([
    { name: 'image', maxCount: 1 },           // Foto sampul utama
    { name: 'detail_images', maxCount: 7 },   // Foto galeri UMKM
    { name: 'review_images', maxCount: 4 }    // Foto untuk review pelanggan
]);

// Export Multer agar bisa dipakai di router untuk fitur validasi review
exports.uploadMiddleware = upload; 

exports.createUmkm = (req, res) => {
    upload(req, res, async (err) => {
        if (err) return res.status(500).json({ message: "Gagal upload gambar" });

        try {
            const { nama_umkm, harga_range, jenis_makanan, deskripsi, alamat_teks, latitude, longitude } = req.body;

            if (!nama_umkm || nama_umkm.trim() === '') {
                return res.status(400).json({ message: "nama_umkm tidak boleh kosong!" });
            }

            // 1. Ambil nama file sampul utama
            let imageFileName = null;
            if (req.files && req.files['image']) {
                imageFileName = req.files['image'][0].filename;
            }

            // 2. Ambil array nama file galeri tambahan
            let detailImagesArray = [];
            if (req.files && req.files['detail_images']) {
                detailImagesArray = req.files['detail_images'].map(file => file.filename);
            }

            const newUmkm = await Umkm.create({
                nama_umkm,
                harga_range,
                jenis_makanan,
                deskripsi,
                alamat_teks,
                latitude: latitude || 0,
                longitude: longitude || 0,
                image: imageFileName,
                images: JSON.stringify(detailImagesArray), // Simpan array ke database
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
            where: { status: 'approved' }, // 🌟 HANYA TAMPILKAN YANG SUDAH DIVALIDASI
            include: [{ model: Review, as: 'reviews', required: false }],
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

exports.updateUmkm = (req, res) => {
    // 🌟 PERBAIKAN: Gunakan upload agar mendukung FormData saat Edit UMKM
    upload(req, res, async (err) => {
        if (err) return res.status(500).json({ message: "Gagal upload gambar saat update" });

        try {
            const { id } = req.params;
            const { nama_umkm, harga_range, jenis_makanan, deskripsi, alamat_teks, latitude, longitude, existing_detail_images } = req.body;

            const umkm = await Umkm.findByPk(id);
            if (!umkm) {
                return res.status(404).json({ message: "UMKM tidak ditemukan untuk diupdate" });
            }

            let updateData = {
                nama_umkm, harga_range, jenis_makanan, deskripsi, alamat_teks, latitude, longitude
            };

            // Timpa gambar sampul jika user mengupload yang baru
            if (req.files && req.files['image']) {
                updateData.image = req.files['image'][0].filename;
            }

            // Gabungkan gambar galeri yang lama dan yang baru
            let finalDetailImages = [];
            if (existing_detail_images) {
                try {
                    finalDetailImages = JSON.parse(existing_detail_images);
                } catch (e) {
                    finalDetailImages = [];
                }
            }

            if (req.files && req.files['detail_images']) {
                const newImages = req.files['detail_images'].map(f => f.filename);
                finalDetailImages = [...finalDetailImages, ...newImages];
            }

            updateData.images = JSON.stringify(finalDetailImages);

            await Umkm.update(updateData, { where: { id } });

            res.status(200).json({ message: "Data UMKM berhasil diperbarui!" });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });
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

        // Tangkap foto ulasan pelanggan
        let reviewImagesArray = [];
        if (req.files && req.files['review_images']) {
            reviewImagesArray = req.files['review_images'].map(file => file.filename);
        }

        const newReview = await Review.create({
            umkmId: umkmId,
            userId: idPengguna, 
            rating: rating,
            komentar: komentar,
            images: JSON.stringify(reviewImagesArray) // Menyimpan gambar review
        });

        const reviewData = typeof newReview.toJSON === 'function' ? newReview.toJSON() : newReview;

        res.status(201).json({ 
            message: "Review berhasil ditambahkan!", 
            review: { ...reviewData, User: { nama: req.user?.nama || "User" } }
        });
    } catch (error) {
        res.status(500).json({ message: "Terjadi kesalahan pada server", error: error.message });
    }
};

exports.updateReview = async (req, res) => {
    try {
        const { reviewId } = req.params;
        const { rating, komentar, existing_review_images } = req.body;
        
        const review = await Review.findByPk(reviewId);
        if (!review) return res.status(404).json({ message: "Review tidak ditemukan" });

        // Gabungkan foto review yang lama dan baru
        let finalImages = [];
        if (existing_review_images) {
            try { finalImages = JSON.parse(existing_review_images); } catch(e) {}
        }
        if (req.files && req.files['review_images']) {
            const newImages = req.files['review_images'].map(f => f.filename);
            finalImages = [...finalImages, ...newImages];
        }

        await review.update({
            rating,
            komentar,
            images: JSON.stringify(finalImages)
        });

        res.status(200).json({ message: "Review berhasil diperbarui!" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.deleteReview = async (req, res) => {
    try {
        const { reviewId } = req.params;
        const deletedRows = await Review.destroy({ where: { id: reviewId } });
        if (deletedRows === 0) return res.status(404).json({ message: "Review tidak ditemukan" });
        res.status(200).json({ message: "Review berhasil dihapus!" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getPendingUmkm = async (req, res) => {
    try {
        const pendingUmkms = await Umkm.findAll({
            where: { status: 'pending' },
            order: [['createdAt', 'DESC']]
        });
        res.status(200).json(pendingUmkms);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.verifyUmkm = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; 

        const umkm = await Umkm.findByPk(id);
        if (!umkm) return res.status(404).json({ message: "UMKM tidak ditemukan" });

        await umkm.update({ status });
        res.status(200).json({ message: `UMKM berhasil di-${status}!` });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getAdminStats = async (req, res) => {
    try {
        const totalUsers = await User.count({ where: { role: 'user' } });
        const totalUmkm = await Umkm.count({ where: { status: 'approved' } });
        const pendingUmkm = await Umkm.count({ where: { status: 'pending' } });
        const totalReviews = await Review.count();

        res.status(200).json({ totalUsers, totalUmkm, pendingUmkm, totalReviews });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};