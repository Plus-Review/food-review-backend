const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const authController = require('../controllers/AuthController');
const auth = require('../middleware/authMiddleware');
const validateRequest = require('../middleware/validationMiddleware');

const strongPasswordRule = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,72}$/;

const registerValidation = [
    body('username')
        .trim()
        .isLength({ min: 2, max: 60 })
        .withMessage('Username wajib diisi maksimal 60 karakter.'),
    body('email')
        .trim()
        .isEmail()
        .withMessage('Format email tidak valid.')
        .normalizeEmail(),
    body('password')
        .isString()
        .matches(strongPasswordRule)
        .withMessage('Password wajib memiliki huruf besar, huruf kecil, angka, dan karakter unik.'),
];

const loginValidation = [
    body('email')
        .trim()
        .isEmail()
        .withMessage('Email atau password salah.')
        .normalizeEmail(),
    body('password')
        .isString()
        .notEmpty()
        .withMessage('Email atau password salah.'),
];

const profileValidation = [
    body('username')
        .trim()
        .isLength({ min: 2, max: 60 })
        .withMessage('Nama wajib diisi maksimal 60 karakter.'),
    body('email')
        .trim()
        .isEmail()
        .withMessage('Format email tidak valid.')
        .normalizeEmail(),
    body('password')
        .optional({ values: 'falsy' })
        .isString()
        .matches(strongPasswordRule)
        .withMessage('Password wajib memiliki huruf besar, huruf kecil, angka, dan karakter unik.'),
];

router.post('/register', registerValidation, validateRequest, authController.register);
router.post('/login', loginValidation, validateRequest, authController.login);
router.get('/stats', authController.getStats);
router.get('/profile', auth, authController.getProfile);
router.put('/profile', auth, authController.uploadProfileImage, profileValidation, validateRequest, authController.updateProfile);

module.exports = router;
