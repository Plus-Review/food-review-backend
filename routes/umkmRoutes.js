const express = require('express');
const router = express.Router();
const umkmController = require('../controllers/UmkmController');

router.get('/', umkmController.getAllUmkm); 
router.post('/', umkmController.createUmkm); 

module.exports = router;