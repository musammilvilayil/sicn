const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Node = require('../models/Node');
const Edge = require('../models/Edge');
const Teacher = require('../models/Teacher');
const Timetable = require('../models/Timetable');
const User = require('../models/User');
const seedData = require('../data/seedData.json');

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
    console.log(`Seeded ${insertedNodes.length} Nodes.`);

    const insertedEdges = await Edge.insertMany(seedData.edges);
    console.log(`Seeded ${insertedEdges.length} Edges.`);

    const insertedTeachers = await Teacher.insertMany(seedData.teachers);
    console.log(`Seeded ${insertedTeachers.length} Teachers.`);

    const insertedTimetables = await Timetable.insertMany(seedData.timetables);
    console.log(`Seeded ${insertedTimetables.length} Timetable entries.`);

    for (const u of DEMO_USERS) {
      await User.create(u);
    }
    console.log(`Seeded ${DEMO_USERS.length} Demo Users across all 4 RBAC roles.`);

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
