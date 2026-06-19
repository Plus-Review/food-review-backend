const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/NotificationController');
const auth = require('../middleware/authMiddleware');

router.get('/', auth, notificationController.getMyNotifications);
router.patch('/read-all', auth, notificationController.markAllMyNotificationsRead);
router.patch('/:id/read', auth, notificationController.markMyNotificationRead);

module.exports = router;
