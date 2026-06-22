const request = require('supertest');
const express = require('express');
const crypto = require('crypto');

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
jest.mock('./utils/adminSeed', () => ({
    ensureDefaultAdmins: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./utils/mailer', () => ({
    sendVerificationEmail: jest.fn().mockResolvedValue({ delivered: true, development: false }),
    sendPasswordResetEmail: jest.fn().mockResolvedValue({ delivered: true, development: false }),
}));

const { User } = require('./models');
const bcrypt = require('bcryptjs');
const { sendPasswordResetEmail, sendVerificationEmail } = require('./utils/mailer');
const AuthController = require('./controllers/AuthController');

const app = express();
app.use(express.json());
app.post('/api/auth/register', AuthController.register);
app.post('/api/auth/login', AuthController.login);
app.post('/api/auth/verify-email', AuthController.verifyEmail);
app.post('/api/auth/resend-verification', AuthController.resendVerification);
app.post('/api/auth/forgot-password', AuthController.forgotPassword);
app.post('/api/auth/reset-password', AuthController.resetPassword);
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
        expect(bcrypt.genSalt).toHaveBeenCalledWith(12);
        expect(bcrypt.hash).toHaveBeenCalledWith('Password123!', 'salt');
        expect(User.create).toHaveBeenCalledTimes(1);
        expect(sendVerificationEmail).toHaveBeenCalledWith(expect.objectContaining({
            to: 'fikrank@test.com',
        }));
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

    it('Harus menolak user biasa yang mencoba login menggunakan username', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                loginId: 'MahasiswaTester',
                password: 'Password123!',
            });

        expect(res.statusCode).toBe(401);
        expect(res.body.message).toBe('Akun biasa wajib login menggunakan email.');
        expect(User.findOne).not.toHaveBeenCalled();
    });

    it('Harus berhasil login admin resmi menggunakan username', async () => {
        User.findOne.mockResolvedValue({
            id: 2,
            username: 'dum',
            name: 'Dum',
            email: 'dum@plusreview.local',
            password: 'hashed_admin_password',
            profileImage: null,
            role: 'admin',
        });
        bcrypt.compare.mockResolvedValue(true);

        const res = await request(app)
            .post('/api/auth/login')
            .send({
                loginId: 'dum',
                password: 'dum123',
            });

        expect(res.statusCode).toBe(200);
        expect(res.body.user.role).toBe('admin');
        expect(res.body.admin.username).toBe('dum');
        expect(User.findOne).toHaveBeenCalledWith({
            where: { username: 'dum', role: 'admin' },
        });
    });

    it('Harus tetap menerima admin resmi jika frontend lama mengirim username melalui field email', async () => {
        User.findOne.mockResolvedValue({
            id: 2,
            username: 'dum',
            name: 'Dum',
            email: 'dum@plusreview.local',
            password: 'hashed_admin_password',
            profileImage: null,
            role: 'admin',
        });
        bcrypt.compare.mockResolvedValue(true);

        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'dum',
                password: 'dum123',
            });

        expect(res.statusCode).toBe(200);
        expect(res.body.user.role).toBe('admin');
        expect(res.body.admin.username).toBe('dum');
        expect(User.findOne).toHaveBeenCalledWith({
            where: { username: 'dum', role: 'admin' },
        });
    });

    it('Harus menolak admin yang mencoba login menggunakan email', async () => {
        User.findOne.mockResolvedValue({
            id: 2,
            username: 'dum',
            name: 'Dum',
            email: 'dum@plusreview.local',
            password: 'hashed_admin_password',
            profileImage: null,
            role: 'admin',
        });

        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'dum@plusreview.local',
                password: 'dum123',
            });

        expect(res.statusCode).toBe(401);
        expect(res.body.message).toBe('Admin wajib login menggunakan username admin.');
        expect(bcrypt.compare).not.toHaveBeenCalled();
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

    it('Harus menolak login akun yang emailnya belum diverifikasi', async () => {
        User.findOne.mockResolvedValue({
            id: 7,
            username: 'Mahasiswa Tester',
            email: 'tester@kampus.test',
            password: 'hashed_password',
            role: 'user',
            emailVerified: false,
        });
        bcrypt.compare.mockResolvedValue(true);

        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'tester@kampus.test', password: 'Password123!' });

        expect(res.statusCode).toBe(403);
        expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
        expect(res.body.requiresVerification).toBe(true);
    });

    it('Harus memverifikasi kode email yang valid dan sekali pakai', async () => {
        const user = {
            emailVerified: false,
            emailVerificationTokenHash: crypto.createHash('sha256').update('123456').digest('hex'),
            emailVerificationExpiresAt: new Date(Date.now() + 60_000),
            save: jest.fn().mockResolvedValue(true),
        };
        User.findOne.mockResolvedValue(user);

        const res = await request(app)
            .post('/api/auth/verify-email')
            .send({ email: 'tester@kampus.test', code: '123456' });

        expect(res.statusCode).toBe(200);
        expect(user.emailVerified).toBe(true);
        expect(user.emailVerificationTokenHash).toBeNull();
        expect(user.emailVerificationExpiresAt).toBeNull();
        expect(user.save).toHaveBeenCalledTimes(1);
    });

    it('Harus menolak kode verifikasi yang kedaluwarsa', async () => {
        User.findOne.mockResolvedValue({
            emailVerified: false,
            emailVerificationTokenHash: crypto.createHash('sha256').update('123456').digest('hex'),
            emailVerificationExpiresAt: new Date(Date.now() - 1000),
        });

        const res = await request(app)
            .post('/api/auth/verify-email')
            .send({ email: 'tester@kampus.test', code: '123456' });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toContain('kedaluwarsa');
    });

    it('Harus memberikan respons reset password yang sama untuk email yang tidak terdaftar', async () => {
        User.findOne.mockResolvedValue(null);

        const res = await request(app)
            .post('/api/auth/forgot-password')
            .send({ email: 'tidakada@kampus.test' });

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toContain('Jika email terdaftar');
        expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('Harus menyimpan hash token reset dan mengirim email tanpa membocorkan token mentah', async () => {
        const user = {
            email: 'tester@kampus.test',
            username: 'Tester',
            save: jest.fn().mockResolvedValue(true),
        };
        User.findOne.mockResolvedValue(user);

        const res = await request(app)
            .post('/api/auth/forgot-password')
            .send({ email: user.email });

        expect(res.statusCode).toBe(200);
        expect(user.passwordResetTokenHash).toMatch(/^[a-f0-9]{64}$/);
        expect(user.passwordResetExpiresAt).toBeInstanceOf(Date);
        expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
        const sentToken = sendPasswordResetEmail.mock.calls[0][0].token;
        expect(user.passwordResetTokenHash).not.toBe(sentToken);
        expect(res.body.devResetToken).toBeUndefined();
    });

    it('Harus mereset password dan mengakhiri semua sesi lama', async () => {
        const token = 'a'.repeat(64);
        const user = {
            password: 'old_hash',
            passwordResetTokenHash: crypto.createHash('sha256').update(token).digest('hex'),
            passwordResetExpiresAt: new Date(Date.now() + 60_000),
            tokenVersion: 2,
            save: jest.fn().mockResolvedValue(true),
        };
        User.findOne.mockResolvedValue(user);

        const res = await request(app)
            .post('/api/auth/reset-password')
            .send({ token, password: 'PasswordBaru123!' });

        expect(res.statusCode).toBe(200);
        expect(user.password).toBe('hashed_password_rahasia');
        expect(user.passwordResetTokenHash).toBeNull();
        expect(user.passwordResetExpiresAt).toBeNull();
        expect(user.tokenVersion).toBe(3);
        expect(bcrypt.genSalt).toHaveBeenCalledWith(12);
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
