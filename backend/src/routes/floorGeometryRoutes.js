const express = require('express');
const router = express.Router();
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const { getFloorGeometryFeatures, createFloorGeometryFeature, deleteFloorGeometryFeature } = require('../controllers/floorGeometryController');
router.get('/', getFloorGeometryFeatures);
router.post('/', protect, authorizeRoles('Admin'), createFloorGeometryFeature);
router.delete('/:id', protect, authorizeRoles('Admin'), deleteFloorGeometryFeature);
module.exports = router;
