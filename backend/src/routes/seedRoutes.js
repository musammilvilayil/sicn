const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const { upsertCampusGraph } = require('../scripts/seedDb');

const SEED_DATA_PATH = path.join(__dirname, '../data/seedData.json');

// Deliberately disabled by default and always blocked in production.
// Synchronizes campus graph/faculty/timetable collections for disposable
// development environments and never deletes or alters User / Admin accounts.
router.post('/', protect, authorizeRoles('Admin'), async (req, res) => {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DESTRUCTIVE_SEED !== 'true') {
    return res.status(403).json({
      message: 'Database reseeding is disabled. Use a reviewed migration instead.',
    });
  }

  try {
    const seedData = JSON.parse(fs.readFileSync(SEED_DATA_PATH, 'utf8'));
    const summary = await upsertCampusGraph(seedData, { pruneStale: true });

    return res.json({
      message: 'Development campus data reseeded. User and administrator accounts were preserved.',
      nodesCount: summary.nodesCount,
      edgesCount: summary.edgesCount,
      teachersCount: summary.teachersCount,
      timetablesCount: summary.timetablesCount,
    });
  } catch (error) {
    console.error('Development seed error:', error);
    return res.status(500).json({ message: 'Development seeding failed.' });
  }
});

module.exports = router;
