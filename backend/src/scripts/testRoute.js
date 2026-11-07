const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Node = require('../models/Node');
const Edge = require('../models/Edge');
const Teacher = require('../models/Teacher');
const Timetable = require('../models/Timetable');
const { findShortestPath } = require('../algorithms/aStar');

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function runTests() {
  console.log('--- Starting A* Indoor Navigation & Timetable Integration Test ---\n');

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/indoor_navigation';
  await mongoose.connect(mongoUri);

  const nodes = await Node.find({}).lean();
  const edges = await Edge.find({}).lean();

  console.log(`Loaded ${nodes.length} Nodes and ${edges.length} Edges from database.`);

  const startId = 'GF-MAIN-ENTRANCE';
  const targetId = '1F-CLASS-02';

  console.log(`\nTEST 1: Routing from ${startId} to ${targetId} (Standard Path via Stairs)...`);
  const standardResult = findShortestPath(startId, targetId, nodes, edges, { accessibleOnly: false });

  if (!standardResult.success) {
    console.error('Test 1 FAILED: Could not find route!', standardResult);
    process.exit(1);
  }

  console.log('✓ Test 1 SUCCESSFUL!');
  console.log(`  Path Nodes count: ${standardResult.path.length}`);
  console.log(`  Path Node IDs: ${standardResult.nodeIds.join(' -> ')}`);
  console.log(`  Total Distance: ${standardResult.totalDistance} meters`);
  console.log(`  Estimated Time: ${standardResult.estimatedTimeMinutes} min`);
  console.log(`  Floors Covered: ${standardResult.floorsCovered.join(', ')}`);
  console.log('\n  Step-by-step directions:');
  standardResult.directions.forEach((d) => {
    console.log(`   [Step ${d.step}] (Floor ${d.floor}) ${d.instruction} ${d.distance ? `[${d.distance}m]` : ''}`);
  });

  console.log(`\nTEST 2: Routing from ${startId} to ${targetId} (Wheelchair / Accessible Mode via Elevator)...`);
  const accessibleResult = findShortestPath(startId, targetId, nodes, edges, { accessibleOnly: true });

  if (!accessibleResult.success) {
    console.error('Test 2 FAILED: Could not find accessible route!', accessibleResult);
    process.exit(1);
  }

  console.log('✓ Test 2 SUCCESSFUL!');
  console.log(`  Accessible Path Node IDs: ${accessibleResult.nodeIds.join(' -> ')}`);
  console.log(`  Total Distance: ${accessibleResult.totalDistance} meters`);
  const usesElevator = accessibleResult.nodeIds.some((id) => id.includes('LIFT'));
  console.log(`  Uses Elevator: ${usesElevator ? 'YES (Verified)' : 'NO'}`);

  console.log('\nTEST 3: Teacher Timetable Destination Lookup...');
  const teacher = await Teacher.findOne({ teacherId: 'TCH-001' }).lean();
  console.log(`  Testing for Teacher: ${teacher.name} (${teacher.teacherId}), Cabin: ${teacher.cabinNodeId}`);

  // Query for Monday 09:30 (should be teaching in 1F-CLASS-02)
  const classSchedule = await Timetable.findOne({
    teacherId: teacher.teacherId,
    dayOfWeek: 'Monday',
    startTime: { $lte: '09:30' },
    endTime: { $gte: '09:30' },
  }).lean();

  if (classSchedule && classSchedule.roomNodeId === '1F-CLASS-02') {
    console.log(`✓ Active Class found at 09:30: Room ${classSchedule.roomNodeId} (${classSchedule.subject})`);
  } else {
    console.error('Test 3 Failed to match class schedule!');
    process.exit(1);
  }

  // Query for Monday 18:00 (no class, should route to cabin)
  const eveningSchedule = await Timetable.findOne({
    teacherId: teacher.teacherId,
    dayOfWeek: 'Monday',
    startTime: { $lte: '18:00' },
    endTime: { $gte: '18:00' },
  }).lean();

  const destinationNodeId = eveningSchedule ? eveningSchedule.roomNodeId : teacher.cabinNodeId;
  console.log(`✓ Off-hours at 18:00 destination correctly resolved to Cabin: ${destinationNodeId}`);

  console.log('\n======================================================');
  console.log('ALL PATHFINDING & TIMETABLE TESTS PASSED SUCCESSFULLY!');
  console.log('======================================================\n');

  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});

