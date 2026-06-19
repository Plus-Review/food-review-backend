const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { Umkm, Review, User } = require('../models');
const {
    cleanText,
    getSafeErrorMessage,
    normalizeImageList,
    parsePositiveInt,
    resolveUploadPath,
} = require('../utils/security');
const { createUserNotification } = require('../utils/notifications');

const uploadsDir = path.join(__dirname, '..', 'uploads');
const DUMMY_ADMIN_HASH = '$2b$12$hhl.ppqnR5TahN/zWQMFneDnDf6HdBoyQEaGjrqbYG6KzCnhcg6py';

const ADMIN_USERS = [
    {
        username: 'adminplus',
        passwordHash: '$2b$12$hhl.ppqnR5TahN/zWQMFneDnDf6HdBoyQEaGjrqbYG6KzCnhcg6py',
        name: 'Admin Plus Review',
    },
    {
        username: 'reviewmaster',
        passwordHash: '$2b$12$tw5ajyDE6PInAWK.BMkTm.OBDQPNQq0lDDbSV4QjUYv01diuqi7pO',
        name: 'Review Master',
    },
];

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

const ownerInclude = {
    model: User,
    as: 'owner',
    required: false,
    attributes: ['id', 'username', 'email', 'profileImage'],
};

const deleteUploadedImage = (filename) => {
    if (!filename) return;

    const imagePath = resolveUploadPath(uploadsDir, filename);
    if (!imagePath) return;

    fs.unlink(imagePath, (err) => {
        if (err && err.code !== 'ENOENT') {
            console.error('Gagal menghapus file gambar admin:', err.message);
        }
    });
};

const deleteUploadedImages = (filenames = []) => {
    filenames.filter(Boolean).forEach(deleteUploadedImage);
};

const deletePendingUpdateFiles = (pendingUpdate) => {
    if (!pendingUpdate) return;
    deleteUploadedImage(pendingUpdate.primaryImage);
    deleteUploadedImages(pendingUpdate.newDetailImages || []);
};

const sanitizeUmkm = (umkm) => {
    const row = umkm.toJSON();
    return {
        ...row,
        images: normalizeImageList(row.images),
        verification_status: row.verification_status || 'approved',
        pending_update: row.pending_update || null,
    };
};

const findAdmin = (username) => (
    ADMIN_USERS.find((admin) => admin.username.toLowerCase() === String(username || '').trim().toLowerCase())
);

exports.login = async (req, res) => {
    const username = cleanText(req.body.username, 60);
    const password = String(req.body.password || '');
    const admin = findAdmin(username);
    const hashToCompare = admin?.passwordHash || DUMMY_ADMIN_HASH;
    const isPasswordValid = await bcrypt.compare(password, hashToCompare);

    if (!admin || !isPasswordValid) {
        return res.status(401).json({ message: 'Username atau password admin salah.' });
    }

    const token = jwt.sign(
        { role: 'admin', username: admin.username, name: admin.name },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
    );

    res.json({
        message: 'Login admin berhasil.',
        token,
        admin: {
            username: admin.username,
            name: admin.name,
        },
    });
};

exports.me = (req, res) => {
    res.json({
        admin: {
            username: req.admin.username,
            name: req.admin.name,
        },
    });
};

exports.getUmkmQueue = async (req, res) => {
    try {
        const umkms = await Umkm.findAll({
            include: [ownerInclude, reviewInclude],
            order: [
                ['submitted_at', 'DESC'],
                ['updatedAt', 'DESC'],
            ],
        });

        const rows = umkms.map(sanitizeUmkm);
        const stats = {
            total: rows.length,
            pendingCreate: rows.filter((item) => item.verification_status === 'pending_create').length,
            pendingUpdate: rows.filter((item) => item.verification_status === 'pending_update').length,
            approved: rows.filter((item) => item.verification_status === 'approved').length,
            rejected: rows.filter((item) => item.verification_status === 'rejected').length,
        };

        res.json({ stats, umkms: rows });
    } catch (error) {
        console.error('Gagal mengambil dashboard admin:', error.message);
        res.status(500).json({ message: getSafeErrorMessage(error) });
    }
};

exports.approveUmkm = async (req, res) => {
    try {
        const id = parsePositiveInt(req.params.id);
        if (!id) return res.status(400).json({ message: 'ID UMKM tidak valid.' });

        const umkm = await Umkm.findByPk(id);
        if (!umkm) return res.status(404).json({ message: 'UMKM tidak ditemukan.' });

        const status = umkm.verification_status || 'approved';
        const pendingUpdate = umkm.pending_update || null;

        if (status === 'pending_update') {
            if (!pendingUpdate?.fields) {
                return res.status(400).json({ message: 'Draft perubahan UMKM tidak lengkap.' });
            }

            await umkm.update({
                ...pendingUpdate.fields,
                image: pendingUpdate.primaryImage || umkm.image,
                images: normalizeImageList(pendingUpdate.nextImages || umkm.images),
                verification_status: 'approved',
                verification_note: cleanText(req.body.note || 'Perubahan disetujui admin.', 300),
                pending_update: null,
                reviewed_at: new Date(),
                reviewed_by: req.admin.username,
            });

            if (pendingUpdate.primaryImage && pendingUpdate.oldImage) {
                deleteUploadedImage(pendingUpdate.oldImage);
            }
            deleteUploadedImages(pendingUpdate.removedImages || []);

            await createUserNotification(umkm.userId, {
                type: 'umkm_update_approved',
                title: 'Perubahan UMKM disetujui',
                message: `Perubahan untuk ${umkm.nama_umkm} sudah disetujui admin dan sekarang tampil di feed.`,
                relatedUmkmId: umkm.id,
                metadata: {
                    status: 'approved',
                    decision: 'approved',
                    umkmName: umkm.nama_umkm,
                    note: umkm.verification_note,
                },
            });

            return res.json({ message: 'Perubahan UMKM disetujui.', umkm });
        }

        if (status === 'pending_create' || status === 'rejected') {
            await umkm.update({
                verification_status: 'approved',
                verification_note: cleanText(req.body.note || 'UMKM disetujui admin.', 300),
                pending_update: null,
                reviewed_at: new Date(),
                reviewed_by: req.admin.username,
            });

            await createUserNotification(umkm.userId, {
                type: 'umkm_create_approved',
                title: 'UMKM kamu disetujui',
                message: `${umkm.nama_umkm} sudah disetujui admin dan sekarang tampil di feed Plus Review.`,
                relatedUmkmId: umkm.id,
                metadata: {
                    status: 'approved',
                    decision: 'approved',
                    umkmName: umkm.nama_umkm,
                    note: umkm.verification_note,
                },
            });

            return res.json({ message: 'UMKM disetujui dan tampil di feed.', umkm });
        }

        res.json({ message: 'UMKM sudah berstatus approved.', umkm });
    } catch (error) {
        console.error('Gagal approve UMKM:', error.message);
        res.status(500).json({ message: getSafeErrorMessage(error) });
    }
};

exports.rejectUmkm = async (req, res) => {
    try {
        const id = parsePositiveInt(req.params.id);
        if (!id) return res.status(400).json({ message: 'ID UMKM tidak valid.' });

        const umkm = await Umkm.findByPk(id);
        if (!umkm) return res.status(404).json({ message: 'UMKM tidak ditemukan.' });

        const note = cleanText(req.body.note, 300);
        if (!note) {
            return res.status(400).json({ message: 'Tulis alasan penolakan agar user tahu bagian yang perlu diperbaiki.' });
        }

        const status = umkm.verification_status || 'approved';
        const pendingUpdate = umkm.pending_update || null;

        if (status === 'pending_update') {
            deletePendingUpdateFiles(pendingUpdate);

            await umkm.update({
                verification_status: 'approved',
                verification_note: note,
                pending_update: null,
                reviewed_at: new Date(),
                reviewed_by: req.admin.username,
            });

            await createUserNotification(umkm.userId, {
                type: 'umkm_update_rejected',
                title: 'Perubahan UMKM ditolak',
                message: `Perubahan untuk ${umkm.nama_umkm} belum disetujui. Alasan admin: ${note}`,
                relatedUmkmId: umkm.id,
                metadata: {
                    status: 'approved',
                    decision: 'rejected_update',
                    umkmName: umkm.nama_umkm,
                    note,
                },
            });

            return res.json({ message: 'Perubahan UMKM ditolak. Data lama tetap tampil.', umkm });
        }

        if (status === 'pending_create' || status === 'rejected') {
            await umkm.update({
                verification_status: 'rejected',
                verification_note: note,
                pending_update: null,
                reviewed_at: new Date(),
                reviewed_by: req.admin.username,
            });

            await createUserNotification(umkm.userId, {
                type: 'umkm_create_rejected',
                title: 'UMKM kamu ditolak',
                message: `${umkm.nama_umkm} belum bisa tampil di feed. Alasan admin: ${note}`,
                relatedUmkmId: umkm.id,
                metadata: {
                    status: 'rejected',
                    decision: 'rejected',
                    umkmName: umkm.nama_umkm,
                    note,
                },
            });

            return res.json({ message: 'UMKM ditolak dan tidak tampil di feed.', umkm });
        }

        await umkm.update({
            verification_note: note,
            reviewed_at: new Date(),
            reviewed_by: req.admin.username,
        });

        await createUserNotification(umkm.userId, {
            type: 'umkm_admin_note',
            title: 'Catatan admin untuk UMKM kamu',
            message: `Admin menambahkan catatan untuk ${umkm.nama_umkm}: ${note}`,
            relatedUmkmId: umkm.id,
            metadata: {
                status,
                decision: 'note',
                umkmName: umkm.nama_umkm,
                note,
            },
        });

        res.json({ message: 'Catatan admin disimpan.', umkm });
    } catch (error) {
        console.error('Gagal reject UMKM:', error.message);
        res.status(500).json({ message: getSafeErrorMessage(error) });
    }
};

exports.getPublicStats = async (req, res) => {
    try {
        const [pendingCreate, pendingUpdate, approved, rejected] = await Promise.all([
            Umkm.count({ where: { verification_status: 'pending_create' } }),
            Umkm.count({ where: { verification_status: 'pending_update' } }),
            Umkm.count({
                where: {
                    [Op.or]: [
                        { verification_status: 'approved' },
                        { verification_status: null },
                    ],
                },
            }),
            Umkm.count({ where: { verification_status: 'rejected' } }),
        ]);

        res.json({ pendingCreate, pendingUpdate, approved, rejected });
    } catch (error) {
        res.status(500).json({ message: getSafeErrorMessage(error) });
    }
};
