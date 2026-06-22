const request = require('supertest');
const express = require('express');

jest.mock('./models', () => ({
    Notification: {
        destroy: jest.fn(),
    },
    Umkm: {},
}));

const { Notification } = require('./models');
const NotificationController = require('./controllers/NotificationController');

const app = express();
app.use(express.json());
app.delete('/api/notifications/:id', (req, res) => {
    req.user = { id: Number(req.header('x-user-id') || 7) };
    return NotificationController.deleteMyNotification(req, res);
});
app.delete('/api/admin/notifications/:id', (req, res) => (
    NotificationController.deleteAdminNotification(req, res)
));

describe('Unit Test: Hapus Notifikasi', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('Harus menghapus notifikasi milik user yang sedang login', async () => {
        Notification.destroy.mockResolvedValue(1);

        const res = await request(app)
            .delete('/api/notifications/12')
            .set('x-user-id', '4');

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toBe('Notifikasi berhasil dihapus.');
        expect(Notification.destroy).toHaveBeenCalledWith({
            where: { id: 12, recipientType: 'user', userId: 4 },
        });
    });

    it('Harus mengembalikan 404 jika notifikasi user tidak ditemukan', async () => {
        Notification.destroy.mockResolvedValue(0);

        const res = await request(app)
            .delete('/api/notifications/99')
            .set('x-user-id', '4');

        expect(res.statusCode).toBe(404);
        expect(res.body.message).toBe('Notifikasi tidak ditemukan.');
    });

    it('Harus menghapus notifikasi admin berdasarkan recipientType admin', async () => {
        Notification.destroy.mockResolvedValue(1);

        const res = await request(app).delete('/api/admin/notifications/5');

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toBe('Notifikasi admin berhasil dihapus.');
        expect(Notification.destroy).toHaveBeenCalledWith({
            where: { id: 5, recipientType: 'admin' },
        });
    });
});
