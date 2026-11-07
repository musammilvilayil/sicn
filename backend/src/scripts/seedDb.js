const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Node = require('../models/Node');
const Edge = require('../models/Edge');
const Teacher = require('../models/Teacher');
const Timetable = require('../models/Timetable');
const User = require('../models/User');
const { syncSeedDataFile } = require('./buildCampusGraph');
const { findShortestPath } = require('../algorithms/aStar');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const DEMO_USERS = [
  {
    name: 'Campus Admin',
    email: 'admin@bji.ac.in',
    password: 'AdminPassword@123',
    role: 'Admin',
    department: 'Administration',
    currentLocationNodeId: '1F-OFFICE',
    avatarColor: '#dc2626',
  },
  {
    name: 'Dr. Priya Nair',
    email: 'priya.nair@bji.ac.in',
    password: 'Teacher@123',
    role: 'Teacher',
    teacherId: 'TCH-001',
    department: 'Computer Science & Engineering',
    currentLocationNodeId: '1F-HOD-CS',
    avatarColor: '#7c3aed',
  },
  {
    name: 'Alex Johnson',
    email: 'student@bji.ac.in',
    password: 'Password@123',
    role: 'Student',
    department: 'Computer Science & Engineering',
    currentLocationNodeId: 'GF-MAIN-ENTRANCE',
    avatarColor: '#2563eb',
  },
  {
    name: 'Guest Visitor',
    email: 'visitor@bji.ac.in',
    password: 'Visitor@123',
    role: 'Normal_User',
    department: 'Visitor',
    currentLocationNodeId: 'GF-MAIN-ENTRANCE',
    avatarColor: '#059669',
  },
];

const seedDatabase = async () => {
  try {
    // 1. Build & validate complete 8-floor (GF through 7F) campus spatial graph into seedData.json
    const seedData = syncSeedDataFile();
    console.log(
      `Synchronized seedData.json: ${seedData.nodes.length} nodes & ${seedData.edges.length} edges across Floors 0–7.`
    );

    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/indoor_navigation';
    await mongoose.connect(mongoUri);
    console.log(`Connected to MongoDB at ${mongoUri}`);

    await Promise.all([
      Node.deleteMany({}),
      Edge.deleteMany({}),
      Teacher.deleteMany({}),
      Timetable.deleteMany({}),
      User.deleteMany({}),
    ]);
    console.log('Cleared existing collections.');

    const insertedNodes = await Node.insertMany(seedData.nodes);
    console.log(`Seeded ${insertedNodes.length} Nodes across Ground through 7th Floor:`);
    for (let f = 0; f <= 7; f++) {
      const count = insertedNodes.filter((n) => n.floor === f).length;
      console.log(`  • ${f === 0 ? 'Ground Floor (0)' : `Floor ${f} (${f}F)`}: ${count} nodes`);
    }

    const insertedEdges = await Edge.insertMany(seedData.edges);
    const interFloorCount = insertedEdges.filter((e) => e.type === 'stairs' || e.type === 'lift').length;
    console.log(
      `Seeded ${insertedEdges.length} Edges (${interFloorCount} sequential vertical stair/lift shaft links).`
    );

    const insertedTeachers = await Teacher.insertMany(seedData.teachers);
    console.log(`Seeded ${insertedTeachers.length} Teachers.`);

    const insertedTimetables = await Timetable.insertMany(seedData.timetables);
    console.log(`Seeded ${insertedTimetables.length} Timetable entries.`);

    for (const u of DEMO_USERS) {
      await User.create(u);
    }
    console.log(`Seeded ${DEMO_USERS.length} Demo Users across all 4 RBAC roles.`);

    // 2. Verify continuous multi-floor A* routing from Ground Floor all the way to 6th & 7th Floors
    const seminarRoute = findShortestPath(
      'GF-MAIN-ENTRANCE',
      '6F-SEMINAR-HALL',
      insertedNodes,
      insertedEdges
    );
    const rooftopAccessibleRoute = findShortestPath(
      'GF-MAIN-ENTRANCE',
      '7F-TERRACE-CENTRAL',
      insertedNodes,
      insertedEdges,
      { accessibleOnly: true }
    );

    if (!seminarRoute.success || !rooftopAccessibleRoute.success) {
      throw new Error('Multi-floor A* pathfinding verification failed after seeding!');
    }

    console.log(
      `Verified A* Route [GF -> 6F Seminar Hall]: ${seminarRoute.totalDistance}m via floors [${seminarRoute.floorsCovered.join(' -> ')}]`
    );
    console.log(
      `Verified Accessible A* Route [GF -> 7F Central Terrace]: ${rooftopAccessibleRoute.totalDistance}m via [${rooftopAccessibleRoute.nodeIds.join(' -> ')}]`
    );

    console.log('Database seeding successfully finished!');
    process.exit(0);
  } catch (error) {
    console.error('Error during database seeding:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase, DEMO_USERS };
