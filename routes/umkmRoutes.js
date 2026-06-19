const express = require('express');
const router = express.Router();
const umkmController = require('../controllers/UmkmController');
const auth = require('../middleware/authMiddleware'); 

router.get('/', umkmController.getAllUmkm);
router.get('/saved', auth, umkmController.getSavedUmkm);
router.get('/activity', auth, umkmController.getUserActivity);
router.get('/mine', auth, umkmController.getMyUmkm);
router.post('/', auth, umkmController.createUmkm);
router.get('/:id', umkmController.getUmkmById);
router.put('/:id', auth, umkmController.updateUmkm);
router.delete('/:id', auth, umkmController.deleteUmkm);
router.post('/:id/save', auth, umkmController.saveUmkm);
router.delete('/:id/save', auth, umkmController.unsaveUmkm);
router.post('/:id/reviews', auth, umkmController.addReview);
router.put('/:id/reviews/:reviewId', auth, umkmController.updateReview);
router.delete('/:id/reviews/:reviewId', auth, umkmController.deleteReview);

module.exports = router;
