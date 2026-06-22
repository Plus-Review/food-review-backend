const express = require('express');
const request = require('supertest');
const adminMiddleware = require('./middleware/adminMiddleware');

const app = express();
app.get('/admin-only', (req, res, next) => {
    const role = req.header('x-role');
    if (role) req.user = { id: 1, role };
    next();
}, adminMiddleware, (req, res) => {
    res.json({ message: 'admin accepted' });
});

describe('Admin middleware', () => {
    it('Meneruskan request dari admin', async () => {
        const res = await request(app)
            .get('/admin-only')
            .set('x-role', 'admin');

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toBe('admin accepted');
    });

    it('Menolak user biasa', async () => {
        const res = await request(app)
            .get('/admin-only')
            .set('x-role', 'user');

        expect(res.statusCode).toBe(403);
    });

    it('Menolak request tanpa identitas user', async () => {
        const res = await request(app).get('/admin-only');

        expect(res.statusCode).toBe(403);
        expect(res.body.message).toContain('Hanya Admin');
    });
});
