const express = require('express');
const router = express.Router();
const Node = require('../models/Node');
const Edge = require('../models/Edge');
const Teacher = require('../models/Teacher');
const Timetable = require('../models/Timetable');
const seedData = require('../data/seedData.json');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// Deliberately disabled by default. This endpoint is only for a disposable
// development database and never deletes users or administrator accounts.
router.post('/', protect, authorizeRoles('Admin'), async (req, res) => {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DESTRUCTIVE_SEED !== 'true') {
    return res.status(403).json({
      message: 'Database reseeding is disabled. Use a reviewed migration instead.',
    });
  }

  try {
    await Promise.all([
      Node.deleteMany({}),
      Edge.deleteMany({}),
      Teacher.deleteMany({}),
      Timetable.deleteMany({}),
    ]);

    const [nodes, edges, teachers, timetables] = await Promise.all([
      Node.insertMany(seedData.nodes),
      Edge.insertMany(seedData.edges),
      Teacher.insertMany(seedData.teachers),
      Timetable.insertMany(seedData.timetables),
    ]);

    return res.json({
      message: 'Development campus data reseeded. User and administrator accounts were preserved.',
      nodesCount: nodes.length,
      edgesCount: edges.length,
      teachersCount: teachers.length,
      timetablesCount: timetables.length,
    });
  } catch (error) {
    console.error('Development seed error:', error);
    return res.status(500).json({ message: 'Development seeding failed.' });
  }
});

module.exports = router;
