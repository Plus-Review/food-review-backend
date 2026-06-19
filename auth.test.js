const request = require('supertest');
const express = require('express');

jest.mock('./models', () => ({
    User: {
        findOne: jest.fn(),
        findByPk: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
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
app.post('/api/auth/login', AuthController.login);
app.get('/api/auth/profile', (req, res) => {
    req.user = { id: Number(req.header('x-user-id') || 1) };
    return AuthController.getProfile(req, res);
});
app.put('/api/auth/profile', (req, res) => {
    req.user = { id: Number(req.header('x-user-id') || 1) };
    return AuthController.updateProfile(req, res);
});
app.get('/api/auth/stats', AuthController.getStats);

describe('Unit Test: Fitur Registrasi (Register)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.JWT_SECRET = 'unit-test-secret-key';
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

    it('Harus menolak format email login yang tidak valid tanpa query database', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'email-tidak-valid',
                password: 'Password123!',
            });

        expect(res.statusCode).toBe(401);
        expect(res.body.message).toBe('Email atau password salah.');
        expect(User.findOne).not.toHaveBeenCalled();
    });

    it('Harus memberi pesan login generik saat user tidak ditemukan', async () => {
        User.findOne.mockResolvedValue(null);

        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'fikrank@test.com',
                password: 'Password123!',
            });

        expect(res.statusCode).toBe(401);
        expect(res.body.message).toBe('Email atau password salah.');
    });

    it('Harus berhasil login dengan kredensial valid', async () => {
        User.findOne.mockResolvedValue({
            id: 7,
            username: 'Mahasiswa Tester',
            email: 'tester@kampus.test',
            password: 'hashed_password',
            profileImage: 'profile.jpg',
        });
        bcrypt.compare.mockResolvedValue(true);

        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'tester@kampus.test',
                password: 'Password123!',
            });

        expect(res.statusCode).toBe(200);
        expect(res.body.token).toBeTruthy();
        expect(res.body.user.email).toBe('tester@kampus.test');
    });

    it('Harus menolak login jika password salah', async () => {
        User.findOne.mockResolvedValue({
            id: 7,
            username: 'Mahasiswa Tester',
            email: 'tester@kampus.test',
            password: 'hashed_password',
        });
        bcrypt.compare.mockResolvedValue(false);

        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'tester@kampus.test',
                password: 'PasswordSalah123!',
            });

        expect(res.statusCode).toBe(401);
        expect(res.body.message).toBe('Email atau password salah.');
    });

    it('Harus menolak registrasi jika username sudah digunakan', async () => {
        User.findOne.mockResolvedValueOnce({ id: 3, username: 'Fikrank Tester' });

        const res = await request(app)
            .post('/api/auth/register')
            .send({
                username: 'Fikrank Tester',
                email: 'baru@test.com',
                password: 'Password123!',
            });

        expect(res.statusCode).toBe(409);
        expect(res.body.message).toBe('Username sudah digunakan.');
        expect(User.create).not.toHaveBeenCalled();
    });

    it('Harus menolak registrasi jika email sudah terdaftar', async () => {
        User.findOne
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: 4, email: 'fikrank@test.com' });

        const res = await request(app)
            .post('/api/auth/register')
            .send({
                username: 'Nama Baru',
                email: 'fikrank@test.com',
                password: 'Password123!',
            });

        expect(res.statusCode).toBe(409);
        expect(res.body.message).toBe('Email sudah terdaftar.');
        expect(User.create).not.toHaveBeenCalled();
    });

    it('Harus mengambil profile user yang sedang login', async () => {
        User.findByPk.mockResolvedValue({
            id: 1,
            username: 'Fikrank Tester',
            email: 'fikrank@test.com',
            profileImage: null,
        });

        const res = await request(app).get('/api/auth/profile');

        expect(res.statusCode).toBe(200);
        expect(res.body.user.username).toBe('Fikrank Tester');
    });

    it('Harus mengembalikan 404 jika profile user tidak ditemukan', async () => {
        User.findByPk.mockResolvedValue(null);

        const res = await request(app).get('/api/auth/profile');

        expect(res.statusCode).toBe(404);
        expect(res.body.message).toBe('User tidak ditemukan');
    });

    it('Harus menolak simpan profile jika tidak ada perubahan', async () => {
        User.findByPk.mockResolvedValue({
            id: 1,
            username: 'Fikrank Tester',
            email: 'fikrank@test.com',
            profileImage: null,
        });

        const res = await request(app)
            .put('/api/auth/profile')
            .send({
                username: 'Fikrank Tester',
                email: 'fikrank@test.com',
                password: '',
            });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe('Isi perubahan terlebih dahulu sebelum menyimpan.');
    });

    it('Harus memperbarui profile dan password jika data valid', async () => {
        const user = {
            id: 1,
            username: 'Fikrank Tester',
            email: 'fikrank@test.com',
            password: 'old_hash',
            profileImage: null,
            save: jest.fn().mockResolvedValue(true),
        };
        User.findByPk.mockResolvedValue(user);
        User.findOne.mockResolvedValue(null);

        const res = await request(app)
            .put('/api/auth/profile')
            .send({
                username: 'Fikrank Updated',
                email: 'updated@test.com',
                password: 'PasswordBaru123!',
            });

        expect(res.statusCode).toBe(200);
        expect(user.username).toBe('Fikrank Updated');
        expect(user.email).toBe('updated@test.com');
        expect(user.password).toBe('hashed_password_rahasia');
        expect(user.save).toHaveBeenCalledTimes(1);
    });

    it('Harus menolak update profile jika password baru lemah', async () => {
        User.findByPk.mockResolvedValue({
            id: 1,
            username: 'Fikrank Tester',
            email: 'fikrank@test.com',
            profileImage: null,
        });
        User.findOne.mockResolvedValue(null);

        const res = await request(app)
            .put('/api/auth/profile')
            .send({
                username: 'Fikrank Updated',
                email: 'updated@test.com',
                password: 'passwordbaru',
            });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe('Password wajib memiliki huruf besar, huruf kecil, angka, dan karakter unik.');
    });

    it('Harus mengembalikan jumlah user untuk statistik publik', async () => {
        User.count.mockResolvedValue(12);

        const res = await request(app).get('/api/auth/stats');

        expect(res.statusCode).toBe(200);
        expect(res.body.totalUsers).toBe(12);
    });
});
