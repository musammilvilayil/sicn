const mongoose = require('mongoose');

const checkpointSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  nodeId: { type: String, trim: true, default: '' },
  floor: { type: Number, min: 0, max: 7, required: true },
  elapsedMs: { type: Number, min: 0, required: true },
  note: { type: String, trim: true, maxlength: 500, default: '' },
}, { _id: false });

const tracePointSchema = new mongoose.Schema({
  elapsedMs: { type: Number, min: 0, required: true },
  heading: { type: Number, min: 0, max: 360, default: null },
  latitude: { type: Number, min: -90, max: 90, default: null },
  longitude: { type: Number, min: -180, max: 180, default: null },
  floor: { type: Number, min: 0, max: 7, required: true },
  steps: { type: Number, min: 0, default: 0 },
}, { _id: false });

const schema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  startNodeId: { type: String, trim: true, default: '' },
  endNodeId: { type: String, trim: true, default: '' },
  floors: { type: [Number], default: [] },
  checkpoints: { type: [checkpointSchema], default: [] },
  trace: { type: [tracePointSchema], default: [] },
  videoFileId: { type: mongoose.Schema.Types.ObjectId, default: null },
  videoContentType: { type: String, default: '' },
  videoSize: { type: Number, default: 0 },
  durationMs: { type: Number, default: 0 },
  status: { type: String, enum: ['draft', 'published'], default: 'draft', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  publishedAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ status: 1, createdAt: -1 });
module.exports = mongoose.model('CampusSurvey', schema);
