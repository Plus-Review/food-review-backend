const path = require('path');
const {
    cleanEmail,
    cleanText,
    createUploadFilename,
    getSafeErrorMessage,
    imageFileFilter,
    isValidEmail,
    normalizeCategory,
    normalizeFilename,
    normalizeImageList,
    parseCoordinate,
    parsePositiveInt,
    resolveUploadPath,
} = require('./utils/security');

describe('Unit Test: Utilitas Security dan Sanitasi', () => {
    it('Harus membersihkan teks, email, dan memvalidasi format email', () => {
        expect(cleanText('  Halo\u0000PlusReview  ', 8)).toBe('HaloPlus');
        expect(cleanEmail(' USER@EMAIL.COM ')).toBe('user@email.com');
        expect(isValidEmail('user@email.com')).toBe(true);
        expect(isValidEmail('email-salah')).toBe(false);
    });

    it('Harus menormalisasi kategori makanan dari alias user', () => {
        expect(normalizeCategory('nasi')).toBe('Makanan berat');
        expect(normalizeCategory('dessert')).toBe('Snacks & Dessert');
        expect(normalizeCategory('kopi')).toBe('Drinks');
        expect(normalizeCategory('kategori tidak ada')).toBe('');
    });

    it('Harus mem-parse angka koordinat dan integer positif dengan aman', () => {
        expect(parseCoordinate('-4.013')).toBe(-4.013);
        expect(parseCoordinate('bukan angka')).toBe(0);
        expect(parsePositiveInt('12')).toBe(12);
        expect(parsePositiveInt('-1')).toBeNull();
    });

    it('Harus menolak filename berbahaya dan menerima gambar valid', () => {
        expect(normalizeFilename('foto-menu.webp')).toBe('foto-menu.webp');
        expect(normalizeFilename('../rahasia.png')).toBe('');
        expect(normalizeFilename('script.exe')).toBe('');
        expect(normalizeImageList(['a.jpg', '../b.png', 'c.webp'])).toEqual(['a.jpg', 'c.webp']);
    });

    it('Harus membuat path upload tetap berada di folder uploads', () => {
        const uploadsDir = path.join(__dirname, 'uploads');
        const resolved = resolveUploadPath(uploadsDir, 'menu.jpg');

        expect(resolved).toBe(path.join(uploadsDir, 'menu.jpg'));
        expect(resolveUploadPath(uploadsDir, '../menu.jpg')).toBeNull();
    });

    it('Harus memfilter upload hanya untuk JPG, PNG, dan WEBP', (done) => {
        const filter = imageFileFilter('Foto UMKM');

        filter({}, { mimetype: 'image/png' }, (err, accepted) => {
            expect(err).toBeNull();
            expect(accepted).toBe(true);

            filter({}, { mimetype: 'application/pdf' }, (invalidErr) => {
                expect(invalidErr).toBeInstanceOf(Error);
                expect(invalidErr.message).toBe('Foto UMKM hanya boleh JPG, PNG, atau WEBP.');
                done();
            });
        });
    });

    it('Harus membuat nama file upload yang aman dan pesan error yang aman', () => {
        const filename = createUploadFilename('Foto UMKM!!', { mimetype: 'image/jpeg' });

        expect(filename).toMatch(/^fotoumkm-\d+-[a-f0-9-]+\.jpg$/i);
        expect(getSafeErrorMessage(new Error('Detail dev'))).toBe('Detail dev');

        process.env.NODE_ENV = 'production';
        expect(getSafeErrorMessage(new Error('Detail dev'))).toBe('Terjadi kesalahan server.');
        process.env.NODE_ENV = 'test';
    });
});
