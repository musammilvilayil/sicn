const express = require('express');
const router = express.Router();
const Node = require('../models/Node');
const Edge = require('../models/Edge');
const Teacher = require('../models/Teacher');
const Timetable = require('../models/Timetable');
const User = require('../models/User');
const seedData = require('../data/seedData.json');
const { DEMO_USERS } = require('../scripts/seedDb');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

router.post('/', protect, authorizeRoles('Admin'), async (req, res) => {
  try {
    await Promise.all([
      Node.deleteMany({}),
      Edge.deleteMany({}),
      Teacher.deleteMany({}),
      Timetable.deleteMany({}),
      User.deleteMany({}),
    ]);

    await Node.insertMany(seedData.nodes);
    await Edge.insertMany(seedData.edges);
    await Teacher.insertMany(seedData.teachers);
    await Timetable.insertMany(seedData.timetables);

    for (const u of DEMO_USERS) {
      await User.create(u);
    }

    return res.json({
      message: 'Database successfully re-seeded with all 4 RBAC roles!',
      nodesCount: seedData.nodes.length,
      edgesCount: seedData.edges.length,
      teachersCount: seedData.teachers.length,
      timetablesCount: seedData.timetables.length,
    });
  } catch (error) {
    console.error('Seed error:', error);
    return res.status(500).json({ message: 'Seeding failed', error: error.message });
  }
});

module.exports = router;
