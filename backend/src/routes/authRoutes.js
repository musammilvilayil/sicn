const express = require('express');
const router = express.Router();
const {
  registerUser,
  provisionUser,
  loginUser,
  getUserProfile,
  updateUserLocation,
  changePassword,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/register', registerUser);
router.post('/provision', protect, require('../middleware/authMiddleware').authorizeRoles('Admin'), provisionUser);
router.post('/login', loginUser);
router.get('/me', protect, getUserProfile);
router.put('/location', protect, updateUserLocation);
router.put('/password', protect, changePassword);

module.exports = router;

