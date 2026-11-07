const Teacher = require('../models/Teacher');
const Timetable = require('../models/Timetable');
const Node = require('../models/Node');

// Helper to get current day name in IST / local time
const getDayName = (date = new Date()) => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
};

// Helper to format HH:mm
const getTimeString = (date = new Date()) => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

// @desc    Get all teachers
// @route   GET /api/teachers
const getTeachers = async (req, res) => {
  try {
    const teachers = await Teacher.find({}).sort({ name: 1 }).lean();
    
    // Attach cabin node info
    const cabinNodeIds = teachers.map((t) => t.cabinNodeId);
    const cabinNodes = await Node.find({ nodeId: { $in: cabinNodeIds } }).lean();
    const nodeMap = new Map();
    cabinNodes.forEach((n) => nodeMap.set(n.nodeId, n));

    const teachersWithCabin = teachers.map((t) => ({
      ...t,
      cabin: nodeMap.get(t.cabinNodeId) || null,
    }));

    return res.json(teachersWithCabin);
  } catch (error) {
    console.error('getTeachers error:', error);
    return res.status(500).json({ message: 'Error fetching teachers', error: error.message });
  }
};

// @desc    Get single teacher profile + weekly schedule
// @route   GET /api/teachers/:teacherId
const getTeacherById = async (req, res) => {
  try {
    const teacherId = req.params.teacherId.toUpperCase();
    const teacher = await Teacher.findOne({ teacherId }).lean();

    if (!teacher) {
      return res.status(404).json({ message: `Teacher '${teacherId}' not found` });
    }

    const [cabinNode, timetables] = await Promise.all([
      Node.findOne({ nodeId: teacher.cabinNodeId }).lean(),
      Timetable.find({ teacherId }).sort({ dayOfWeek: 1, startTime: 1 }).lean(),
    ]);

    // Attach room details to each timetable entry
    const roomIds = timetables.map((t) => t.roomNodeId);
    const roomNodes = await Node.find({ nodeId: { $in: roomIds } }).lean();
    const roomMap = new Map();
    roomNodes.forEach((r) => roomMap.set(r.nodeId, r));

    const enrichedTimetables = timetables.map((t) => ({
      ...t,
      room: roomMap.get(t.roomNodeId) || null,
    }));

    return res.json({
      ...teacher,
      cabin: cabinNode,
      timetable: enrichedTimetables,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Get dynamic destination node for a teacher based on current/specified time & day
// @route   GET /api/teachers/:teacherId/destination
const getTeacherDestination = async (req, res) => {
  try {
    const teacherId = req.params.teacherId.toUpperCase();
    const teacher = await Teacher.findOne({ teacherId }).lean();

    if (!teacher) {
      return res.status(404).json({ message: `Teacher '${teacherId}' not found` });
    }

    // Allow testing/demo with specific query day & time, or default to now
    const now = new Date();
    const queryDay = req.query.day || getDayName(now);
    const queryTime = req.query.time || getTimeString(now);

    // Find any class scheduled for this day and time
    // Matches if startTime <= queryTime <= endTime
    const activeSchedule = await Timetable.findOne({
      teacherId,
      dayOfWeek: queryDay,
      startTime: { $lte: queryTime },
      endTime: { $gte: queryTime },
    }).lean();

    const cabinNode = await Node.findOne({ nodeId: teacher.cabinNodeId }).lean();

    if (activeSchedule) {
      const roomNode = await Node.findOne({ nodeId: activeSchedule.roomNodeId }).lean();

      return res.json({
        success: true,
        teacher: {
          teacherId: teacher.teacherId,
          name: teacher.name,
          department: teacher.department,
          designation: teacher.designation,
          avatar: teacher.avatar,
        },
        checkedTime: queryTime,
        checkedDay: queryDay,
        status: 'in_class',
        statusText: `Teaching ${activeSchedule.courseCode}: ${activeSchedule.subject}`,
        destinationNodeId: activeSchedule.roomNodeId,
        destinationNode: roomNode,
        activeClass: {
          subject: activeSchedule.subject,
          courseCode: activeSchedule.courseCode,
          semester: activeSchedule.semester,
          startTime: activeSchedule.startTime,
          endTime: activeSchedule.endTime,
          roomName: roomNode ? roomNode.name : activeSchedule.roomNodeId,
          floor: roomNode ? roomNode.floor : null,
        },
        cabinNode,
      });
    }

    // If teacher is not currently in a class, return their office/cabin node
    return res.json({
      success: true,
      teacher: {
        teacherId: teacher.teacherId,
        name: teacher.name,
        department: teacher.department,
        designation: teacher.designation,
        avatar: teacher.avatar,
      },
      checkedTime: queryTime,
      checkedDay: queryDay,
      status: 'in_cabin',
      statusText: `Office Hours / In Cabin (${cabinNode ? cabinNode.name : teacher.cabinNodeId})`,
      destinationNodeId: teacher.cabinNodeId,
      destinationNode: cabinNode,
      activeClass: null,
      cabinNode,
    });
  } catch (error) {
    console.error('getTeacherDestination error:', error);
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getTeachers,
  getTeacherById,
  getTeacherDestination,
};

