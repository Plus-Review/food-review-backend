const request = require('supertest');
const express = require('express');
const umkmRoutes = require('../routes/umkmRoutes');

// --- ARRANGE: Setup Express & Mocks ---
const app = express();
app.use(express.json());

// 1. Mocking Middleware Auth
jest.mock('../middleware/authMiddleware', () => (req, res, next) => {
    req.user = { id: 1 };
    next();
});

// 2. 🌟 Mocking Multer (VERSI ANTI-BADAI)
jest.mock('multer', () => {
    const multerInstance = {
        single: jest.fn(() => (req, res, next) => {
            req.file = { filename: 'test-image.jpg' };
            next();
        }),
        array: jest.fn(() => (req, res, next) => {
            req.files = [{ filename: 'test-image1.jpg' }, { filename: 'test-image2.jpg' }];
            next();
        }),
        any: jest.fn(() => (req, res, next) => next())
    };
    
    // Jadikan multer sebagai fungsi yang mengembalikan instance di atas
    const multer = jest.fn(() => multerInstance);
    multer.diskStorage = jest.fn();
    return multer;
});

// 3. Mocking Model Sequelize
jest.mock('../models', () => ({
    Umkm: {
        findAll: jest.fn(),
        create: jest.fn(),
        findByPk: jest.fn(),
        update: jest.fn(),
        destroy: jest.fn()
    },
    Review: {
        create: jest.fn()
    },
    User: {}
}));

const { Umkm, Review } = require('../models');

// Daftarkan route ke express bohongan kita
app.use('/api/umkm', umkmRoutes);

// ==========================================
//        MULAI 20 REGRESSION TEST SUITE
// ==========================================

describe('UMKM API Regression Tests', () => {
    
    beforeEach(() => {
        jest.clearAllMocks(); 
    });

    // ─── ENDPOINT: GET /api/umkm ───
    describe('GET /api/umkm', () => {
        it('1. [Happy Path] harus mengembalikan status 200 dan daftar UMKM', async () => {
            Umkm.findAll.mockResolvedValue([{ id: 1, nama_umkm: 'Warung A' }, { id: 2, nama_umkm: 'Warung B' }]);
            const res = await request(app).get('/api/umkm');
            expect(res.status).toBe(200);
            expect(res.body.length).toBe(2);
            expect(res.body[0].nama_umkm).toBe('Warung A');
        });

        it('2. [Happy Path] harus mengembalikan array kosong jika belum ada data UMKM', async () => {
            Umkm.findAll.mockResolvedValue([]);
            const res = await request(app).get('/api/umkm');
            expect(res.status).toBe(200);
            expect(res.body.length).toBe(0);
        });

        it('3. [Error Scenario] harus mengembalikan 500 jika terjadi putus koneksi ke database', async () => {
            Umkm.findAll.mockRejectedValue(new Error('Koneksi Database Timeout'));
            const res = await request(app).get('/api/umkm');
            expect(res.status).toBe(500);
            expect(res.body.message).toBe('Koneksi Database Timeout');
        });
    });

    // ─── ENDPOINT: GET /api/umkm/:id ───
    describe('GET /api/umkm/:id', () => {
        it('4. [Happy Path] harus mengembalikan data detail UMKM berdasarkan ID valid', async () => {
            Umkm.findByPk.mockResolvedValue({ id: 1, nama_umkm: 'Warung B' });
            const res = await request(app).get('/api/umkm/1');
            expect(res.status).toBe(200);
            expect(res.body.nama_umkm).toBe('Warung B');
        });

        it('5. [Error Scenario] harus mengembalikan 404 jika ID UMKM tidak ada di database', async () => {
            Umkm.findByPk.mockResolvedValue(null);
            const res = await request(app).get('/api/umkm/999');
            expect(res.status).toBe(404);
            expect(res.body.message).toMatch(/tidak ada di database/i);
        });

        it('6. [Error Scenario] harus mengembalikan 500 jika pencarian ID mengalami error server', async () => {
            Umkm.findByPk.mockRejectedValue(new Error('Kesalahan internal'));
            const res = await request(app).get('/api/umkm/1');
            expect(res.status).toBe(500);
        });
    });

    // ─── ENDPOINT: POST /api/umkm ───
    describe('POST /api/umkm', () => {
        it('7. [Happy Path] harus berhasil membuat UMKM baru dengan data lengkap', async () => {
            Umkm.create.mockResolvedValue({ id: 1, nama_umkm: 'Warung Baru', image: 'test-image.jpg' });
            const res = await request(app)
                .post('/api/umkm')
                .send({ nama_umkm: 'Warung Baru', harga_range: '10k-20k' });
            expect(res.status).toBe(201);
            expect(res.body.nama_umkm).toBe('Warung Baru');
        });

        it('8. [Error/Validation] harus menolak (400) dan gagal jika nama_umkm dikirim kosong', async () => {
            const res = await request(app)
                .post('/api/umkm')
                .send({ harga_range: '10k-20k' }); // Tanpa nama_umkm
            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/tidak boleh kosong/i);
        });

        it('9. [Error/Validation] harus menolak (400) jika nama_umkm hanya berisi spasi kosong', async () => {
            const res = await request(app)
                .post('/api/umkm')
                .send({ nama_umkm: '   ' }); 
            expect(res.status).toBe(400);
        });

        it('10. [Error Scenario] harus mengembalikan 500 jika Sequelize gagal insert (contoh: tipe data salah)', async () => {
            Umkm.create.mockRejectedValue(new Error('Tipe data kolom latitude tidak valid'));
            const res = await request(app)
                .post('/api/umkm')
                .send({ nama_umkm: 'Warung Gagal' });
            expect(res.status).toBe(500);
        });
    });

    // ─── ENDPOINT: POST /api/umkm/:id/reviews ───
    describe('POST /api/umkm/:id/reviews', () => {
        it('11. [Happy Path] harus berhasil menambahkan ulasan baru dengan rating dan komentar valid', async () => {
            Review.create.mockResolvedValue({ id: 1, rating: 5, komentar: 'Sangat enak!' });
            const res = await request(app)
                .post('/api/umkm/1/reviews')
                .send({ rating: 5, komentar: 'Sangat enak!' });
            expect(res.status).toBe(201);
            expect(res.body.message).toBe('Review berhasil ditambahkan!');
        });

        it('12. [Error/Validation] harus ditolak (400) jika rating melebihi batas maksimal (> 5)', async () => {
            const res = await request(app)
                .post('/api/umkm/1/reviews')
                .send({ rating: 6, komentar: 'Sangat enak!' }); 
            expect(res.status).toBe(400);
            expect(res.body.errors[0].msg).toBe('Rating harus 1-5');
        });

        it('13. [Error/Validation] harus ditolak (400) jika rating di bawah batas minimal (< 1)', async () => {
            const res = await request(app)
                .post('/api/umkm/1/reviews')
                .send({ rating: 0, komentar: 'Buruk' }); 
            expect(res.status).toBe(400);
            expect(res.body.errors[0].msg).toBe('Rating harus 1-5');
        });

        it('14. [Error/Validation] harus ditolak (400) jika rating kosong atau bukan angka', async () => {
            const res = await request(app)
                .post('/api/umkm/1/reviews')
                .send({ rating: 'lima', komentar: 'Mantap' }); 
            expect(res.status).toBe(400);
        });

        it('15. [Error/Validation] harus ditolak (400) jika komentar kurang dari 5 karakter', async () => {
            const res = await request(app)
                .post('/api/umkm/1/reviews')
                .send({ rating: 4, komentar: 'oke' }); // Cuma 3 huruf
            expect(res.status).toBe(400);
            expect(res.body.errors[0].msg).toBe('Komentar minimal 5 karakter');
        });

        it('16. [Error Scenario] harus mengembalikan 500 jika database gagal menyimpan review baru', async () => {
            Review.create.mockRejectedValue(new Error('Gagal simpan ke MySQL'));
            const res = await request(app)
                .post('/api/umkm/1/reviews')
                .send({ rating: 4, komentar: 'Lumayan enak' });
            expect(res.status).toBe(500);
        });
    });

    // ─── ENDPOINT: PUT /api/umkm/:id ───
    describe('PUT /api/umkm/:id', () => {
        it('17. [Happy Path] harus berhasil memperbarui data UMKM yang sudah ada', async () => {
            Umkm.update.mockResolvedValue([1]); 
            const res = await request(app).put('/api/umkm/1').send({ nama_umkm: 'Warung Update' });
            expect(res.status).toBe(200); 
        });

        it('18. [Error Scenario] harus mengembalikan 404 jika UMKM yang mau diupdate tidak ada', async () => {
            Umkm.update.mockResolvedValue([0]); // 0 baris berubah
            const res = await request(app).put('/api/umkm/999').send({ nama_umkm: 'Warung Update' });
            expect(res.status).toBe(404);
        });
    });

    // ─── ENDPOINT: DELETE /api/umkm/:id ───
    describe('DELETE /api/umkm/:id', () => {
        it('19. [Happy Path] harus berhasil menghapus data UMKM', async () => {
            Umkm.destroy.mockResolvedValue(1); 
            const res = await request(app).delete('/api/umkm/1');
            expect(res.status).toBe(200);
        });

        it('20. [Error Scenario] harus mengembalikan 404 jika UMKM yang mau dihapus tidak ditemukan', async () => {
            Umkm.destroy.mockResolvedValue(0); // 0 baris terhapus
            const res = await request(app).delete('/api/umkm/999');
            expect(res.status).toBe(404);
        });
    });
});