const { Notification, Umkm } = require('../models');
const { Op } = require('sequelize');
const { getSafeErrorMessage, parsePositiveInt } = require('../utils/security');

const getAuthUserId = (req) => req.user?.id || req.user?.userId || req.userId || null;

const notificationInclude = [
    {
        model: Umkm,
        as: 'umkm',
        required: false,
        attributes: ['id', 'nama_umkm', 'jenis_makanan', 'image', 'verification_status', 'verification_note'],
    },
];

const serializeNotification = (notification) => {
    const row = notification.toJSON();
    let metadata = row.metadata || {};

    if (typeof metadata === 'string') {
        try {
            metadata = JSON.parse(metadata);
        } catch {
            metadata = {};
        }
    }

    return {
        ...row,
        isRead: Boolean(row.isRead),
        metadata,
        umkm: row.umkm || null,
    };
};

const getNotificationSummary = async (where) => {
    const [total, unread] = await Promise.all([
        Notification.count({ where }),
        Notification.count({ where: { ...where, isRead: false } }),
    ]);

    return { total, unread };
};

exports.getMyNotifications = async (req, res) => {
    try {
        const userId = getAuthUserId(req);
        if (!userId) {
            return res.status(401).json({ message: 'Silakan login untuk melihat notifikasi.' });
        }

        const where = { recipientType: 'user', userId };
        const [notifications, summary] = await Promise.all([
            Notification.findAll({
                where,
                include: notificationInclude,
                order: [['createdAt', 'DESC']],
                limit: 60,
            }),
            getNotificationSummary(where),
        ]);

        res.json({
            ...summary,
            notifications: notifications.map(serializeNotification),
        });
    } catch (error) {
        res.status(500).json({ message: getSafeErrorMessage(error) });
    }
};

exports.markMyNotificationRead = async (req, res) => {
    try {
        const userId = getAuthUserId(req);
        const id = parsePositiveInt(req.params.id);
        if (!userId) return res.status(401).json({ message: 'Silakan login untuk membaca notifikasi.' });
        if (!id) return res.status(400).json({ message: 'ID notifikasi tidak valid.' });

        const notification = await Notification.findOne({
            where: { id, recipientType: 'user', userId },
        });

        if (!notification) {
            return res.status(404).json({ message: 'Notifikasi tidak ditemukan.' });
        }

        await notification.update({ isRead: true, readAt: new Date() });

        res.json({ message: 'Notifikasi ditandai sudah dibaca.', notification: serializeNotification(notification) });
    } catch (error) {
        res.status(500).json({ message: getSafeErrorMessage(error) });
    }
};

exports.markAllMyNotificationsRead = async (req, res) => {
    try {
        const userId = getAuthUserId(req);
        if (!userId) return res.status(401).json({ message: 'Silakan login untuk membaca notifikasi.' });

        await Notification.update(
            { isRead: true, readAt: new Date() },
            { where: { recipientType: 'user', userId, isRead: false } }
        );

        res.json({ message: 'Semua notifikasi ditandai sudah dibaca.' });
    } catch (error) {
        res.status(500).json({ message: getSafeErrorMessage(error) });
    }
};

exports.deleteMyNotification = async (req, res) => {
    try {
        const userId = getAuthUserId(req);
        const id = parsePositiveInt(req.params.id);
        if (!userId) return res.status(401).json({ message: 'Silakan login untuk menghapus notifikasi.' });
        if (!id) return res.status(400).json({ message: 'ID notifikasi tidak valid.' });

        const deleted = await Notification.destroy({
            where: { id, recipientType: 'user', userId },
        });

        if (!deleted) {
            return res.status(404).json({ message: 'Notifikasi tidak ditemukan.' });
        }

        res.json({ message: 'Notifikasi berhasil dihapus.' });
    } catch (error) {
        res.status(500).json({ message: getSafeErrorMessage(error) });
    }
};

exports.getAdminNotifications = async (req, res) => {
    try {
        const where = { recipientType: 'admin' };
        const [notifications, summary] = await Promise.all([
            Notification.findAll({
                where,
                include: notificationInclude,
                order: [['createdAt', 'DESC']],
                limit: 80,
            }),
            getNotificationSummary(where),
        ]);

        res.json({
            ...summary,
            notifications: notifications.map(serializeNotification),
        });
    } catch (error) {
        res.status(500).json({ message: getSafeErrorMessage(error) });
    }
};

exports.deleteAdminNotification = async (req, res) => {
    try {
        const id = parsePositiveInt(req.params.id);
        if (!id) return res.status(400).json({ message: 'ID notifikasi tidak valid.' });

        const deleted = await Notification.destroy({
            where: { id, recipientType: 'admin' },
        });

        if (!deleted) {
            return res.status(404).json({ message: 'Notifikasi tidak ditemukan.' });
        }

        res.json({ message: 'Notifikasi admin berhasil dihapus.' });
    } catch (error) {
        res.status(500).json({ message: getSafeErrorMessage(error) });
    }
};

exports.markAdminNotificationRead = async (req, res) => {
    try {
        const id = parsePositiveInt(req.params.id);
        if (!id) return res.status(400).json({ message: 'ID notifikasi tidak valid.' });

        const notification = await Notification.findOne({
            where: { id, recipientType: 'admin' },
        });

        if (!notification) {
            return res.status(404).json({ message: 'Notifikasi tidak ditemukan.' });
        }

        await notification.update({ isRead: true, readAt: new Date() });

        res.json({ message: 'Notifikasi admin ditandai sudah dibaca.', notification: serializeNotification(notification) });
    } catch (error) {
        res.status(500).json({ message: getSafeErrorMessage(error) });
    }
};

exports.markAllAdminNotificationsRead = async (req, res) => {
    try {
        await Notification.update(
            { isRead: true, readAt: new Date() },
            {
                where: {
                    recipientType: 'admin',
                    isRead: false,
                    type: {
                        [Op.ne]: '',
                    },
                },
            }
        );

        res.json({ message: 'Semua notifikasi admin ditandai sudah dibaca.' });
    } catch (error) {
        res.status(500).json({ message: getSafeErrorMessage(error) });
    }
};
