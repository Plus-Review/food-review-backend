jest.mock('multer', () => {
    const middleware = (req, res, next) => {
        req.files = req.files || [];
        next();
    };
    const instance = {
        array: jest.fn(() => middleware),
        fields: jest.fn(() => middleware),
    };
    const multer = jest.fn(() => instance);
    multer.diskStorage = jest.fn(() => ({}));
    multer.memoryStorage = jest.fn(() => ({}));
    multer.MulterError = class MulterError extends Error {};
    return multer;
});
jest.mock('./models', () => ({
    Umkm: {
        findAll: jest.fn(),
        findByPk: jest.fn(),
    },
    Review: {
        findAll: jest.fn(),
        findOne: jest.fn(),
    },
    User: {
        findByPk: jest.fn(),
    },
    SavedUmkm: {
        destroy: jest.fn(),
        findAll: jest.fn(),
        findOrCreate: jest.fn(),
    },
}));
jest.mock('./utils/uploadStorage', () => ({
    createUploadStorage: jest.fn(() => ({})),
    deleteStoredImage: jest.fn(),
    persistRequestFiles: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./utils/notifications', () => ({
    createAdminNotification: jest.fn().mockResolvedValue(null),
    createUserNotification: jest.fn().mockResolvedValue(null),
}));

const { Review, SavedUmkm, Umkm } = require('./models');
const UmkmController = require('./controllers/UmkmController');

const createResponse = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

describe('UMKM Controller additional coverage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('Mengambil daftar UMKM milik user', async () => {
        Umkm.findAll.mockResolvedValue([{ id: 1, userId: 7 }]);
        const req = { user: { id: 7 } };
        const res = createResponse();

        await UmkmController.getMyUmkm(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(Umkm.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 7 } }));
    });

    it('Menolak daftar UMKM milik user tanpa sesi login', async () => {
        const res = createResponse();

        await UmkmController.getMyUmkm({}, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(Umkm.findAll).not.toHaveBeenCalled();
    });

    it('Mengambil UMKM yang disimpan user', async () => {
        SavedUmkm.findAll.mockResolvedValue([
            {
                toJSON: () => ({
                    createdAt: '2026-06-22T10:00:00.000Z',
                    Umkm: { id: 2, nama_umkm: 'Warung Test' },
                }),
            },
        ]);
        const req = { user: { id: 7 } };
        const res = createResponse();

        await UmkmController.getSavedUmkm(req, res);

        expect(res.json).toHaveBeenCalledWith([
            expect.objectContaining({ id: 2, nama_umkm: 'Warung Test' }),
        ]);
    });

    it('Menyimpan UMKM approved ke daftar simpanan', async () => {
        Umkm.findByPk.mockResolvedValue({ id: 2, verification_status: 'approved' });
        SavedUmkm.findOrCreate.mockResolvedValue([
            { createdAt: new Date('2026-06-22T10:00:00.000Z') },
            true,
        ]);
        const req = { user: { id: 7 }, params: { id: '2' } };
        const res = createResponse();

        await UmkmController.saveUmkm(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ saved: true }));
    });

    it('Menolak menyimpan UMKM yang belum disetujui admin', async () => {
        Umkm.findByPk.mockResolvedValue({ id: 2, verification_status: 'pending_create' });
        const req = { user: { id: 7 }, params: { id: '2' } };
        const res = createResponse();

        await UmkmController.saveUmkm(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(SavedUmkm.findOrCreate).not.toHaveBeenCalled();
    });

    it('Menghapus UMKM dari daftar simpanan', async () => {
        SavedUmkm.destroy.mockResolvedValue(1);
        const req = { user: { id: 7 }, params: { id: '2' } };
        const res = createResponse();

        await UmkmController.unsaveUmkm(req, res);

        expect(SavedUmkm.destroy).toHaveBeenCalledWith({ where: { userId: 7, umkmId: 2 } });
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ saved: false }));
    });

    it('Menghitung ringkasan aktivitas review user', async () => {
        Review.findAll.mockResolvedValue([
            {
                toJSON: () => ({
                    id: 8,
                    rating: 4,
                    komentar: 'Enak',
                    images: ['a.jpg', 'b.jpg'],
                    createdAt: '2026-06-22T10:00:00.000Z',
                    updatedAt: '2026-06-22T10:00:00.000Z',
                    Umkm: { id: 2, nama_umkm: 'Warung Test', images: [], reviews: [] },
                }),
            },
        ]);
        const req = { user: { id: 7 } };
        const res = createResponse();

        await UmkmController.getUserActivity(req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            total: 1,
            totalPhotos: 2,
            averageRating: 4,
        }));
    });

    it('Menghapus review milik user sendiri', async () => {
        const review = {
            userId: 7,
            images: ['review.jpg'],
            destroy: jest.fn().mockResolvedValue(true),
        };
        Review.findOne.mockResolvedValue(review);
        const req = { user: { id: 7 }, params: { id: '2', reviewId: '8' } };
        const res = createResponse();

        await UmkmController.deleteReview(req, res);

        expect(review.destroy).toHaveBeenCalledTimes(1);
        expect(res.json).toHaveBeenCalledWith({ message: 'Review berhasil dihapus.' });
    });

    it('Menolak menghapus review milik user lain', async () => {
        Review.findOne.mockResolvedValue({ userId: 99, images: [], destroy: jest.fn() });
        const req = { user: { id: 7 }, params: { id: '2', reviewId: '8' } };
        const res = createResponse();

        await UmkmController.deleteReview(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
    });
});
