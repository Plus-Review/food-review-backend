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
    body('loginId')
        .optional({ values: 'falsy' })
        .trim()
        .isLength({ max: 160 })
        .withMessage('Email atau password salah.'),
    body('email')
        .optional({ values: 'falsy' })
        .trim()
        .isLength({ max: 160 })
        .withMessage('Email atau password salah.')
        .customSanitizer((value) => (String(value || '').includes('@') ? String(value).toLowerCase() : value)),
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

const emailValidation = [
    body('email')
        .trim()
        .isEmail()
        .withMessage('Format email tidak valid.')
        .normalizeEmail(),
];

const verifyEmailValidation = [
    ...emailValidation,
    body('code')
        .trim()
        .matches(/^\d{6}$/)
        .withMessage('Kode verifikasi harus terdiri dari 6 angka.'),
];

const resetPasswordValidation = [
    body('token')
        .trim()
        .matches(/^[a-f0-9]{64}$/i)
        .withMessage('Tautan reset password tidak valid atau sudah kedaluwarsa.'),
    body('password')
        .isString()
        .matches(strongPasswordRule)
        .withMessage('Password wajib memiliki huruf besar, huruf kecil, angka, dan karakter unik.'),
];

router.post('/register', registerValidation, validateRequest, authController.register);
router.post('/login', loginValidation, validateRequest, authController.login);
router.post('/verify-email', verifyEmailValidation, validateRequest, authController.verifyEmail);
router.post('/resend-verification', emailValidation, validateRequest, authController.resendVerification);
router.post('/forgot-password', emailValidation, validateRequest, authController.forgotPassword);
router.post('/reset-password', resetPasswordValidation, validateRequest, authController.resetPassword);
router.get('/stats', authController.getStats);
router.get('/profile', auth, authController.getProfile);
router.put('/profile', auth, authController.uploadProfileImage, profileValidation, validateRequest, authController.updateProfile);

module.exports = router;
