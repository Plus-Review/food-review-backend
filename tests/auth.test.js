const request = require('supertest');
const express = require('express');

jest.mock('../models/User', () => ({
    create: jest.fn(),
    findOne: jest.fn(),
}));
jest.mock('../models/PendingRegistration', () => ({
    destroy: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    sequelize: { transaction: jest.fn() },
}));
jest.mock('../models', () => ({
    User: require('../models/User'),
}));
jest.mock('bcryptjs', () => ({
    genSalt: jest.fn(),
    hash: jest.fn(),
    compare: jest.fn(),
}));
jest.mock('jsonwebtoken', () => ({
    sign: jest.fn(),
}));
jest.mock('../utils/adminSeed', () => ({
    ensureDefaultAdmins: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../utils/mailer', () => ({
    sendVerificationEmail: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
}));

const authController = require('../controllers/AuthController');
const User = require('../models/User');
const PendingRegistration = require('../models/PendingRegistration');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sendVerificationEmail } = require('../utils/mailer');

const app = express();
app.use(express.json());
app.post('/api/auth/register', authController.register);
app.post('/api/auth/login', authController.login);

describe('Auth Controller Tests', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        process.env.JWT_SECRET = 'unit-test-secret-key';
        User.findOne.mockResolvedValue(null);
        bcrypt.genSalt.mockResolvedValue('randomSalt');
        bcrypt.hash.mockResolvedValue('hashedPassword');
        sendVerificationEmail.mockResolvedValue({ delivered: true, development: false });
        PendingRegistration.destroy.mockResolvedValue(0);
        PendingRegistration.findOne.mockResolvedValue(null);
        PendingRegistration.create.mockResolvedValue({
            destroy: jest.fn().mockResolvedValue(undefined),
        });
    });

    describe('POST /api/auth/register', () => {
        it('1. [Happy Path] harus menyimpan registrasi pending', async () => {
            const res = await request(app).post('/api/auth/register').send({
                username: 'Fikrank',
                email: 'test@mail.com',
                password: 'Password123!',
            });

            expect(res.status).toBe(201);
            expect(res.body.message).toContain('Kode verifikasi telah dikirim');
            expect(PendingRegistration.create).toHaveBeenCalledTimes(1);
            expect(User.create).not.toHaveBeenCalled();
        });

        it('2. [Error Scenario] harus mengembalikan 500 jika simpan pending gagal', async () => {
            PendingRegistration.create.mockRejectedValueOnce(new Error('Database Down'));

            const res = await request(app).post('/api/auth/register').send({
                username: 'Fikrank',
                email: 'test@mail.com',
                password: 'Password123!',
            });

            expect(res.status).toBe(500);
            expect(PendingRegistration.create).toHaveBeenCalledTimes(1);
            expect(User.create).not.toHaveBeenCalled();
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
                email: 'test@mail.com', password: 'Password123!',
            });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Login Berhasil');
            expect(res.body.token).toBe('fake-jwt-token');
        });

        it('4. [Error Scenario] harus mengembalikan 401 jika email user tidak ditemukan', async () => {
            User.findOne.mockResolvedValue(null);

            const res = await request(app).post('/api/auth/login').send({
                email: 'salah@mail.com', password: 'Password123!',
            });

            expect(res.status).toBe(401);
            expect(res.body.message).toBe('Email atau password salah.');
        });

        it('5. [Error Scenario] harus menolak password yang salah', async () => {
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
                email: 'test@mail.com', password: 'wrongpassword',
            });

            expect(res.status).toBe(401);
            expect(res.body.message).toBe('Email atau password salah.');
        });

        it('6. [Error Scenario] harus mengembalikan 500 saat database gagal', async () => {
            User.findOne.mockRejectedValue(new Error('Database Down'));

            const res = await request(app).post('/api/auth/login').send({
                email: 'test@mail.com', password: 'Password123!',
            });

            expect(res.status).toBe(500);
            expect(res.body.message).toBe('Database Down');
        });
    });
});
