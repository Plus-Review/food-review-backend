jest.mock('fs', () => ({
    mkdirSync: jest.fn(),
    unlink: jest.fn(),
}));
jest.mock('multer', () => ({
    diskStorage: jest.fn((options) => ({ type: 'disk', options })),
    memoryStorage: jest.fn(() => ({ type: 'memory' })),
}));
jest.mock('@vercel/blob', () => ({
    del: jest.fn(),
    put: jest.fn(),
}));

const fs = require('fs');
const multer = require('multer');
const { del, put } = require('@vercel/blob');
const {
    createUploadStorage,
    deleteStoredImage,
    isVercelBlobUrl,
    persistRequestFiles,
    persistUploadedFile,
    usesBlobStorage,
} = require('./utils/uploadStorage');

describe('Upload storage', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.STORAGE_DRIVER;
        delete process.env.VERCEL;
        delete process.env.BLOB_READ_WRITE_TOKEN;
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('Menggunakan penyimpanan lokal secara default', () => {
        expect(usesBlobStorage()).toBe(false);

        const storage = createUploadStorage('umkm');

        expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('uploads'), { recursive: true });
        expect(multer.diskStorage).toHaveBeenCalledTimes(1);
        expect(storage.type).toBe('disk');
    });

    it('Menggunakan memory storage untuk Vercel Blob', () => {
        process.env.STORAGE_DRIVER = 'vercel-blob';

        const storage = createUploadStorage('profile');

        expect(usesBlobStorage()).toBe(true);
        expect(multer.memoryStorage).toHaveBeenCalledTimes(1);
        expect(storage.type).toBe('memory');
    });

    it('Mendeteksi konfigurasi Blob melalui token atau environment Vercel', () => {
        process.env.BLOB_READ_WRITE_TOKEN = 'token-test';
        expect(usesBlobStorage()).toBe(true);

        delete process.env.BLOB_READ_WRITE_TOKEN;
        process.env.VERCEL = '1';
        expect(usesBlobStorage()).toBe(true);
    });

    it('Tidak mengubah file ketika memakai penyimpanan lokal', async () => {
        const file = { filename: 'menu.jpg' };

        await expect(persistUploadedFile(file, 'umkm')).resolves.toBe(file);
        expect(put).not.toHaveBeenCalled();
    });

    it('Menolak upload Blob tanpa buffer', async () => {
        process.env.STORAGE_DRIVER = 'vercel-blob';

        await expect(persistUploadedFile({ mimetype: 'image/jpeg' }, 'umkm'))
            .rejects.toThrow('Data gambar tidak tersedia');
    });

    it('Mengunggah buffer dan menyimpan URL Blob pada file', async () => {
        process.env.STORAGE_DRIVER = 'vercel-blob';
        put.mockResolvedValue({
            url: 'https://demo.public.blob.vercel-storage.com/plus-review/umkm/menu.jpg',
        });
        const file = {
            originalname: 'Menu Utama.jpg',
            mimetype: 'image/jpeg',
            buffer: Buffer.from('gambar'),
        };

        const result = await persistUploadedFile(file, 'umkm');

        expect(put).toHaveBeenCalledWith(
            expect.stringMatching(/^plus-review\/umkm\//),
            file.buffer,
            expect.objectContaining({ access: 'public', contentType: 'image/jpeg' })
        );
        expect(result.filename).toContain('.blob.vercel-storage.com');
        expect(result.path).toBe(result.filename);
    });

    it('Memproses kumpulan file berbentuk object', async () => {
        process.env.STORAGE_DRIVER = 'vercel-blob';
        put
            .mockResolvedValueOnce({ url: 'https://demo.public.blob.vercel-storage.com/a.jpg' })
            .mockResolvedValueOnce({ url: 'https://demo.public.blob.vercel-storage.com/b.jpg' });
        const files = {
            image: [{ originalname: 'a.jpg', mimetype: 'image/jpeg', buffer: Buffer.from('a') }],
            detail_images: [{ originalname: 'b.jpg', mimetype: 'image/jpeg', buffer: Buffer.from('b') }],
        };

        await persistRequestFiles(files, 'umkm');

        expect(put).toHaveBeenCalledTimes(2);
    });

    it('Memvalidasi URL Vercel Blob', () => {
        expect(isVercelBlobUrl('https://demo.public.blob.vercel-storage.com/a.jpg')).toBe(true);
        expect(isVercelBlobUrl('https://example.com/a.jpg')).toBe(false);
        expect(isVercelBlobUrl('bukan-url')).toBe(false);
    });

    it('Menghapus gambar Blob menggunakan API del', () => {
        del.mockResolvedValue(undefined);

        deleteStoredImage('https://demo.public.blob.vercel-storage.com/a.jpg');

        expect(del).toHaveBeenCalledWith('https://demo.public.blob.vercel-storage.com/a.jpg');
    });

    it('Menghapus gambar lokal menggunakan fs.unlink', () => {
        fs.unlink.mockImplementation((filePath, callback) => callback(null));

        deleteStoredImage('menu.jpg');

        expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('menu.jpg'), expect.any(Function));
    });

    it('Mengabaikan referensi gambar kosong atau tidak aman', () => {
        deleteStoredImage('');
        deleteStoredImage('../rahasia.jpg');

        expect(fs.unlink).not.toHaveBeenCalled();
        expect(del).not.toHaveBeenCalled();
    });
});
