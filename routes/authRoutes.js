const express = require('express');
const router = express.Router();
const authController = require('../controllers/AuthController');
const auth = require('../middleware/authMiddleware');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/stats', authController.getStats);
router.get('/profile', auth, authController.getProfile);
router.put('/profile', auth, authController.uploadProfileImage, authController.updateProfile);

module.exports = router;
