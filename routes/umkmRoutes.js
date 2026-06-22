const express = require('express');
const router = express.Router();
const umkmController = require('../controllers/UmkmController');
const auth = require('../middleware/authMiddleware'); 
const admin = require('../middleware/adminMiddleware');
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

/* =========================================================
   1. RUTE STATIS (Harus di atas /:id)
========================================================= */
router.get('/', umkmController.getAllUmkm);
router.get('/admin/stats', auth, admin, umkmController.getAdminStats);
// Rute Khusus Admin
router.get('/admin/pending', auth, admin, umkmController.getPendingUmkm);

// User biasa BOLEH CREATE (otomatis statusnya 'pending' dari DB)
router.post('/', auth, umkmController.uploadMiddleware, umkmController.createUmkm);


/* =========================================================
   2. RUTE DINAMIS DENGAN SUFFIX (Harus di atas /:id yang berdiri sendiri)
========================================================= */
// Admin memvalidasi UMKM
router.put('/:id/verify', auth, admin, umkmController.verifyUmkm);

// Review: Create
router.post(
    '/:id/reviews', 
    auth, 
    umkmController.uploadMiddleware, 
    validateReview, 
    checkValidation, 
    umkmController.addReview
);

// Review: Update & Delete
router.put(
    '/:id/reviews/:reviewId', 
    auth, 
    umkmController.uploadMiddleware, 
    validateReview, 
    checkValidation, 
    umkmController.updateReview
);
router.delete('/:id/reviews/:reviewId', auth, umkmController.deleteReview);


/* =========================================================
   3. RUTE DINAMIS PARAMETER TUNGGAL (Harus Paling Bawah)
========================================================= */
router.get('/:id', umkmController.getUmkmById);

// HANYA ADMIN YANG BOLEH UPDATE & DELETE UMKM
router.put('/:id', auth, admin, umkmController.uploadMiddleware, umkmController.updateUmkm);
router.delete('/:id', auth, admin, umkmController.deleteUmkm);

module.exports = router;