const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCampusSeedData, PLAN_FRAME, CORES, FLOOR_HEIGHT_M } = require('./buildCampusGraph');
const { auditCampusGraph } = require('../utils/campusGraphAudit');
const { validateEdgeGeometry } = require('../utils/floorGeometry');
const { findShortestPath } = require('../algorithms/aStar');
const { summarizeRouteDistanceQuality } = require('../utils/routeDistanceQuality');
const seedData = require('../data/seedData.json');
const legacySeedIds = require('../data/legacySeedIds.json');

const graph = buildCampusSeedData();
const nodeById = new Map(graph.nodes.map((node) => [node.nodeId, node]));
const prefix = (floor) => (floor === 0 ? 'GF' : `${floor}F`);

test('checked-in seedData.json matches the plan-traced graph builder', () => {
  assert.deepEqual(seedData, JSON.parse(JSON.stringify(graph)));
});

test('graph is one connected component with no audit findings', () => {
  const report = auditCampusGraph(graph);
  assert.equal(report.valid, true);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.warnings, []);
  assert.equal(report.summary.connectedComponents, 1);
  assert.equal(report.summary.unverifiedDistanceCount, 0);
  assert.equal(report.summary.planDerivedDistanceCount, graph.edges.length);
  assert.equal(report.summary.coordinateFrameId, PLAN_FRAME.id);
  for (let floor = 0; floor <= 7; floor += 1) {
    assert.ok(report.summary.floorCounts[floor] > 0, `floor ${floor} has nodes`);
  }
});

test('every node lies inside the plan frame at its floor elevation', () => {
  const { minX, minY, maxX, maxY } = PLAN_FRAME.extent;
  for (const node of graph.nodes) {
    const { x, y, z } = node.coordinates;
    assert.ok(x >= minX && x <= maxX && y >= minY && y <= maxY, `${node.nodeId} is inside the frame`);
    assert.ok(Math.abs(z - node.floor * FLOOR_HEIGHT_M) < 0.051, `${node.nodeId} elevation`);
    assert.equal(node.qrCode, `QR_${node.nodeId.replace(/-/g, '_')}`);
  }
});

test('same-floor edges carry plan geometry whose length is the edge distance', () => {
  for (const edge of graph.edges) {
    const from = nodeById.get(edge.fromNode);
    const to = nodeById.get(edge.toNode);
    assert.equal(edge.distanceEvidence.source, 'architectural_plan', edge.edgeId);
    if (from.floor !== to.floor) {
      assert.equal(edge.geometry, undefined, `${edge.edgeId} is a vertical transition`);
      continue;
    }
    const check = validateEdgeGeometry(edge.geometry, {
      distanceMeters: edge.distance,
      distanceEvidenceSource: edge.distanceEvidence.source,
    });
    assert.deepEqual(check.errors, [], edge.edgeId);
    assert.equal(edge.geometry.coordinateFrameId, PLAN_FRAME.id);
    assert.equal(edge.geometry.floor, from.floor);
    const first = edge.geometry.points[0];
    const last = edge.geometry.points[edge.geometry.points.length - 1];
    assert.deepEqual([first.x, first.y], [from.coordinates.x, from.coordinates.y], `${edge.edgeId} starts at its from node`);
    assert.deepEqual([last.x, last.y], [to.coordinates.x, to.coordinates.y], `${edge.edgeId} ends at its to node`);
    const straight = Math.hypot(to.coordinates.x - from.coordinates.x, to.coordinates.y - from.coordinates.y);
    assert.ok(edge.distance >= straight - 0.06, `${edge.edgeId} is not shorter than the straight line`);
  }
});

test('stairs and lifts are vertical: same plan position on every floor they serve', () => {
  for (const [key, core] of Object.entries(CORES)) {
    for (const floor of core.floors) {
      const node = nodeById.get(`${prefix(floor)}-${key}`);
      assert.ok(node, `${prefix(floor)}-${key} exists`);
      assert.deepEqual([node.coordinates.x, node.coordinates.y], core.xy);
    }
    const unserved = [0, 1, 2, 3, 4, 5, 6, 7].filter((floor) => !core.floors.includes(floor));
    for (const floor of unserved) {
      assert.equal(nodeById.has(`${prefix(floor)}-${key}`), false, `${key} does not reach floor ${floor}`);
    }
  }
  const vertical = graph.edges.filter((edge) => edge.type === 'stairs' || edge.type === 'lift');
  for (const edge of vertical) {
    assert.equal(Math.abs(nodeById.get(edge.fromNode).floor - nodeById.get(edge.toNode).floor), 1);
    assert.ok(edge.distance >= FLOOR_HEIGHT_M, `${edge.edgeId} is at least one storey long`);
    assert.equal(edge.accessible, edge.type === 'lift');
  }
});

test('routes from the main entrance reach the upper floors', () => {
  const seminar = findShortestPath('GF-MAIN-ENTRANCE', '6F-SEMINAR-HALL', graph.nodes, graph.edges);
  assert.equal(seminar.success, true);
  assert.deepEqual(seminar.floorsCovered, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(summarizeRouteDistanceQuality(seminar.edges).status, 'plan_derived');

  const accessible = findShortestPath('GF-MAIN-ENTRANCE', '7F-OPEN-TERRACE', graph.nodes, graph.edges, { accessibleOnly: true });
  assert.equal(accessible.success, true);
  assert.ok(accessible.edges.every((edge) => edge.accessible && edge.type !== 'stairs'));
  assert.ok(accessible.nodeIds.includes('GF-RAMP'), 'accessible entry uses the ramp');
  assert.ok(accessible.nodeIds.includes('7F-LIFT-2'), 'only Lift 2 reaches the 7th floor');

  const classroom = findShortestPath('GF-MAIN-ENTRANCE', '1F-CLASS-02', graph.nodes, graph.edges);
  assert.equal(classroom.success, true);
  assert.deepEqual(classroom.floorsCovered, [0, 1]);
});

test('faculty cabins and timetable rooms reference existing nodes', () => {
  for (const teacher of graph.teachers) assert.ok(nodeById.has(teacher.cabinNodeId), teacher.teacherId);
  for (const entry of graph.timetables) assert.ok(nodeById.has(entry.roomNodeId), entry.roomNodeId);
});

test('retired schematic seed identifiers are not part of the current graph', () => {
  const edgeIds = new Set(graph.edges.map((edge) => edge.edgeId));
  assert.ok(legacySeedIds.nodeIds.length > 0);
  for (const nodeId of legacySeedIds.nodeIds) assert.equal(nodeById.has(nodeId), false, nodeId);
  for (const edgeId of legacySeedIds.edgeIds) assert.equal(edgeIds.has(edgeId), false, edgeId);
});
