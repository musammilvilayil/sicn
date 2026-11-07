const mongoose = require('mongoose');

const teacherSchema = new mongoose.Schema(
  {
    teacherId: {
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
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    department: {
      type: String,
      required: true,
      trim: true,
    },
    designation: {
      type: String,
      default: 'Assistant Professor',
      trim: true,
    },
    cabinNodeId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      ref: 'Node',
    },
    phone: {
      type: String,
      trim: true,
    },
    avatar: {
      type: String,
    },
    subjects: [
      {
        type: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Teacher', teacherSchema);

