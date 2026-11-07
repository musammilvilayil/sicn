const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Node = require('../models/Node');
const Edge = require('../models/Edge');
const Teacher = require('../models/Teacher');
const Timetable = require('../models/Timetable');
const seedData = require('../data/seedData.json');

dotenv.config({ path: path.join(__dirname, '../../.env') });

/**
 * Initial campus-data seeding only. This script never deletes records and
 * never creates demo users or default passwords. Run only against an empty
 * campus-data database.
 */
const seedDatabase = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('MONGODB_URI must be configured before seeding.');

    await mongoose.connect(mongoUri);
    console.log(`Connected to MongoDB at ${mongoose.connection.host}`);

    const [nodesCount, edgesCount, teachersCount, timetablesCount] = await Promise.all([
      Node.countDocuments(),
      Edge.countDocuments(),
      Teacher.countDocuments(),
      Timetable.countDocuments(),
    ]);

    if (nodesCount + edgesCount + teachersCount + timetablesCount > 0) {
      throw new Error(
        'Campus collections are not empty. Seeding stopped to protect existing data. ' +
        'Use a reviewed migration for updates; this script does not reset data.'
      );
    }

    const insertedNodes = await Node.insertMany(seedData.nodes);
    console.log(`Seeded ${insertedNodes.length} nodes.`);

    const insertedEdges = await Edge.insertMany(seedData.edges);
    console.log(`Seeded ${insertedEdges.length} edges.`);

    const insertedTeachers = await Teacher.insertMany(seedData.teachers);
    console.log(`Seeded ${insertedTeachers.length} teachers.`);

    const insertedTimetables = await Timetable.insertMany(seedData.timetables);
    console.log(`Seeded ${insertedTimetables.length} timetable entries.`);

    console.log('Initial campus data seeding completed. Admin provisioning happens at server startup.');
  } catch (error) {
    console.error('Database seeding stopped:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
};

if (require.main === module) seedDatabase();

module.exports = { seedDatabase };
