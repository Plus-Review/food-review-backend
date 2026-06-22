const express = require('express');
const request = require('supertest');

jest.mock('./models', () => ({
    Notification: {
        count: jest.fn(),
        destroy: jest.fn(),
        findAll: jest.fn(),
        findOne: jest.fn(),
        update: jest.fn(),
    },
    Umkm: {},
}));

const { Notification } = require('./models');
const NotificationController = require('./controllers/NotificationController');

const app = express();
app.use(express.json());
app.use('/api/notifications', (req, res, next) => {
    if (req.header('x-no-user') !== '1') {
        req.user = { id: Number(req.header('x-user-id') || 7) };
    }
    next();
});
app.get('/api/notifications', NotificationController.getMyNotifications);
app.patch('/api/notifications/read-all', NotificationController.markAllMyNotificationsRead);
app.patch('/api/notifications/:id/read', NotificationController.markMyNotificationRead);
app.delete('/api/notifications/:id', NotificationController.deleteMyNotification);
app.get('/api/admin/notifications', NotificationController.getAdminNotifications);
app.patch('/api/admin/notifications/read-all', NotificationController.markAllAdminNotificationsRead);
app.patch('/api/admin/notifications/:id/read', NotificationController.markAdminNotificationRead);
app.delete('/api/admin/notifications/:id', NotificationController.deleteAdminNotification);

const makeNotification = (overrides = {}) => {
    const data = {
        id: 12,
        recipientType: 'user',
        userId: 4,
        isRead: false,
        metadata: '{"source":"test"}',
        umkm: null,
        ...overrides,
    };

    return {
        toJSON: jest.fn(() => ({ ...data })),
        update: jest.fn(async (changes) => {
            Object.assign(data, changes);
            return true;
        }),
    };
};

describe('Notification Controller', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('Mengambil notifikasi user beserta ringkasannya', async () => {
        Notification.findAll.mockResolvedValue([
            makeNotification(),
            makeNotification({ id: 13, metadata: 'json-tidak-valid' }),
        ]);
        Notification.count
            .mockResolvedValueOnce(2)
            .mockResolvedValueOnce(1);

        const res = await request(app)
            .get('/api/notifications')
            .set('x-user-id', '4');

        expect(res.statusCode).toBe(200);
        expect(res.body.total).toBe(2);
        expect(res.body.unread).toBe(1);
        expect(res.body.notifications).toHaveLength(2);
        expect(res.body.notifications[0].metadata).toEqual({ source: 'test' });
        expect(res.body.notifications[1].metadata).toEqual({});
    });

    it('Menolak daftar notifikasi ketika user belum login', async () => {
        const res = await request(app)
            .get('/api/notifications')
            .set('x-no-user', '1');

        expect(res.statusCode).toBe(401);
        expect(Notification.findAll).not.toHaveBeenCalled();
    });

    it('Menandai satu notifikasi user sebagai sudah dibaca', async () => {
        const row = makeNotification();
        Notification.findOne.mockResolvedValue(row);

        const res = await request(app)
            .patch('/api/notifications/12/read')
            .set('x-user-id', '4');

        expect(res.statusCode).toBe(200);
        expect(row.update).toHaveBeenCalledWith({
            isRead: true,
            readAt: expect.any(Date),
        });
        expect(res.body.notification.isRead).toBe(true);
    });

    it('Menolak ID notifikasi user yang tidak valid', async () => {
        const res = await request(app)
            .patch('/api/notifications/tidak-valid/read')
            .set('x-user-id', '4');

        expect(res.statusCode).toBe(400);
        expect(Notification.findOne).not.toHaveBeenCalled();
    });

    it('Mengembalikan 404 saat notifikasi user tidak ditemukan', async () => {
        Notification.findOne.mockResolvedValue(null);

        const res = await request(app)
            .patch('/api/notifications/99/read')
            .set('x-user-id', '4');

        expect(res.statusCode).toBe(404);
    });

    it('Menandai seluruh notifikasi user sebagai sudah dibaca', async () => {
        Notification.update.mockResolvedValue([3]);

        const res = await request(app)
            .patch('/api/notifications/read-all')
            .set('x-user-id', '4');

        expect(res.statusCode).toBe(200);
        expect(Notification.update).toHaveBeenCalledWith(
            { isRead: true, readAt: expect.any(Date) },
            { where: { recipientType: 'user', userId: 4, isRead: false } }
        );
    });

    it('Menghapus notifikasi milik user yang sedang login', async () => {
        Notification.destroy.mockResolvedValue(1);

        const res = await request(app)
            .delete('/api/notifications/12')
            .set('x-user-id', '4');

        expect(res.statusCode).toBe(200);
        expect(Notification.destroy).toHaveBeenCalledWith({
            where: { id: 12, recipientType: 'user', userId: 4 },
        });
    });

    it('Mengembalikan 404 jika notifikasi user tidak ditemukan saat dihapus', async () => {
        Notification.destroy.mockResolvedValue(0);

        const res = await request(app)
            .delete('/api/notifications/99')
            .set('x-user-id', '4');

        expect(res.statusCode).toBe(404);
    });

    it('Mengambil daftar notifikasi admin dan ringkasannya', async () => {
        Notification.findAll.mockResolvedValue([
            makeNotification({ recipientType: 'admin', userId: null, metadata: {} }),
        ]);
        Notification.count
            .mockResolvedValueOnce(1)
            .mockResolvedValueOnce(1);

        const res = await request(app).get('/api/admin/notifications');

        expect(res.statusCode).toBe(200);
        expect(res.body.total).toBe(1);
        expect(res.body.notifications).toHaveLength(1);
    });

    it('Menandai satu notifikasi admin sebagai sudah dibaca', async () => {
        const row = makeNotification({ recipientType: 'admin', userId: null });
        Notification.findOne.mockResolvedValue(row);

        const res = await request(app).patch('/api/admin/notifications/5/read');

        expect(res.statusCode).toBe(200);
        expect(row.update).toHaveBeenCalledWith({
            isRead: true,
            readAt: expect.any(Date),
        });
    });

    it('Menandai seluruh notifikasi admin sebagai sudah dibaca', async () => {
        Notification.update.mockResolvedValue([4]);

        const res = await request(app).patch('/api/admin/notifications/read-all');

        expect(res.statusCode).toBe(200);
        expect(Notification.update).toHaveBeenCalledTimes(1);
    });

    it('Menghapus notifikasi admin', async () => {
        Notification.destroy.mockResolvedValue(1);

        const res = await request(app).delete('/api/admin/notifications/5');

        expect(res.statusCode).toBe(200);
        expect(Notification.destroy).toHaveBeenCalledWith({
            where: { id: 5, recipientType: 'admin' },
        });
    });

    it('Mengembalikan error server dengan aman', async () => {
        Notification.findAll.mockRejectedValue(new Error('Database notification down'));

        const res = await request(app)
            .get('/api/notifications')
            .set('x-user-id', '4');

        expect(res.statusCode).toBe(500);
        expect(res.body.message).toBe('Database notification down');
    });
});
