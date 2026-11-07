const mongoose = require('mongoose');

const controlPointSchema = new mongoose.Schema({
  nodeId: { type: String, required: true, trim: true, uppercase: true },
  mapX: { type: Number, required: true },
  mapY: { type: Number, required: true },
  pdfX: { type: Number, required: true, min: 0, max: 1 },
  pdfY: { type: Number, required: true, min: 0, max: 1 },
}, { _id: false });

const floorCalibrationSchema = new mongoose.Schema({
  floor: { type: Number, required: true, min: 0, max: 7, unique: true, index: true },
  sourcePdf: { type: String, required: true },
  pageNumber: { type: Number, required: true, min: 1 },
  pageWidth: { type: Number, required: true, min: 1 },
  pageHeight: { type: Number, required: true, min: 1 },
  controlPoints: { type: [controlPointSchema], required: true, validate: (v) => v.length >= 3 },
  transform: {
    xCoefficients: { type: [Number], required: true },
    yCoefficients: { type: [Number], required: true },
  },
  rmsError: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['registered'], default: 'registered' },
  fieldVerified: { type: Boolean, default: false },
  fieldVerificationNote: { type: String, default: '' },
  fieldVerifiedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('FloorCalibration', floorCalibrationSchema);
