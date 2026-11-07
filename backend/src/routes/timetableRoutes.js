const express = require('express');
const router = express.Router();
const {
  getTimetables,
  createTimetableEntry,
  updateTimetableEntry,
  deleteTimetableEntry,
} = require('../controllers/timetableController');
const { getTeacherDestination } = require('../controllers/teacherController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// Students, Teachers, and Admins get timetable viewing & timetable routing
router.get('/', protect, authorizeRoles('Student', 'Teacher', 'Admin'), getTimetables);

router.get(
  '/destination',
  protect,
  authorizeRoles('Student', 'Teacher', 'Admin'),
  (req, res, next) => {
    if (req.query.teacherId) {
      req.params.teacherId = req.query.teacherId;
      return getTeacherDestination(req, res, next);
    }
    return res.status(400).json({ message: 'teacherId query parameter is required' });
  }
);

// Teachers and Admins can create, update, and delete timetable entries
router.post('/', protect, authorizeRoles('Teacher', 'Admin'), createTimetableEntry);
router.put('/:id', protect, authorizeRoles('Teacher', 'Admin'), updateTimetableEntry);
router.delete('/:id', protect, authorizeRoles('Teacher', 'Admin'), deleteTimetableEntry);

module.exports = router;
