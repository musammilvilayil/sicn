const express=require('express');
const router=express.Router();
const {protect,authorizeRoles}=require('../middleware/authMiddleware');
const {getMetricFloorCalibration,saveMetricFloorCalibration}=require('../controllers/metricFloorCalibrationController');
router.get('/',getMetricFloorCalibration);
router.put('/:floor',protect,authorizeRoles('Admin'),saveMetricFloorCalibration);
module.exports=router;
