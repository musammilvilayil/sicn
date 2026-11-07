const mongoose = require('mongoose');

const edgeSchema = new mongoose.Schema(
  {
    edgeId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    fromNode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    toNode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    distance: {
      type: Number,
      required: true, // distance in meters
      min: 0,
    },
    distanceEvidence: {
      source: { type: String, enum: ['architectural_plan', 'field_measured', 'admin_estimate'] },
      reference: { type: String, trim: true },
      measuredAt: { type: Date },
      notes: { type: String, trim: true },
    },
    accessible: {
      type: Boolean,
      default: true,
    },
    type: {
      type: String,
      enum: ['walking', 'stairs', 'lift', 'ramp'],
      default: 'walking',
    },
    instruction: {
      type: String,
      trim: true,
    },
    reverseInstruction: {
      type: String,
      trim: true,
    },
    isBidirectional: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Edge', edgeSchema);

