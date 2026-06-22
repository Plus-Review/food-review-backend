const request = require('supertest');
const express = require('express');

jest.mock('../models/User', () => ({
    create: jest.fn(),
    findOne: jest.fn(),
}));
jest.mock('../models', () => ({
    User: require('../models/User'),
}));

jest.mock('bcryptjs', () => ({
    genSalt: jest.fn(),
    hash: jest.fn(),
    compare: jest.fn()
}));

jest.mock('jsonwebtoken', () => ({
    sign: jest.fn()
}));
jest.mock('../utils/adminSeed', () => ({
    ensureDefaultAdmins: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../utils/mailer', () => ({
    sendVerificationEmail: jest.fn().mockResolvedValue({ delivered: true, development: false }),
    sendPasswordResetEmail: jest.fn().mockResolvedValue({ delivered: true, development: false }),
}));

// 🌟 2. IMPORT CONTROLLER SETELAH MOCKING SELESAI
const authController = require('../controllers/AuthController');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// 🌟 3. SETUP EXPRESS BOHONGAN
const app = express();
app.use(express.json());
app.post('/api/auth/register', authController.register);
app.post('/api/auth/login', authController.login);

// ==========================================
//        MULAI TEST SUITE AUTHENTICATION
// ==========================================

describe('Auth Controller Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.JWT_SECRET = 'unit-test-secret-key';
    });

    describe('POST /api/auth/register', () => {
        it('1. [Happy Path] harus berhasil mendaftarkan user baru', async () => {
            bcrypt.genSalt.mockResolvedValue('randomSalt');
            bcrypt.hash.mockResolvedValue('hashedPassword');
            User.create.mockResolvedValue({ id: 1, username: 'Fikrank', email: 'test@mail.com' });

            const res = await request(app).post('/api/auth/register').send({
                username: 'Fikrank',
                email: 'test@mail.com',
                password: 'Password123!'
            });

            expect(res.status).toBe(201);
            expect(res.body.message).toContain('Akun berhasil dibuat');
        });

        it('2. [Error Scenario] harus mengembalikan 500 jika gagal register', async () => {
            User.create.mockRejectedValue(new Error('Email sudah digunakan'));

            const res = await request(app).post('/api/auth/register').send({
                username: 'Fikrank', email: 'test@mail.com', password: 'Password123!'
            });

            expect(res.status).toBe(500);
            expect(res.body.message).toBe('Email sudah digunakan');
        });
    });

    describe('POST /api/auth/login', () => {
        it('3. [Happy Path] harus berhasil login dan mengembalikan token', async () => {
            User.findOne.mockResolvedValue({
                id: 1,
                username: 'Fikrank',
                email: 'test@mail.com',
                password: 'hashedPassword',
                role: 'user',
                emailVerified: true,
            });
            bcrypt.compare.mockResolvedValue(true);
            jwt.sign.mockReturnValue('fake-jwt-token');

            const res = await request(app).post('/api/auth/login').send({
                email: 'test@mail.com', password: 'Password123!'
            });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Login Berhasil');
            expect(res.body.token).toBe('fake-jwt-token');
        });

        it('4. [Error Scenario] harus mengembalikan 401 jika email user tidak ditemukan', async () => {
            User.findOne.mockResolvedValue(null);

            const res = await request(app).post('/api/auth/login').send({
                email: 'salah@mail.com', password: 'Password123!'
            });

            expect(res.status).toBe(401);
            expect(res.body.message).toBe('Email atau password salah.');
        });

        it('5. [Error Scenario] harus mengembalikan 400 jika password salah', async () => {
            User.findOne.mockResolvedValue({
                id: 1,
                username: 'Fikrank',
                email: 'test@mail.com',
                password: 'hashedPassword',
                role: 'user',
                emailVerified: true,
            });
            bcrypt.compare.mockResolvedValue(false);

            const res = await request(app).post('/api/auth/login').send({
                email: 'test@mail.com', password: 'wrongpassword'
            });

            expect(res.status).toBe(401);
            expect(res.body.message).toBe('Email atau password salah.');
        });

        it('6. [Error Scenario] harus mengembalikan 500 jika terjadi kesalahan server saat login', async () => {
            User.findOne.mockRejectedValue(new Error('Database Down'));

            const res = await request(app).post('/api/auth/login').send({
                email: 'test@mail.com', password: 'Password123!'
            });

            expect(res.status).toBe(500);
            expect(res.body.message).toBe('Database Down');
        });
    });
});
