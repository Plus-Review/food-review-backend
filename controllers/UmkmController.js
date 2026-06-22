const { Umkm, Review, User, SavedUmkm } = require('../models');
const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const {
    cleanText,
    getSafeErrorMessage,
    imageFileFilter,
    normalizeCategory,
    normalizeImageList,
    parseCoordinate,
    parsePositiveInt,
} = require('../utils/security');
const {
    createUploadStorage,
    deleteStoredImage,
    persistRequestFiles,
} = require('../utils/uploadStorage');
const {
    createAdminNotification,
    createUserNotification,
} = require('../utils/notifications');

const upload = multer({
    storage: createUploadStorage('umkm'),
    limits: { fileSize: 4 * 1024 * 1024, files: 8, fields: 24, fieldSize: 512 * 1024 },
    fileFilter: imageFileFilter('Foto UMKM'),
}).fields([
    { name: 'image', maxCount: 1 },
    { name: 'detail_images', maxCount: 7 },
]);

const reviewUpload = multer({
    storage: createUploadStorage('review'),
    limits: { fileSize: 2 * 1024 * 1024, files: 4, fields: 8, fieldSize: 256 * 1024 },
    fileFilter: imageFileFilter('Foto review'),
}).array('review_images', 4);

const getAuthUserId = (req) => req.user?.id || req.user?.userId || req.userId || null;

const getOptionalAuthContext = (req) => {
    const [scheme, token] = String(req.header('Authorization') || '').split(' ');
    if (scheme !== 'Bearer') return { userId: null, isAdmin: false };
    if (!token) return { userId: null, isAdmin: false };

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        return {
            userId: verified?.id || verified?.userId || null,
            isAdmin: verified?.role === 'admin',
        };
    } catch {
        return { userId: null, isAdmin: false };
    }
};

const approvedWhere = {
    [Op.or]: [
        { verification_status: 'approved' },
        { verification_status: null },
    ],
};

const isApprovedUmkm = (umkm) => {
    const status = umkm?.verification_status || 'approved';
    return status === 'approved';
};

const getUploadedFiles = (files, fieldName) => (
    Array.isArray(files?.[fieldName]) ? files[fieldName] : []
);

const getPrimaryImageFile = (files) => getUploadedFiles(files, 'image')[0] || null;

const getDetailImageFiles = (files) => getUploadedFiles(files, 'detail_images');

const normalizeImages = (images) => {
    if (Array.isArray(images)) return normalizeImageList(images);
    if (!images) return [];

    try {
        const parsed = JSON.parse(images);
        return Array.isArray(parsed) ? normalizeImageList(parsed) : [];
    } catch {
        return [];
    }
};

const parseImageList = (value) => {
    if (Array.isArray(value)) return normalizeImageList(value);
    if (!value) return null;

    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? normalizeImageList(parsed) : null;
    } catch {
        return null;
    }
};

const deleteUploadedImage = (filename) => {
    deleteStoredImage(filename, 'gambar UMKM');
};

const deleteUploadedImages = (filenames = []) => {
    filenames.filter(Boolean).forEach(deleteUploadedImage);
};

const deletePendingUpdateFiles = (pendingUpdate) => {
    if (!pendingUpdate) return;
    deleteUploadedImage(pendingUpdate.primaryImage);
    deleteUploadedImages(pendingUpdate.newDetailImages || []);
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
            return 'Ukuran foto terlalu besar. Foto utama/detail maksimal 4MB, foto review maksimal 2MB.';
        }

        return `Upload gagal: ${err.message}`;
    }

    return `Upload gagal: ${err.message || 'file tidak bisa disimpan.'}`;
};

const getValidatedUmkmPayload = (body) => {
    const nama_umkm = cleanText(body.nama_umkm, 90);
    const jenis_makanan = normalizeCategory(body.jenis_makanan);

    if (!nama_umkm) {
        return { error: 'Nama UMKM wajib diisi.' };
    }

    if (!jenis_makanan) {
        return { error: 'Jenis makanan hanya boleh Makanan berat, Snacks & Dessert, atau Drinks.' };
    }

    return {
        data: {
            nama_umkm,
            harga_range: cleanText(body.harga_range, 80),
            jam_operasional: cleanText(body.jam_operasional, 80),
            jenis_makanan,
            deskripsi: cleanText(body.deskripsi, 900),
            alamat_teks: cleanText(body.alamat_teks, 260),
            latitude: parseCoordinate(body.latitude),
            longitude: parseCoordinate(body.longitude),
        },
    };
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

const serializeUserActivity = (review) => {
    const row = review.toJSON();
    const umkm = row.Umkm || null;

    return {
        id: row.id,
        type: 'review',
        rating: Number(row.rating || 0),
        komentar: row.komentar || '',
        images: normalizeImages(row.images),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        umkm: umkm ? {
            ...umkm,
            images: normalizeImages(umkm.images),
            reviews: Array.isArray(umkm.reviews)
                ? umkm.reviews.map((item) => ({
                    ...item,
                    images: normalizeImages(item.images),
                }))
                : [],
        } : null,
    };
};

exports.getAllUmkm = async (req, res) => {
    try {
        const umkms = await Umkm.findAll({
            where: approvedWhere,
            include: [reviewInclude],
            order: [['createdAt', 'DESC']],
        });

        res.status(200).json(umkms);
    } catch (error) {
        console.error('Gagal mengambil data UMKM:', error.message);
        res.status(500).json({ message: getSafeErrorMessage(error) });
    }
};

exports.getMyUmkm = async (req, res) => {
    try {
        const userId = getAuthUserId(req);
        if (!userId) {
            return res.status(401).json({ message: 'Silakan login untuk melihat UMKM milikmu.' });
        }

        const umkms = await Umkm.findAll({
            where: { userId },
            include: [reviewInclude],
            order: [['createdAt', 'DESC']],
        });

        res.status(200).json(umkms);
    } catch (error) {
        console.error('Gagal mengambil UMKM milik user:', error.message);
        res.status(500).json({ message: getSafeErrorMessage(error) });
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
            await persistRequestFiles(req.files, 'umkm');
            const { data: payload, error: validationError } = getValidatedUmkmPayload(req.body);
            const userId = getAuthUserId(req);
            const primaryImage = getPrimaryImageFile(req.files);
            const detailImages = getDetailImageFiles(req.files).map((file) => file.filename);

            if (validationError) {
                deleteRequestFiles(req.files);
                return res.status(400).json({ message: validationError });
            }

            const newUmkm = await Umkm.create({
                ...payload,
                image: primaryImage ? primaryImage.filename : null,
                images: detailImages,
                verification_status: 'pending_create',
                verification_note: null,
                pending_update: null,
                submitted_at: new Date(),
                reviewed_at: null,
                reviewed_by: null,
                userId,
            });

            await Promise.all([
                createAdminNotification({
                    type: 'umkm_pending_create',
                    title: 'UMKM baru perlu diverifikasi',
                    message: `${newUmkm.nama_umkm} baru dikirim dan menunggu keputusan admin sebelum tampil di feed.`,
                    relatedUmkmId: newUmkm.id,
                    metadata: {
                        status: 'pending_create',
                        umkmName: newUmkm.nama_umkm,
                        category: newUmkm.jenis_makanan,
                    },
                }),
                createUserNotification(userId, {
                    type: 'umkm_submitted',
                    title: 'UMKM kamu masuk antrean admin',
                    message: `${newUmkm.nama_umkm} berhasil dikirim. Admin akan memverifikasi data, foto, dan lokasi sebelum UMKM tampil di feed.`,
                    relatedUmkmId: newUmkm.id,
                    metadata: {
                        status: 'pending_create',
                        umkmName: newUmkm.nama_umkm,
                    },
                }),
            ]);

            res.status(201).json({
                message: 'UMKM berhasil dikirim. Admin akan memverifikasi sebelum tampil di feed.',
                umkm: newUmkm,
            });
        } catch (error) {
            deleteRequestFiles(req.files);
            console.error('Gagal membuat UMKM:', error.message);
            res.status(500).json({ message: getSafeErrorMessage(error) });
        }
    });
};

exports.getUmkmById = async (req, res) => {
    try {
        const id = parsePositiveInt(req.params.id);
        if (!id) {
            return res.status(400).json({ message: 'ID UMKM tidak valid.' });
        }

        const umkm = await Umkm.findByPk(id, {
            include: [reviewInclude],
        });

        if (!umkm) {
            return res.status(404).json({ message: 'UMKM tidak ditemukan.' });
        }

        const viewer = getOptionalAuthContext(req);
        if (!isApprovedUmkm(umkm) && !viewer.isAdmin && Number(umkm.userId) !== Number(viewer.userId)) {
            return res.status(404).json({ message: 'UMKM belum tersedia untuk publik.' });
        }

        res.status(200).json(umkm);
    } catch (error) {
        console.error('Gagal mengambil detail UMKM:', error.message);
        res.status(500).json({ message: getSafeErrorMessage(error) });
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
            await persistRequestFiles(req.files, 'umkm');
            const id = parsePositiveInt(req.params.id);
            const userId = getAuthUserId(req);

            if (!id) {
                deleteRequestFiles(req.files);
                return res.status(400).json({ message: 'ID UMKM tidak valid.' });
            }

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

            const { data: nextFields, error: validationError } = getValidatedUmkmPayload(req.body);
            if (validationError) {
                deleteRequestFiles(req.files);
                return res.status(400).json({ message: validationError });
            }

            const oldImage = umkm.image;
            const currentImages = normalizeImages(umkm.images);
            const previousPendingUpdate = umkm.pending_update;
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

            const currentStatus = umkm.verification_status || 'approved';
            if (currentStatus === 'pending_create' || currentStatus === 'rejected') {
                await umkm.update({
                    ...nextFields,
                    image: primaryImage ? primaryImage.filename : umkm.image,
                    images: nextImages,
                    verification_status: 'pending_create',
                    verification_note: null,
                    pending_update: null,
                    submitted_at: new Date(),
                    reviewed_at: null,
                    reviewed_by: null,
                });

                if (primaryImage && oldImage) deleteUploadedImage(oldImage);
                deleteUploadedImages(removedImages);
                deletePendingUpdateFiles(previousPendingUpdate);

                await Promise.all([
                    createAdminNotification({
                        type: 'umkm_pending_create',
                        title: 'UMKM dikirim ulang',
                        message: `${umkm.nama_umkm} diperbarui oleh owner dan kembali menunggu verifikasi admin.`,
                        relatedUmkmId: umkm.id,
                        metadata: {
                            status: 'pending_create',
                            umkmName: umkm.nama_umkm,
                            category: umkm.jenis_makanan,
                        },
                    }),
                    createUserNotification(userId, {
                        type: 'umkm_resubmitted',
                        title: 'Perbaikan UMKM dikirim',
                        message: `${umkm.nama_umkm} sudah dikirim ulang. Admin akan mengecek perbaikan terbaru sebelum UMKM tampil di feed.`,
                        relatedUmkmId: umkm.id,
                        metadata: {
                            status: 'pending_create',
                            umkmName: umkm.nama_umkm,
                        },
                    }),
                ]);

                return res.json({
                    message: 'UMKM berhasil diperbarui dan kembali menunggu verifikasi admin.',
                    umkm,
                });
            }

            deletePendingUpdateFiles(previousPendingUpdate);

            await umkm.update({
                verification_status: 'pending_update',
                verification_note: null,
                pending_update: {
                    fields: nextFields,
                    primaryImage: primaryImage ? primaryImage.filename : null,
                    oldImage,
                    retainedImages,
                    newDetailImages,
                    removedImages,
                    nextImages,
                    requestedAt: new Date().toISOString(),
                },
                submitted_at: new Date(),
                reviewed_at: null,
                reviewed_by: null,
            });

            await Promise.all([
                createAdminNotification({
                    type: 'umkm_pending_update',
                    title: 'Edit UMKM menunggu verifikasi',
                    message: `${umkm.nama_umkm} mengirim perubahan data. Data lama tetap tampil sampai admin menyetujui perubahan.`,
                    relatedUmkmId: umkm.id,
                    metadata: {
                        status: 'pending_update',
                        umkmName: umkm.nama_umkm,
                        category: umkm.jenis_makanan,
                    },
                }),
                createUserNotification(userId, {
                    type: 'umkm_update_submitted',
                    title: 'Perubahan UMKM dikirim',
                    message: `Perubahan untuk ${umkm.nama_umkm} sudah masuk antrean admin. Data lama tetap tampil sampai perubahan disetujui.`,
                    relatedUmkmId: umkm.id,
                    metadata: {
                        status: 'pending_update',
                        umkmName: umkm.nama_umkm,
                    },
                }),
            ]);

            res.json({
                message: 'Perubahan UMKM dikirim ke admin. Data lama tetap tampil sampai perubahan disetujui.',
                umkm,
            });
        } catch (error) {
            deleteRequestFiles(req.files);
            res.status(500).json({ message: getSafeErrorMessage(error) });
        }
    });
};

exports.deleteUmkm = async (req, res) => {
    try {
        const id = parsePositiveInt(req.params.id);
        const userId = getAuthUserId(req);

        if (!id) {
            return res.status(400).json({ message: 'ID UMKM tidak valid.' });
        }

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
        const pendingUpdate = umkm.pending_update;

        await SavedUmkm.destroy({ where: { umkmId: id } });
        await Review.destroy({ where: { umkmId: id } });
        await umkm.destroy();

        deleteUploadedImage(primaryImage);
        deleteUploadedImages(detailImages);
        deleteUploadedImages(reviewImages);
        deletePendingUpdateFiles(pendingUpdate);

        res.json({ message: 'UMKM berhasil dihapus.' });
    } catch (error) {
        res.status(500).json({ message: getSafeErrorMessage(error) });
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
                    where: approvedWhere,
                    include: [reviewInclude],
                },
            ],
            order: [['createdAt', 'DESC']],
        });

        res.json(savedItems.map(serializeSavedUmkm).filter(Boolean));
    } catch (error) {
        res.status(500).json({ message: getSafeErrorMessage(error) });
    }
};

exports.getUserActivity = async (req, res) => {
    try {
        const userId = getAuthUserId(req);
        if (!userId) {
            return res.status(401).json({ message: 'Silakan login untuk melihat aktivitas.' });
        }

        const reviews = await Review.findAll({
            where: { userId },
            include: [
                {
                    model: Umkm,
                    required: false,
                    include: [reviewInclude],
                },
            ],
            order: [['createdAt', 'DESC']],
        });

        const activities = reviews.map(serializeUserActivity);
        const totalPhotos = activities.reduce((sum, activity) => sum + activity.images.length, 0);
        const averageRating = activities.length === 0
            ? 0
            : activities.reduce((sum, activity) => sum + Number(activity.rating || 0), 0) / activities.length;

        res.json({
            total: activities.length,
            totalPhotos,
            averageRating,
            activities,
        });
    } catch (error) {
        console.error('Gagal mengambil aktivitas user:', error.message);
        res.status(500).json({ message: getSafeErrorMessage(error) });
    }
};

exports.saveUmkm = async (req, res) => {
    try {
        const userId = getAuthUserId(req);
        const umkmId = parsePositiveInt(req.params.id);

        if (!userId) {
            return res.status(401).json({ message: 'Silakan login untuk menyimpan UMKM.' });
        }

        if (!umkmId) {
            return res.status(400).json({ message: 'ID UMKM tidak valid.' });
        }

        const umkm = await Umkm.findByPk(umkmId);
        if (!umkm) {
            return res.status(404).json({ message: 'UMKM tidak ditemukan.' });
        }

        if (!isApprovedUmkm(umkm)) {
            return res.status(403).json({ message: 'UMKM belum disetujui admin sehingga belum bisa disimpan.' });
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

        res.status(500).json({ message: getSafeErrorMessage(error) });
    }
};

exports.unsaveUmkm = async (req, res) => {
    try {
        const userId = getAuthUserId(req);
        const umkmId = parsePositiveInt(req.params.id);

        if (!userId) {
            return res.status(401).json({ message: 'Silakan login untuk menghapus simpanan.' });
        }

        if (!umkmId) {
            return res.status(400).json({ message: 'ID UMKM tidak valid.' });
        }

        await SavedUmkm.destroy({ where: { userId, umkmId } });

        res.json({
            message: 'UMKM dihapus dari daftar simpanan.',
            saved: false,
        });
    } catch (error) {
        res.status(500).json({ message: getSafeErrorMessage(error) });
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
            await persistRequestFiles(req.files, 'review');
            const umkmId = parsePositiveInt(req.params.id);
            const { rating, komentar } = req.body;
            const userId = getAuthUserId(req);
            const reviewImages = Array.isArray(req.files) ? req.files.map((file) => file.filename) : [];
            const numericRating = Number(rating);
            const cleanComment = cleanText(komentar, 500);

            if (!userId) {
                deleteRequestFiles(req.files);
                return res.status(401).json({ message: 'Silakan login untuk memberi review.' });
            }

            if (!umkmId) {
                deleteRequestFiles(req.files);
                return res.status(400).json({ message: 'ID UMKM tidak valid.' });
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

            if (!isApprovedUmkm(umkm)) {
                deleteRequestFiles(req.files);
                return res.status(403).json({ message: 'UMKM belum disetujui admin sehingga belum bisa direview.' });
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
            res.status(500).json({ message: getSafeErrorMessage(error) });
        }
    });
};

exports.updateReview = (req, res) => {
    reviewUpload(req, res, async (err) => {
        if (err) {
            deleteRequestFiles(req.files);
            const message = err.code === 'LIMIT_FILE_SIZE'
                ? 'Ukuran foto review maksimal 2MB per foto.'
                : err.message || 'Gagal upload foto review.';
            return res.status(400).json({ message });
        }

        try {
            await persistRequestFiles(req.files, 'review');
            const userId = getAuthUserId(req);
            const umkmId = parsePositiveInt(req.params.id);
            const reviewId = parsePositiveInt(req.params.reviewId);
            const { rating, komentar } = req.body;
            const newReviewImages = Array.isArray(req.files) ? req.files.map((file) => file.filename) : [];
            const numericRating = Number(rating);
            const cleanComment = cleanText(komentar, 500);

            if (!userId) {
                deleteRequestFiles(req.files);
                return res.status(401).json({ message: 'Silakan login untuk mengedit review.' });
            }

            if (!umkmId || !reviewId) {
                deleteRequestFiles(req.files);
                return res.status(400).json({ message: 'ID review tidak valid.' });
            }

            if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
                deleteRequestFiles(req.files);
                return res.status(400).json({ message: 'Rating wajib dipilih dari 1 sampai 5.' });
            }

            if (!cleanComment) {
                deleteRequestFiles(req.files);
                return res.status(400).json({ message: 'Komentar review wajib diisi.' });
            }

            const review = await Review.findOne({
                where: {
                    id: reviewId,
                    umkmId,
                },
            });

            if (!review) {
                deleteRequestFiles(req.files);
                return res.status(404).json({ message: 'Review tidak ditemukan.' });
            }

            if (Number(review.userId) !== Number(userId)) {
                deleteRequestFiles(req.files);
                return res.status(403).json({ message: 'Kamu hanya bisa mengedit review milikmu sendiri.' });
            }

            const currentImages = normalizeImages(review.images);
            const retainedRequestImages = parseImageList(req.body.existing_review_images);
            const retainedImages = retainedRequestImages
                ? retainedRequestImages.filter((image) => currentImages.includes(image))
                : currentImages;
            const removedImages = currentImages.filter((image) => !retainedImages.includes(image));
            const nextImages = [...retainedImages, ...newReviewImages];

            if (nextImages.length > 4) {
                deleteRequestFiles(req.files);
                return res.status(400).json({ message: 'Foto review maksimal 4 gambar.' });
            }

            await review.update({
                rating: numericRating,
                komentar: cleanComment,
                images: nextImages,
            });

            deleteUploadedImages(removedImages);

            const reviewUser = await User.findByPk(userId, {
                attributes: ['id', 'username', 'email', 'profileImage'],
            });

            res.json({
                message: 'Review berhasil diperbarui.',
                review: {
                    ...review.toJSON(),
                    images: normalizeImages(review.images),
                    User: reviewUser || null,
                },
            });
        } catch (error) {
            deleteRequestFiles(req.files);
            console.error('Gagal memperbarui review:', error.message);
            res.status(500).json({ message: getSafeErrorMessage(error) });
        }
    });
};

exports.deleteReview = async (req, res) => {
    try {
        const userId = getAuthUserId(req);
        const umkmId = parsePositiveInt(req.params.id);
        const reviewId = parsePositiveInt(req.params.reviewId);

        if (!userId) {
            return res.status(401).json({ message: 'Silakan login untuk menghapus review.' });
        }

        if (!umkmId || !reviewId) {
            return res.status(400).json({ message: 'ID review tidak valid.' });
        }

        const review = await Review.findOne({
            where: {
                id: reviewId,
                umkmId,
            },
        });

        if (!review) {
            return res.status(404).json({ message: 'Review tidak ditemukan.' });
        }

        if (Number(review.userId) !== Number(userId)) {
            return res.status(403).json({ message: 'Kamu hanya bisa menghapus review milikmu sendiri.' });
        }

        const reviewImages = normalizeImages(review.images);
        await review.destroy();
        deleteUploadedImages(reviewImages);

        res.json({ message: 'Review berhasil dihapus.' });
    } catch (error) {
        res.status(500).json({ message: getSafeErrorMessage(error) });
    }
};
