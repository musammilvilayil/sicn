const mongoose = require('mongoose');
const pointSchema = new mongoose.Schema({ x: { type: Number, required: true, min: 0, max: 1 }, y: { type: Number, required: true, min: 0, max: 1 } }, { _id: false });
const schema = new mongoose.Schema({
 floor: { type: Number, required: true, min: 0, max: 7 }, sourcePdf: { type: String, required: true, trim: true }, pageNumber: { type: Number, required: true, min: 1 }, pageWidth: { type: Number, required: true, min: 1 }, pageHeight: { type: Number, required: true, min: 1 },
 calibrationPoints: { type: [pointSchema], required: true, validate: v => v.length === 2 }, knownDistanceMeters: { type: Number, required: true, min: 0.01 }, metersPerPdfPoint: { type: Number, required: true, min: 0.000001 }, reference: { type: String, required: true, trim: true, maxlength: 200 }, status: { type: String, enum: ['plan_calibrated'], default: 'plan_calibrated' }, calibratedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
schema.index({ floor: 1, sourcePdf: 1, pageNumber: 1 }, { unique: true });
module.exports = mongoose.model('MetricFloorCalibration', schema);
