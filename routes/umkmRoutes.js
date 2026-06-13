const express = require('express');
const router = express.Router();
const umkmController = require('../controllers/UmkmController');
const auth = require('../middleware/authMiddleware'); 
const { body, validationResult } = require('express-validator');

const validateReview = [
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating harus 1-5'),
    body('komentar').trim().isLength({ min: 5 }).withMessage('Komentar minimal 5 karakter').escape()
];

const checkValidation = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    next();
};

// ─── DEFINISI ROUTE UMKM ───
router.get('/', umkmController.getAllUmkm);
router.get('/:id', umkmController.getUmkmById);
router.post('/', auth, umkmController.createUmkm);

// 🌟 TAMBAHAN UNTUK LULUS TEST 17-20 (UPDATE & DELETE)
router.put('/:id', auth, umkmController.updateUmkm);
router.delete('/:id', auth, umkmController.deleteUmkm);

// 🌟 ROUTE REVIEW (Hanya 1 kali, lengkap dengan validasi)
router.post('/:id/reviews', auth, validateReview, checkValidation, umkmController.addReview);

module.exports = router;