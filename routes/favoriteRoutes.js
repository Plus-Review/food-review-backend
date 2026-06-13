const express = require('express');
const router = express.Router();
const favoriteController = require('../controllers/favoriteController');
const authMiddleware = require('../middleware/authMiddleware'); // Panggil pelindung token JWT-mu

router.post('/toggle', authMiddleware, favoriteController.toggleFavorite);
router.get('/me', authMiddleware, favoriteController.getMyFavorites);

module.exports = router;