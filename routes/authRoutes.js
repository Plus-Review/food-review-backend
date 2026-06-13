const express = require('express');
const router = express.Router();
const authController = require('../controllers/AuthController');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 5, 
    message: { success: false, message: "Terlalu banyak percobaan login, silakan coba lagi setelah 15 menit." }
});
router.post('/register', authController.register);
router.post('/login', authController.login);
//loginLimiter di hilangkan untuk sementara
module.exports = router;