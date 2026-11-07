const router = require('express').Router();
const { protect, authorizeRoles, optionalAuth } = require('../middleware/authMiddleware');
const controller = require('../controllers/campusSurveyController');

router.get('/', optionalAuth, controller.list);
router.post('/', protect, authorizeRoles('Admin'), controller.create);
router.put('/:id', protect, authorizeRoles('Admin'), controller.updateMetadata);
router.put('/:id/video', protect, authorizeRoles('Admin'), controller.uploadVideo);
router.post('/:id/publish', protect, authorizeRoles('Admin'), controller.publish);
router.get('/:id/video', optionalAuth, controller.streamVideo);
router.delete('/:id', protect, authorizeRoles('Admin'), controller.remove);

module.exports = router;
