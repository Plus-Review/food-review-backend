const { Umkm, Review, User, SavedUmkm } = require('../models');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadsDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`);
    },
});

const upload = multer({ storage }).fields([
    { name: 'image', maxCount: 1 },
    { name: 'detail_images', maxCount: 7 },
]);

const reviewUpload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Foto review harus berupa gambar.'));
        }

        cb(null, true);
    },
}).array('review_images', 4);

const getAuthUserId = (req) => req.user?.id || req.user?.userId || req.userId || null;

const getUploadedFiles = (files, fieldName) => (
    Array.isArray(files?.[fieldName]) ? files[fieldName] : []
);

const getPrimaryImageFile = (files) => getUploadedFiles(files, 'image')[0] || null;

const getDetailImageFiles = (files) => getUploadedFiles(files, 'detail_images');

const normalizeImages = (images) => {
    if (Array.isArray(images)) return images.filter(Boolean);
    if (!images) return [];

    try {
        const parsed = JSON.parse(images);
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
        return [];
    }
};

const parseImageList = (value) => {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (!value) return null;

    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter(Boolean) : null;
    } catch {
        return null;
    }
};

const deleteUploadedImage = (filename) => {
    if (!filename) return;

    const imagePath = path.join(uploadsDir, filename);
    fs.unlink(imagePath, (err) => {
        if (err && err.code !== 'ENOENT') {
            console.error('Gagal menghapus file gambar:', err.message);
        }
    });
};

const deleteUploadedImages = (filenames = []) => {
    filenames.filter(Boolean).forEach(deleteUploadedImage);
};

const deleteRequestFiles = (files) => {
    const uploadedFiles = Array.isArray(files)
        ? files
        : Object.values(files || {}).flat();

    uploadedFiles.forEach((file) => deleteUploadedImage(file.filename));
};

const getUploadErrorMessage = (err) => {
    if (!err) return 'Gagal upload gambar.';

    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return 'Upload gagal. Maksimal 1 foto utama dan 7 foto detail.';
        }

        if (err.code === 'LIMIT_FILE_SIZE') {
            return 'Ukuran foto terlalu besar.';
        }

        return `Upload gagal: ${err.message}`;
    }

    return `Upload gagal: ${err.message || 'file tidak bisa disimpan.'}`;
};

const reviewInclude = {
    model: Review,
    as: 'reviews',
    required: false,
    include: [
        {
            model: User,
            required: false,
            attributes: ['id', 'username', 'email', 'profileImage'],
        },
    ],
};

const serializeSavedUmkm = (savedItem) => {
    const row = savedItem.toJSON();
    const umkm = row.Umkm;
    if (!umkm) return null;

    return {
        ...umkm,
        savedAt: row.createdAt,
    };
};

exports.getAllUmkm = async (req, res) => {
    try {
        const umkms = await Umkm.findAll({
            include: [reviewInclude],
            order: [['createdAt', 'DESC']],
        });

        res.status(200).json(umkms);
    } catch (error) {
        console.error('Gagal mengambil data UMKM:', error.message);
        res.status(500).json({ message: error.message });
    }
};

exports.createUmkm = (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            deleteRequestFiles(req.files);
            console.error('Gagal upload gambar UMKM:', err);
            return res.status(400).json({ message: getUploadErrorMessage(err) });
        }

        try {
            const {
                nama_umkm,
                harga_range,
                jam_operasional,
                jenis_makanan,
                deskripsi,
                alamat_teks,
                latitude,
                longitude,
            } = req.body;
            const primaryImage = getPrimaryImageFile(req.files);
            const detailImages = getDetailImageFiles(req.files).map((file) => file.filename);

            if (!String(nama_umkm || '').trim()) {
                deleteRequestFiles(req.files);
                return res.status(400).json({ message: 'Nama UMKM wajib diisi.' });
            }

            const newUmkm = await Umkm.create({
                nama_umkm: String(nama_umkm || '').trim(),
                harga_range: String(harga_range || '').trim(),
                jam_operasional: String(jam_operasional || '').trim(),
                jenis_makanan: String(jenis_makanan || '').trim(),
                deskripsi: String(deskripsi || '').trim(),
                alamat_teks: String(alamat_teks || '').trim(),
                latitude: latitude || 0,
                longitude: longitude || 0,
                image: primaryImage ? primaryImage.filename : null,
                images: detailImages,
                userId: getAuthUserId(req),
            });

            res.status(201).json(newUmkm);
        } catch (error) {
            deleteRequestFiles(req.files);
            console.error('Gagal membuat UMKM:', error.message);
            res.status(500).json({ message: error.message });
        }
    });
};

exports.getUmkmById = async (req, res) => {
    try {
        const { id } = req.params;
        const umkm = await Umkm.findByPk(id, {
            include: [reviewInclude],
        });

        if (!umkm) {
            return res.status(404).json({ message: 'UMKM tidak ditemukan.' });
        }

        res.status(200).json(umkm);
    } catch (error) {
        console.error('Gagal mengambil detail UMKM:', error.message);
        res.status(500).json({ message: 'Terjadi kesalahan server', error: error.message });
    }
};

exports.updateUmkm = (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            deleteRequestFiles(req.files);
            console.error('Gagal upload gambar UMKM:', err);
            return res.status(400).json({ message: getUploadErrorMessage(err) });
        }

        try {
            const { id } = req.params;
            const userId = getAuthUserId(req);
            const umkm = await Umkm.findByPk(id);
            const primaryImage = getPrimaryImageFile(req.files);
            const newDetailImages = getDetailImageFiles(req.files).map((file) => file.filename);

            if (!umkm) {
                deleteRequestFiles(req.files);
                return res.status(404).json({ message: 'UMKM tidak ditemukan.' });
            }

            if (!userId || Number(umkm.userId) !== Number(userId)) {
                deleteRequestFiles(req.files);
                return res.status(403).json({ message: 'Kamu hanya bisa mengedit UMKM yang kamu tambahkan.' });
            }

            const {
                nama_umkm,
                harga_range,
                jam_operasional,
                jenis_makanan,
                deskripsi,
                alamat_teks,
                latitude,
                longitude,
            } = req.body;

            if (!String(nama_umkm || '').trim()) {
                deleteRequestFiles(req.files);
                return res.status(400).json({ message: 'Nama UMKM wajib diisi.' });
            }

            const oldImage = umkm.image;
            const currentImages = normalizeImages(umkm.images);
            const retainedRequestImages = parseImageList(req.body.existing_detail_images);
            const retainedImages = retainedRequestImages
                ? retainedRequestImages.filter((image) => currentImages.includes(image))
                : currentImages;
            const removedImages = currentImages.filter((image) => !retainedImages.includes(image));
            const nextImages = [...retainedImages, ...newDetailImages];

            if (nextImages.length > 7) {
                deleteRequestFiles(req.files);
                return res.status(400).json({ message: 'Foto detail maksimal 7 gambar.' });
            }

            await umkm.update({
                nama_umkm: String(nama_umkm || '').trim(),
                harga_range: String(harga_range || '').trim(),
                jam_operasional: String(jam_operasional || '').trim(),
                jenis_makanan: String(jenis_makanan || '').trim(),
                deskripsi: String(deskripsi || '').trim(),
                alamat_teks: String(alamat_teks || '').trim(),
                latitude: latitude || 0,
                longitude: longitude || 0,
                image: primaryImage ? primaryImage.filename : umkm.image,
                images: nextImages,
            });

            if (primaryImage && oldImage) deleteUploadedImage(oldImage);
            deleteUploadedImages(removedImages);

            res.json({ message: 'UMKM berhasil diperbarui.', umkm });
        } catch (error) {
            deleteRequestFiles(req.files);
            res.status(500).json({ message: error.message });
        }
    });
};

exports.deleteUmkm = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = getAuthUserId(req);
        const umkm = await Umkm.findByPk(id);

        if (!umkm) {
            return res.status(404).json({ message: 'UMKM tidak ditemukan.' });
        }

        if (!userId || Number(umkm.userId) !== Number(userId)) {
            return res.status(403).json({ message: 'Kamu hanya bisa menghapus UMKM yang kamu tambahkan.' });
        }

        const reviewRows = await Review.findAll({
            where: { umkmId: id },
            attributes: ['images'],
        });
        const reviewImages = reviewRows.flatMap((review) => normalizeImages(review.images));
        const primaryImage = umkm.image;
        const detailImages = normalizeImages(umkm.images);

        await SavedUmkm.destroy({ where: { umkmId: id } });
        await Review.destroy({ where: { umkmId: id } });
        await umkm.destroy();

        deleteUploadedImage(primaryImage);
        deleteUploadedImages(detailImages);
        deleteUploadedImages(reviewImages);

        res.json({ message: 'UMKM berhasil dihapus.' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getSavedUmkm = async (req, res) => {
    try {
        const userId = getAuthUserId(req);
        if (!userId) {
            return res.status(401).json({ message: 'Silakan login untuk melihat UMKM tersimpan.' });
        }

        const savedItems = await SavedUmkm.findAll({
            where: { userId },
            include: [
                {
                    model: Umkm,
                    required: true,
                    include: [reviewInclude],
                },
            ],
            order: [['createdAt', 'DESC']],
        });

        res.json(savedItems.map(serializeSavedUmkm).filter(Boolean));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.saveUmkm = async (req, res) => {
    try {
        const userId = getAuthUserId(req);
        const umkmId = Number(req.params.id);

        if (!userId) {
            return res.status(401).json({ message: 'Silakan login untuk menyimpan UMKM.' });
        }

        if (!Number.isInteger(umkmId) || umkmId <= 0) {
            return res.status(400).json({ message: 'ID UMKM tidak valid.' });
        }

        const umkm = await Umkm.findByPk(umkmId);
        if (!umkm) {
            return res.status(404).json({ message: 'UMKM tidak ditemukan.' });
        }

        const [savedItem, created] = await SavedUmkm.findOrCreate({
            where: { userId, umkmId },
            defaults: { userId, umkmId },
        });

        res.status(created ? 201 : 200).json({
            message: created ? 'UMKM berhasil disimpan.' : 'UMKM sudah ada di daftar simpanan.',
            saved: true,
            savedAt: savedItem.createdAt,
        });
    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(200).json({
                message: 'UMKM sudah ada di daftar simpanan.',
                saved: true,
            });
        }

        res.status(500).json({ message: error.message });
    }
};

exports.unsaveUmkm = async (req, res) => {
    try {
        const userId = getAuthUserId(req);
        const umkmId = Number(req.params.id);

        if (!userId) {
            return res.status(401).json({ message: 'Silakan login untuk menghapus simpanan.' });
        }

        if (!Number.isInteger(umkmId) || umkmId <= 0) {
            return res.status(400).json({ message: 'ID UMKM tidak valid.' });
        }

        await SavedUmkm.destroy({ where: { userId, umkmId } });

        res.json({
            message: 'UMKM dihapus dari daftar simpanan.',
            saved: false,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.addReview = (req, res) => {
    reviewUpload(req, res, async (err) => {
        if (err) {
            deleteRequestFiles(req.files);
            const message = err.code === 'LIMIT_FILE_SIZE'
                ? 'Ukuran foto review maksimal 2MB per foto.'
                : err.message || 'Gagal upload foto review.';
            return res.status(400).json({ message });
        }

        try {
            const umkmId = req.params.id;
            const { rating, komentar } = req.body;
            const userId = getAuthUserId(req);
            const reviewImages = Array.isArray(req.files) ? req.files.map((file) => file.filename) : [];
            const numericRating = Number(rating);
            const cleanComment = String(komentar || '').trim();

            if (!userId) {
                deleteRequestFiles(req.files);
                return res.status(401).json({ message: 'Silakan login untuk memberi review.' });
            }

            if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
                deleteRequestFiles(req.files);
                return res.status(400).json({ message: 'Rating wajib dipilih dari 1 sampai 5.' });
            }

            if (!cleanComment) {
                deleteRequestFiles(req.files);
                return res.status(400).json({ message: 'Komentar review wajib diisi.' });
            }

            const umkm = await Umkm.findByPk(umkmId);
            if (!umkm) {
                deleteRequestFiles(req.files);
                return res.status(404).json({ message: 'UMKM tidak ditemukan.' });
            }

            const newReview = await Review.create({
                umkmId,
                userId,
                rating: numericRating,
                komentar: cleanComment,
                images: reviewImages,
            });

            const reviewUser = await User.findByPk(userId, {
                attributes: ['id', 'username', 'email', 'profileImage'],
            });

            res.status(201).json({
                message: 'Review berhasil ditambahkan!',
                review: {
                    ...newReview.toJSON(),
                    User: reviewUser || null,
                },
            });
        } catch (error) {
            deleteRequestFiles(req.files);
            console.error('Gagal simpan review ke MySQL:', error.message);
            res.status(500).json({ message: 'Terjadi kesalahan pada server', error: error.message });
        }
    });
};
