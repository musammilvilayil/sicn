const mongoose = require('mongoose');

const nodeSchema = new mongoose.Schema(
  {
    nodeId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    floor: {
      type: Number,
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        'checkpoint',
        'room',
        'stair',
        'lift',
        'corridor',
        'entrance',
        'restroom',
        'lab',
        'office',
        'library',
        'hall',
      ],
      default: 'room',
    },
    coordinates: {
      x: { type: Number, required: true },
      y: { type: Number, required: true },
      z: { type: Number, default: 0 }, // Height in meters or floor level
    },
    qrCode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    accessible: {
      type: Boolean,
      default: true, // stairs are false, lifts/ramps/corridors are true
    },
    building: {
      type: String,
      default: 'Main Block',
    },
    metadata: {
      roomNumber: { type: String },
      department: { type: String },
      capacity: { type: Number },
      description: { type: String },
      dimensions: { type: String }, // e.g., "876x1203"
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Node', nodeSchema);

