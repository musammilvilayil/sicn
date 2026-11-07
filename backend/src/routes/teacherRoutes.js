const express = require('express');
const router = express.Router();
const {
  getTeachers,
  getTeacherById,
  getTeacherDestination,
} = require('../controllers/teacherController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// Timetable & Teacher destination routing restricted to Student, Teacher, and Admin roles
router.get('/', protect, authorizeRoles('Student', 'Teacher', 'Admin'), getTeachers);
router.get('/:teacherId', protect, authorizeRoles('Student', 'Teacher', 'Admin'), getTeacherById);
router.get(
  '/:teacherId/destination',
  protect,
  authorizeRoles('Student', 'Teacher', 'Admin'),
  getTeacherDestination
);

module.exports = router;
