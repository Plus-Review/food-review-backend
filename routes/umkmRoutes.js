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
router.get('/saved', auth, umkmController.getSavedUmkm);
router.get('/activity', auth, umkmController.getUserActivity);
router.get('/mine', auth, umkmController.getMyUmkm);
router.post('/', auth, umkmController.createUmkm);
router.get('/:id', umkmController.getUmkmById);
router.put('/:id', auth, admin, umkmController.updateUmkm);
router.delete('/:id', auth, admin, umkmController.deleteUmkm);
router.post('/:id/save', auth, umkmController.saveUmkm);
router.delete('/:id/save', auth, umkmController.unsaveUmkm);
router.post('/:id/reviews', auth, validateReview, checkValidation, umkmController.addReview);
router.put('/:id/reviews/:reviewId', auth, validateReview, checkValidation, umkmController.updateReview);
router.delete('/:id/reviews/:reviewId', auth, umkmController.deleteReview);

module.exports = router;
