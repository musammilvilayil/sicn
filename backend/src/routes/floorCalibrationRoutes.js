const express = require('express');
const router = express.Router();
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const {
  getFloorCalibrations,
  saveFloorCalibration,
  deleteFloorCalibration,
} = require('../controllers/floorCalibrationController');

router.get('/', getFloorCalibrations);
router.put('/:floor', protect, authorizeRoles('Admin'), saveFloorCalibration);
router.delete('/:floor', protect, authorizeRoles('Admin'), deleteFloorCalibration);

module.exports = router;
