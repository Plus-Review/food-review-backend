const Notification = require('../models/Notification');
const { cleanText } = require('./security');

const normalizeMetadata = (metadata) => (
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? metadata
        : {}
);

const createNotification = async ({
    recipientType,
    userId = null,
    type,
    title,
    message,
    relatedUmkmId = null,
    metadata = {},
}) => {
    try {
        const normalizedRecipient = cleanText(recipientType, 16);
        const normalizedType = cleanText(type, 60);
        const normalizedTitle = cleanText(title, 120);
        const normalizedMessage = cleanText(message, 800);

        if (!normalizedRecipient || !normalizedType || !normalizedTitle || !normalizedMessage) {
            return null;
        }

        if (normalizedRecipient === 'user' && !userId) {
            return null;
        }

        return await Notification.create({
            recipientType: normalizedRecipient,
            userId: normalizedRecipient === 'user' ? userId : null,
            type: normalizedType,
            title: normalizedTitle,
            message: normalizedMessage,
            relatedUmkmId,
            metadata: normalizeMetadata(metadata),
            isRead: false,
            readAt: null,
        });
    } catch (error) {
        console.error('Gagal membuat notifikasi:', error.message);
        return null;
    }
};

const createUserNotification = (userId, payload) => createNotification({
    ...payload,
    recipientType: 'user',
    userId,
});

const createAdminNotification = (payload) => createNotification({
    ...payload,
    recipientType: 'admin',
});

module.exports = {
    createAdminNotification,
    createNotification,
    createUserNotification,
};
