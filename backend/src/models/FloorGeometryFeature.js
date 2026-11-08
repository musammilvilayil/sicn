const mongoose = require('mongoose');
const pointSchema = new mongoose.Schema({ x: { type: Number, required: true, min: 0, max: 1 }, y: { type: Number, required: true, min: 0, max: 1 } }, { _id: false });
const schema = new mongoose.Schema({
 floor: { type: Number, required: true, min: 0, max: 7, index: true },
 sourcePdf: { type: String, required: true, trim: true },
 pageNumber: { type: Number, required: true, min: 1 },
 featureType: { type: String, required: true, enum: ['wall_boundary','fence_boundary','door_opening','corridor_centerline','room_footprint','room_label_anchor','room_entry_connector'] },
 label: { type: String, trim: true, maxlength: 100, default: '' },
 coordinateSystem: { type: String, enum: ['pdf_normalized'], default: 'pdf_normalized' },
 points: { type: [pointSchema], required: true },
 status: { type: String, enum: ['candidate','reviewed','field_verified'], default: 'candidate' },
 notes: { type: String, trim: true, maxlength: 1000, default: '' },
 createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
schema.index({ floor: 1, sourcePdf: 1, pageNumber: 1 });
module.exports = mongoose.model('FloorGeometryFeature', schema);
