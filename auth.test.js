const request = require('supertest');
const express = require('express');

jest.mock('./models', () => ({
    User: {
        findOne: jest.fn(),
        create: jest.fn(),
    }
}));
jest.mock('bcryptjs', () => ({
    genSalt: jest.fn().mockResolvedValue('salt'),
    hash: jest.fn().mockResolvedValue('hashed_password_rahasia'),
    compare: jest.fn(),
}));

const { User } = require('./models');
const bcrypt = require('bcryptjs');
const AuthController = require('./controllers/AuthController');

const app = express();
app.use(express.json());
app.post('/api/auth/register', AuthController.register);

describe('Unit Test: Fitur Registrasi (Register)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('Harus berhasil mendaftar dan mengembalikan status 201', async () => {
        User.create.mockResolvedValue({
            id: 1,
            username: 'Fikrank Tester',
            email: 'fikrank@test.com'
        });

        const res = await request(app)
            .post('/api/auth/register')
            .send({
                username: 'Fikrank Tester',
                email: 'fikrank@test.com',
                password: 'Password123!'
            });

        expect(res.statusCode).toBe(201);
        expect(bcrypt.genSalt).toHaveBeenCalledWith(10);
        expect(bcrypt.hash).toHaveBeenCalledWith('Password123!', 'salt');
        expect(User.create).toHaveBeenCalledTimes(1);
    });

    it('Harus mengembalikan status 500 jika User.create gagal', async () => {
        User.create.mockRejectedValue(new Error('DB Error'));
        const res = await request(app)
            .post('/api/auth/register')
            .send({
                username: 'Fikrank Tester',
                email: 'fikrank@test.com',
                password: 'Password123!'
            });

        expect(res.statusCode).toBe(500);
        expect(User.create).toHaveBeenCalledTimes(1);
    });

    it('Harus menolak password tanpa kombinasi huruf besar, kecil, angka, dan karakter unik', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({
                username: 'Fikrank Tester',
                email: 'fikrank@test.com',
                password: 'password123'
            });

        expect(res.statusCode).toBe(400);
        expect(User.create).not.toHaveBeenCalled();
    });
});
