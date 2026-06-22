const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');

jest.mock('./models/User', () => ({
    findByPk: jest.fn(),
}));

const User = require('./models/User');
const auth = require('./middleware/authMiddleware');

const app = express();
app.get('/protected', auth, (req, res) => res.json({ userId: req.user.id }));

describe('Middleware keamanan sesi user', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.JWT_SECRET = 'unit-test-secret-key';
    });

    const createToken = (overrides = {}) => jwt.sign({
        id: 7,
        role: 'user',
        tokenVersion: 0,
        ...overrides,
    }, process.env.JWT_SECRET);

    it('Menerima sesi aktif milik user terverifikasi', async () => {
        User.findByPk.mockResolvedValue({
            id: 7,
            role: 'user',
            emailVerified: true,
            tokenVersion: 0,
        });

        const res = await request(app)
            .get('/protected')
            .set('Authorization', `Bearer ${createToken()}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.userId).toBe(7);
    });

    it('Menolak sesi lama setelah password berubah', async () => {
        User.findByPk.mockResolvedValue({
            id: 7,
            role: 'user',
            emailVerified: true,
            tokenVersion: 2,
        });

        const res = await request(app)
            .get('/protected')
            .set('Authorization', `Bearer ${createToken({ tokenVersion: 1 })}`);

        expect(res.statusCode).toBe(401);
        expect(res.body.message).toContain('Sesi sudah berakhir');
    });

    it('Menolak akses akun yang emailnya belum terverifikasi', async () => {
        User.findByPk.mockResolvedValue({
            id: 7,
            role: 'user',
            email: 'tester@kampus.test',
            emailVerified: false,
            tokenVersion: 0,
        });

        const res = await request(app)
            .get('/protected')
            .set('Authorization', `Bearer ${createToken()}`);

        expect(res.statusCode).toBe(403);
        expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    });
});
