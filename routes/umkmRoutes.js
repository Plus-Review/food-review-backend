const express = require('express');
const router = express.Router();
const umkmController = require('../controllers/UmkmController');
const auth = require('../middleware/authMiddleware'); 

router.get('/', umkmController.getAllUmkm);
router.post('/', auth, umkmController.createUmkm);

module.exports = router;