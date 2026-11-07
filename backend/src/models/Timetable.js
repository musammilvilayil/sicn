const mongoose = require('mongoose');

const timetableSchema = new mongoose.Schema(
  {
    teacherId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      ref: 'Teacher',
      index: true,
    },
    dayOfWeek: {
      type: String,
      required: true,
      enum: [
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday',
      ],
      index: true,
    },
    startTime: {
      type: String, // "09:00"
      required: true,
      trim: true,
    },
    endTime: {
      type: String, // "10:00"
      required: true,
      trim: true,
    },
    roomNodeId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      ref: 'Node',
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    courseCode: {
      type: String,
      trim: true,
    },
    semester: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to quickly find teacher schedule on a given day
timetableSchema.index({ teacherId: 1, dayOfWeek: 1 });

module.exports = mongoose.model('Timetable', timetableSchema);

