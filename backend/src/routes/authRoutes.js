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
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const createRateLimiter = require('../middleware/rateLimit');

const registrationLimiter = createRateLimiter({ max: 5, message: 'Too many registration attempts. Try again later.' });
const loginLimiter = createRateLimiter({ max: 10, message: 'Too many login attempts. Try again later.' });
const provisioningLimiter = createRateLimiter({ max: 20, message: 'Too many account creation attempts. Try again later.' });

router.post('/register', registrationLimiter, registerUser);
router.post('/provision', protect, provisioningLimiter, authorizeRoles('Admin'), provisionUser);
router.post('/login', loginLimiter, loginUser);
router.get('/me', protect, getUserProfile);
router.put('/location', protect, updateUserLocation);
router.put('/password', protect, changePassword);

module.exports = router;

