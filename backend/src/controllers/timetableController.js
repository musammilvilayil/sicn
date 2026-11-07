const Timetable = require('../models/Timetable');
const Teacher = require('../models/Teacher');
const Node = require('../models/Node');

// @desc    Get all timetable schedules with optional filters
// @route   GET /api/timetable
const getTimetables = async (req, res) => {
  try {
    const { day, teacherId, roomNodeId } = req.query;
    const filter = {};

    if (day) filter.dayOfWeek = day;
    if (teacherId) filter.teacherId = teacherId.toUpperCase();
    if (roomNodeId) filter.roomNodeId = roomNodeId.toUpperCase();

    const schedules = await Timetable.find(filter)
      .sort({
        dayOfWeek: 1,
        startTime: 1,
      })
      .lean();

    const teacherIds = [...new Set(schedules.map((s) => s.teacherId))];
    const roomIds = [...new Set(schedules.map((s) => s.roomNodeId))];

    const [teachers, rooms] = await Promise.all([
      Teacher.find({ teacherId: { $in: teacherIds } }).lean(),
      Node.find({ nodeId: { $in: roomIds } }).lean(),
    ]);

    const teacherMap = new Map();
    teachers.forEach((t) => teacherMap.set(t.teacherId, t));

    const roomMap = new Map();
    rooms.forEach((r) => roomMap.set(r.nodeId, r));

    const enriched = schedules.map((s) => ({
      ...s,
      teacher: teacherMap.get(s.teacherId) || null,
      room: roomMap.get(s.roomNodeId) || null,
    }));

    return res.json(enriched);
  } catch (error) {
    console.error('getTimetables error:', error);
    return res.status(500).json({ message: 'Error retrieving timetable', error: error.message });
  }
};

// @desc    Create a timetable entry (Teacher & Admin RBAC)
// @route   POST /api/timetable
const createTimetableEntry = async (req, res) => {
  try {
    let { teacherId, dayOfWeek, startTime, endTime, roomNodeId, subject, courseCode, semester } = req.body;

    // If user is a Teacher, enforce they can only manage their own linked teacherId
    if (req.user.role === 'Teacher') {
      if (!req.user.teacherId) {
        return res.status(400).json({ message: 'Your Teacher account has no linked teacherId profile' });
      }
      if (teacherId && teacherId.toUpperCase() !== req.user.teacherId.toUpperCase()) {
        return res.status(403).json({
          message: `Teachers can only modify their own timetable (${req.user.teacherId})`,
        });
      }
      teacherId = req.user.teacherId;
    }

    if (!teacherId || !dayOfWeek || !startTime || !endTime || !roomNodeId || !subject) {
      return res.status(400).json({
        message: 'teacherId, dayOfWeek, startTime, endTime, roomNodeId, and subject are required',
      });
    }

    const roomExists = await Node.findOne({ nodeId: roomNodeId.toUpperCase() });
    if (!roomExists) {
      return res.status(404).json({ message: `Room node '${roomNodeId}' does not exist` });
    }

    const entry = await Timetable.create({
      teacherId: teacherId.toUpperCase(),
      dayOfWeek,
      startTime,
      endTime,
      roomNodeId: roomNodeId.toUpperCase(),
      subject: subject.trim(),
      courseCode: courseCode ? courseCode.trim() : 'GEN101',
      semester: semester ? semester.trim() : 'General',
    });

    return res.status(201).json({
      message: 'Timetable slot added successfully',
      entry,
    });
  } catch (error) {
    console.error('createTimetableEntry error:', error);
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Update a timetable entry (Teacher & Admin RBAC)
// @route   PUT /api/timetable/:id
const updateTimetableEntry = async (req, res) => {
  try {
    const entry = await Timetable.findById(req.params.id);
    if (!entry) {
      return res.status(404).json({ message: 'Timetable entry not found' });
    }

    if (
      req.user.role === 'Teacher' &&
      entry.teacherId.toUpperCase() !== (req.user.teacherId || '').toUpperCase()
    ) {
      return res.status(403).json({
        message: 'You are only authorized to update your own timetable entries',
      });
    }

    const { dayOfWeek, startTime, endTime, roomNodeId, subject, courseCode, semester } = req.body;

    if (dayOfWeek) entry.dayOfWeek = dayOfWeek;
    if (startTime) entry.startTime = startTime;
    if (endTime) entry.endTime = endTime;
    if (roomNodeId) entry.roomNodeId = roomNodeId.toUpperCase();
    if (subject) entry.subject = subject.trim();
    if (courseCode !== undefined) entry.courseCode = courseCode.trim();
    if (semester !== undefined) entry.semester = semester.trim();

    await entry.save();
    return res.json({ message: 'Timetable entry updated successfully', entry });
  } catch (error) {
    console.error('updateTimetableEntry error:', error);
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Delete a timetable entry (Teacher & Admin RBAC)
// @route   DELETE /api/timetable/:id
const deleteTimetableEntry = async (req, res) => {
  try {
    const entry = await Timetable.findById(req.params.id);
    if (!entry) {
      return res.status(404).json({ message: 'Timetable entry not found' });
    }

    if (
      req.user.role === 'Teacher' &&
      entry.teacherId.toUpperCase() !== (req.user.teacherId || '').toUpperCase()
    ) {
      return res.status(403).json({
        message: 'You are only authorized to delete your own timetable entries',
      });
    }

    await entry.deleteOne();
    return res.json({ message: 'Timetable entry deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getTimetables,
  createTimetableEntry,
  updateTimetableEntry,
  deleteTimetableEntry,
};
