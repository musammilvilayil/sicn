const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Node = require('../models/Node');
const Edge = require('../models/Edge');
const Teacher = require('../models/Teacher');
const Timetable = require('../models/Timetable');
const FloorCalibration = require('../models/FloorCalibration');
const LEGACY_SEED_IDS = require('../data/legacySeedIds.json');
const { syncSeedDataFile } = require('./buildCampusGraph');
const { findShortestPath } = require('../algorithms/aStar');

dotenv.config({ path: path.join(__dirname, '../../.env') });

/**
 * Validates spatial graph, teacher cabin references, and timetable room
 * references before writing to MongoDB.
 */
function validateCampusSeedData(seedData) {
  if (!seedData || !Array.isArray(seedData.nodes) || !Array.isArray(seedData.edges)) {
    throw new Error('Invalid seed payload: nodes and edges arrays are required.');
  }
  if (!Array.isArray(seedData.teachers) || !Array.isArray(seedData.timetables)) {
    throw new Error('Invalid seed payload: teachers and timetables arrays are required.');
  }

  const nodeIdSet = new Set();
  for (const node of seedData.nodes) {
    const id = String(node.nodeId || '').trim().toUpperCase();
    if (!id) throw new Error('Seed validation failed: node missing nodeId.');
    if (nodeIdSet.has(id)) throw new Error(`Seed validation failed: duplicate nodeId "${id}".`);
    if (typeof node.floor !== 'number' || node.floor < 0 || node.floor > 7) {
      throw new Error(`Seed validation failed: node "${id}" has out-of-range floor "${node.floor}".`);
    }
    nodeIdSet.add(id);
  }

  const edgeIdSet = new Set();
  for (const edge of seedData.edges) {
    const id = String(edge.edgeId || '').trim();
    const from = String(edge.fromNode || '').trim().toUpperCase();
    const to = String(edge.toNode || '').trim().toUpperCase();
    if (!id) throw new Error('Seed validation failed: edge missing edgeId.');
    if (edgeIdSet.has(id)) throw new Error(`Seed validation failed: duplicate edgeId "${id}".`);
    if (!nodeIdSet.has(from) || !nodeIdSet.has(to)) {
      throw new Error(`Seed validation failed: edge "${id}" references missing node (${from} -> ${to}).`);
    }
    edgeIdSet.add(id);
  }

  const teacherIdSet = new Set();
  for (const teacher of seedData.teachers) {
    const id = String(teacher.teacherId || '').trim().toUpperCase();
    const cabin = String(teacher.cabinNodeId || '').trim().toUpperCase();
    if (!id) throw new Error('Seed validation failed: teacher missing teacherId.');
    if (teacherIdSet.has(id)) throw new Error(`Seed validation failed: duplicate teacherId "${id}".`);
    if (!nodeIdSet.has(cabin)) {
      throw new Error(`Seed validation failed: teacher "${id}" references missing cabinNodeId "${cabin}".`);
    }
    teacherIdSet.add(id);
  }

  for (const entry of seedData.timetables) {
    const teacherId = String(entry.teacherId || '').trim().toUpperCase();
    const roomNodeId = String(entry.roomNodeId || '').trim().toUpperCase();
    if (!teacherIdSet.has(teacherId)) {
      throw new Error(`Seed validation failed: timetable references unknown teacherId "${teacherId}".`);
    }
    if (!nodeIdSet.has(roomNodeId)) {
      throw new Error(`Seed validation failed: timetable references unknown roomNodeId "${roomNodeId}".`);
    }
  }
}

async function supportsTransactions() {
  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    return Boolean(hello && (hello.setName || hello.msg === 'isdbgrid'));
  } catch {
    return false;
  }
}

/**
 * Idempotently upserts the campus graph (Nodes, Edges, Teachers, Timetables)
 * without ever touching User or Admin accounts. Uses a MongoDB transaction
 * when connected to a replica set/mongos, and ordered bulkWrite operations
 * on standalone instances.
 */
async function upsertCampusGraph(seedData, { pruneStale = false } = {}) {
  validateCampusSeedData(seedData);

  const runBulkSync = async (session = null) => {
    const opts = session ? { ordered: true, session } : { ordered: true };
    const queryOpts = session ? { session } : {};

    // Clear stale qrCode bindings if a QR code moved to a new canonical nodeId
    const qrRebindOps = seedData.nodes
      .filter((n) => n.qrCode)
      .map((n) => ({
        updateMany: {
          filter: {
            qrCode: String(n.qrCode).trim(),
            nodeId: { $ne: String(n.nodeId).trim().toUpperCase() },
          },
          update: { $unset: { qrCode: 1 } },
        },
      }));
    if (qrRebindOps.length > 0) {
      await Node.bulkWrite(qrRebindOps, opts);
    }

    const normalizedNodes = seedData.nodes.map((n) => ({
      ...n,
      nodeId: String(n.nodeId).trim().toUpperCase(),
    }));
    await Node.bulkWrite(
      normalizedNodes.map((n) => ({
        updateOne: {
          filter: { nodeId: n.nodeId },
          update: { $set: n },
          upsert: true,
        },
      })),
      opts
    );

    const normalizedEdges = seedData.edges.map((e) => ({
      ...e,
      edgeId: String(e.edgeId).trim(),
      fromNode: String(e.fromNode).trim().toUpperCase(),
      toNode: String(e.toNode).trim().toUpperCase(),
    }));
    await Edge.bulkWrite(
      normalizedEdges.map((e) => ({
        updateOne: {
          filter: { edgeId: e.edgeId },
          update: { $set: e },
          upsert: true,
        },
      })),
      opts
    );

    const normalizedTeachers = seedData.teachers.map((t) => ({
      ...t,
      teacherId: String(t.teacherId).trim().toUpperCase(),
      cabinNodeId: String(t.cabinNodeId).trim().toUpperCase(),
      email: String(t.email).trim().toLowerCase(),
    }));
    await Teacher.bulkWrite(
      normalizedTeachers.map((t) => ({
        updateOne: {
          filter: { teacherId: t.teacherId },
          update: { $set: t },
          upsert: true,
        },
      })),
      opts
    );

    const normalizedTimetables = seedData.timetables.map((tt) => ({
      ...tt,
      teacherId: String(tt.teacherId).trim().toUpperCase(),
      roomNodeId: String(tt.roomNodeId).trim().toUpperCase(),
      startTime: String(tt.startTime).trim(),
      endTime: String(tt.endTime).trim(),
    }));
    await Timetable.bulkWrite(
      normalizedTimetables.map((tt) => ({
        updateOne: {
          filter: {
            teacherId: tt.teacherId,
            dayOfWeek: tt.dayOfWeek,
            startTime: tt.startTime,
          },
          update: { $set: tt },
          upsert: true,
        },
      })),
      opts
    );

    // The plan-traced graph replaced the old schematic seed graph. Remove the
    // retired seed records (and only those) so 0–100 schematic nodes never mix
    // with nodes positioned in plan metres. Admin-created records are untouched.
    const keepNodeIds = new Set(normalizedNodes.map((n) => n.nodeId));
    const keepEdgeIds = new Set(normalizedEdges.map((e) => e.edgeId));
    const retiredNodeIds = LEGACY_SEED_IDS.nodeIds.filter((id) => !keepNodeIds.has(id));
    const retiredEdgeIds = LEGACY_SEED_IDS.edgeIds.filter((id) => !keepEdgeIds.has(id));
    if (retiredNodeIds.length || retiredEdgeIds.length) {
      await Edge.deleteMany(
        {
          $or: [
            { edgeId: { $in: retiredEdgeIds } },
            { fromNode: { $in: retiredNodeIds } },
            { toNode: { $in: retiredNodeIds } },
          ],
        },
        queryOpts
      );
      await Node.deleteMany({ nodeId: { $in: retiredNodeIds } }, queryOpts);
    }
    // A PDF registration is only valid for the node positions it was fitted to.
    // Drop registrations whose control points no longer match the seed nodes
    // (for example ones saved against the old schematic 0–100 coordinates).
    const coordinatesById = new Map(normalizedNodes.map((n) => [n.nodeId, n.coordinates]));
    const retiredNodeIdSet = new Set(retiredNodeIds);
    const calibrations = await FloorCalibration.find({}, null, queryOpts).lean();
    const staleCalibrationIds = calibrations
      .filter((calibration) => (calibration.controlPoints || []).some((point) => {
        if (retiredNodeIdSet.has(point.nodeId)) return true;
        const current = coordinatesById.get(point.nodeId);
        return current && (Math.abs(current.x - point.mapX) > 0.01 || Math.abs(current.y - point.mapY) > 0.01);
      }))
      .map((calibration) => calibration._id);
    if (staleCalibrationIds.length) {
      await FloorCalibration.deleteMany({ _id: { $in: staleCalibrationIds } }, queryOpts);
    }

    if (pruneStale) {
      await Promise.all([
        Node.deleteMany({ nodeId: { $nin: normalizedNodes.map((n) => n.nodeId) } }, queryOpts),
        Edge.deleteMany({ edgeId: { $nin: normalizedEdges.map((e) => e.edgeId) } }, queryOpts),
        Teacher.deleteMany(
          { teacherId: { $nin: normalizedTeachers.map((t) => t.teacherId) } },
          queryOpts
        ),
        Timetable.deleteMany(
          {
            $nor: normalizedTimetables.map((tt) => ({
              teacherId: tt.teacherId,
              dayOfWeek: tt.dayOfWeek,
              startTime: tt.startTime,
            })),
          },
          queryOpts
        ),
      ]);
    }
  };

  if (await supportsTransactions()) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await runBulkSync(session);
      });
    } finally {
      await session.endSession();
    }
  } else {
    await runBulkSync(null);
  }

  const [nodes, edges, teachersCount, timetablesCount] = await Promise.all([
    Node.find().lean(),
    Edge.find().lean(),
    Teacher.countDocuments(),
    Timetable.countDocuments(),
  ]);

  return {
    nodes,
    edges,
    nodesCount: nodes.length,
    edgesCount: edges.length,
    teachersCount,
    timetablesCount,
  };
}

/**
 * Synchronizes the 8-floor (Ground through 7th Floor) campus graph, faculty,
 * and timetable collections idempotently. Never creates demo users and never
 * modifies or deletes existing User / Admin credentials.
 */
const seedDatabase = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI must be configured before seeding.');
    }

    // 1. Build & validate complete 8-floor (GF through 7F) campus spatial graph into seedData.json
    const seedData = syncSeedDataFile();
    console.log(
      `Synchronized seedData.json: ${seedData.nodes.length} nodes & ${seedData.edges.length} edges across Floors 0–7.`
    );

    await mongoose.connect(mongoUri);
    console.log(`Connected to MongoDB at ${mongoose.connection.host}`);

    const summary = await upsertCampusGraph(seedData);

    console.log(`Synchronized ${summary.nodesCount} Nodes across Ground through 7th Floor:`);
    for (let f = 0; f <= 7; f++) {
      const count = summary.nodes.filter((n) => n.floor === f).length;
      console.log(`  • ${f === 0 ? 'Ground Floor (0)' : `Floor ${f} (${f}F)`}: ${count} nodes`);
    }

    const interFloorCount = summary.edges.filter(
      (e) => e.type === 'stairs' || e.type === 'lift'
    ).length;
    console.log(
      `Synchronized ${summary.edgesCount} Edges (${interFloorCount} sequential vertical stair/lift shaft links).`
    );
    console.log(`Synchronized ${summary.teachersCount} teachers.`);
    console.log(`Synchronized ${summary.timetablesCount} timetable entries.`);

    // 2. Verify continuous multi-floor A* routing from Ground Floor to 6th & 7th Floors
    const seminarRoute = findShortestPath(
      'GF-MAIN-ENTRANCE',
      '6F-SEMINAR-HALL',
      summary.nodes,
      summary.edges
    );
    const rooftopAccessibleRoute = findShortestPath(
      'GF-MAIN-ENTRANCE',
      '7F-OPEN-TERRACE',
      summary.nodes,
      summary.edges,
      { accessibleOnly: true }
    );

    if (!seminarRoute.success || !rooftopAccessibleRoute.success) {
      throw new Error('Multi-floor A* pathfinding verification failed after seeding.');
    }

    console.log(
      `Verified A* Route [GF -> 6F Seminar Hall]: ${seminarRoute.totalDistance}m via floors [${seminarRoute.floorsCovered.join(' -> ')}]`
    );
    console.log(
      `Verified Accessible A* Route [GF -> 7F Open Terrace]: ${rooftopAccessibleRoute.totalDistance}m via [${rooftopAccessibleRoute.nodeIds.join(' -> ')}]`
    );
    console.log(
      'Campus data synchronization completed. User and administrator accounts were preserved (admin provisioning runs at server startup).'
    );
  } catch (error) {
    console.error('Database seeding stopped:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
};

if (require.main === module) seedDatabase();

module.exports = {
  seedDatabase,
  upsertCampusGraph,
  validateCampusSeedData,
};
