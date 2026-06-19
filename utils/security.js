const crypto = require('crypto');
const path = require('path');

const ALLOWED_IMAGE_TYPES = new Map([
    ['image/jpeg', '.jpg'],
    ['image/png', '.png'],
    ['image/webp', '.webp'],
]);

const CATEGORY_OPTIONS = [
    'Makanan berat',
    'Snacks & Dessert',
    'Drinks',
];

const stripUnsafeControlChars = (value) => (
    String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
);

const cleanText = (value, maxLength = 500) => (
    stripUnsafeControlChars(value).trim().slice(0, maxLength)
);

const normalizeCategoryKey = (value) => cleanText(value, 80)
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const CATEGORY_ALIASES = [
    {
        canonical: 'Makanan berat',
        aliases: ['makanan berat', 'makanan utama', 'menu utama', 'nasi', 'ayam', 'bakso', 'mie'],
    },
    {
        canonical: 'Snacks & Dessert',
        aliases: [
            'snacks dessert',
            'snack dessert',
            'snacks dan dessert',
            'snack dan dessert',
            'dessert snacks',
            'dessert snack',
            'dessert',
            'desert',
            'snacks',
            'snack',
            'cemilan',
            'camilan',
            'jajanan',
            'kue',
            'roti',
        ],
    },
    {
        canonical: 'Drinks',
        aliases: ['drinks', 'drink', 'minuman', 'kopi', 'coffee', 'teh', 'jus', 'juice', 'boba'],
    },
];

const CATEGORY_LOOKUP = new Map();

CATEGORY_OPTIONS.forEach((category) => {
    CATEGORY_LOOKUP.set(normalizeCategoryKey(category), category);
});

CATEGORY_ALIASES.forEach(({ canonical, aliases }) => {
    aliases.forEach((alias) => {
        CATEGORY_LOOKUP.set(normalizeCategoryKey(alias), canonical);
    });
});

const cleanEmail = (value) => cleanText(value, 160).toLowerCase();

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const normalizeCategory = (value) => {
    const raw = normalizeCategoryKey(value);
    return CATEGORY_LOOKUP.get(raw) || '';
};

const parseCoordinate = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
};

const parsePositiveInt = (value) => {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
};

const getImageExtension = (file) => ALLOWED_IMAGE_TYPES.get(file?.mimetype);

const imageFileFilter = (label = 'File gambar') => (req, file, cb) => {
    if (!getImageExtension(file)) {
        cb(new Error(`${label} hanya boleh JPG, PNG, atau WEBP.`));
        return;
    }

    cb(null, true);
};

const createUploadFilename = (prefix, file) => {
    const extension = getImageExtension(file) || '.jpg';
    const safePrefix = cleanText(prefix, 24).replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'upload';
    return `${safePrefix}-${Date.now()}-${crypto.randomUUID()}${extension}`;
};

const normalizeFilename = (filename) => {
    const value = cleanText(filename, 180);
    const basename = path.basename(value);

    if (!basename || basename !== value || !/\.(jpg|jpeg|png|webp)$/i.test(basename)) {
        return '';
    }

    return basename;
};

const normalizeImageList = (images) => (
    Array.isArray(images)
        ? images.map(normalizeFilename).filter(Boolean)
        : []
);

const resolveUploadPath = (uploadsDir, filename) => {
    const basename = normalizeFilename(filename);
    if (!basename) return null;

    const root = path.resolve(uploadsDir);
    const target = path.resolve(root, basename);
    return target.startsWith(`${root}${path.sep}`) ? target : null;
};

const getSafeErrorMessage = (error, fallback = 'Terjadi kesalahan server.') => {
    if (!error) return fallback;
    if (process.env.NODE_ENV === 'production') return fallback;
    return error.message || fallback;
};

module.exports = {
    CATEGORY_OPTIONS,
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
};
