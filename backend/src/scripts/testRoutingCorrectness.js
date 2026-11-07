const test = require('node:test');
const assert = require('node:assert/strict');
const { findShortestPath, heuristic } = require('../algorithms/aStar');

function node(nodeId, floor, x, y) {
  return {
    nodeId,
    name: nodeId,
    floor,
    type: 'checkpoint',
    coordinates: { x, y, z: floor * 3.9 },
  };
}

function edge(edgeId, fromNode, toNode, distance, options = {}) {
  return {
    edgeId,
    fromNode,
    toNode,
    distance,
    accessible: options.accessible ?? true,
    type: options.type ?? 'walking',
    isBidirectional: options.isBidirectional ?? true,
    instruction: options.instruction ?? '',
    reverseInstruction: options.reverseInstruction ?? '',
  };
}

test('uses a zero heuristic until map coordinates are proven metric', () => {
  assert.equal(heuristic(node('A', 0, 0, 0), node('B', 1, 100, 100)), 0);
});

test('returns the minimum edge-distance route even when map coordinates are misleading', () => {
  const nodes = [
    node('START', 0, 0, 0),
    node('LONG-LEG', 0, 1, 0),
    node('SHORT-LEG', 0, 1000, 0),
    node('DEST', 0, 2, 0),
  ];
  const edges = [
    edge('E-START-LONG', 'START', 'LONG-LEG', 10),
    edge('E-LONG-DEST', 'LONG-LEG', 'DEST', 10),
    edge('E-START-SHORT', 'START', 'SHORT-LEG', 1),
    edge('E-SHORT-DEST', 'SHORT-LEG', 'DEST', 1),
  ];

  const result = findShortestPath('START', 'DEST', nodes, edges);
  assert.equal(result.success, true);
  assert.deepEqual(result.nodeIds, ['START', 'SHORT-LEG', 'DEST']);
  assert.equal(result.totalDistance, 2);
});

test('emits explicit origin and landing metadata for every floor transition', () => {
  const nodes = [
    node('GF-STAIR-A', 0, 42, 55),
    node('1F-STAIR-A', 1, 42, 55),
    node('1F-ROOM', 1, 50, 55),
  ];
  const edges = [
    edge('STAIR-A-GF-1F', 'GF-STAIR-A', '1F-STAIR-A', 7, { accessible: false, type: 'stairs' }),
    edge('WALK-1F-ROOM', '1F-STAIR-A', '1F-ROOM', 8),
  ];

  const result = findShortestPath('GF-STAIR-A', '1F-ROOM', nodes, edges);
  assert.equal(result.success, true);
  assert.deepEqual(result.transitions, [{
    edgeId: 'STAIR-A-GF-1F',
    type: 'stairs',
    fromNodeId: 'GF-STAIR-A',
    toNodeId: '1F-STAIR-A',
    fromFloor: 0,
    toFloor: 1,
  }]);
  assert.deepEqual(result.directions[1].transition, result.transitions[0]);
});

test('accessible routing excludes non-accessible stair edges', () => {
  const nodes = [
    node('GF-START', 0, 0, 0),
    node('1F-STAIRS', 1, 0, 0),
    node('GF-LIFT', 0, 1, 0),
    node('1F-LIFT', 1, 1, 0),
    node('1F-DEST', 1, 2, 0),
  ];
  const edges = [
    edge('STAIRS', 'GF-START', '1F-STAIRS', 1, { accessible: false, type: 'stairs' }),
    edge('WALK-TO-LIFT', 'GF-START', 'GF-LIFT', 2),
    edge('LIFT', 'GF-LIFT', '1F-LIFT', 2, { accessible: true, type: 'lift' }),
    edge('WALK-TO-DEST', '1F-LIFT', '1F-DEST', 2),
    edge('STAIRS-TO-DEST', '1F-STAIRS', '1F-DEST', 1, { accessible: false, type: 'stairs' }),
  ];

  const result = findShortestPath('GF-START', '1F-DEST', nodes, edges, { accessibleOnly: true });
  assert.equal(result.success, true);
  assert.deepEqual(result.nodeIds, ['GF-START', 'GF-LIFT', '1F-LIFT', '1F-DEST']);
  assert.ok(result.edges.every((item) => item.accessible));
});

test('returns a clear no-route result for disconnected nodes', () => {
  const nodes = [node('A', 0, 0, 0), node('B', 1, 10, 10)];
  const result = findShortestPath('A', 'B', nodes, []);
  assert.equal(result.success, false);
  assert.deepEqual(result.path, []);
});
