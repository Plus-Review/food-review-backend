const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const adminController = require('../controllers/AdminController');
const notificationController = require('../controllers/NotificationController');
const adminAuth = require('../middleware/adminAuthMiddleware');
const validateRequest = require('../middleware/validationMiddleware');

const adminLoginValidation = [
    body('username')
        .trim()
        .isLength({ min: 3, max: 60 })
        .withMessage('Username admin wajib diisi.'),
    body('password')
        .isString()
        .notEmpty()
        .withMessage('Password admin wajib diisi.'),
];

router.post('/login', adminLoginValidation, validateRequest, adminController.login);
router.get('/me', adminAuth, adminController.me);
router.put('/profile', adminAuth, adminController.uploadProfileImage, adminController.updateProfile);
router.get('/stats', adminController.getPublicStats);
router.get('/notifications', adminAuth, notificationController.getAdminNotifications);
router.patch('/notifications/read-all', adminAuth, notificationController.markAllAdminNotificationsRead);
router.patch('/notifications/:id/read', adminAuth, notificationController.markAdminNotificationRead);
router.delete('/notifications/:id', adminAuth, notificationController.deleteAdminNotification);
router.post('/notifications/:id/delete', adminAuth, notificationController.deleteAdminNotification);
router.get('/umkm', adminAuth, adminController.getUmkmQueue);
router.post('/umkm/:id/approve', adminAuth, adminController.approveUmkm);
router.post('/umkm/:id/reject', adminAuth, adminController.rejectUmkm);

module.exports = router;
