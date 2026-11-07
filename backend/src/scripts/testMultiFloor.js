const assert = require('assert');

const BASE_URL = process.env.API_URL || 'http://localhost:5000/api';

async function postJson(endpoint, payload) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on ${endpoint}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function getJson(endpoint) {
  const res = await fetch(`${BASE_URL}${endpoint}`);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on ${endpoint}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function runTests() {
  console.log('=== Verifying 8-Floor (GF–7F) Spatial Graph & Live A* API ===\n');

  // 1. Verify all 8 floors exist in MongoDB via GET /api/nodes
  const nodes = await getJson('/nodes');
  const edges = await getJson('/navigation/edges');
  console.log(`Loaded ${nodes.length} nodes & ${edges.length} edges from live API.`);
  assert(nodes.length >= 133, `Expected >= 133 nodes, got ${nodes.length}`);
  assert(edges.length >= 154, `Expected >= 154 edges, got ${edges.length}`);

  for (let floor = 0; floor <= 7; floor++) {
    const floorNodes = nodes.filter((n) => n.floor === floor);
    assert(floorNodes.length > 0, `Floor ${floor} has zero nodes!`);
    console.log(
      `  ✓ Floor ${floor === 0 ? 'GF (0)' : `${floor}F (${floor})`}: ${floorNodes.length} nodes`
    );
  }

  // 2. Verify sequential Staircase A route GF -> 7F
  const stairARoute = await postJson('/navigation/route', {
    startNodeId: 'GF-STAIR-A',
    destinationNodeId: '7F-STAIR-A',
    accessibleOnly: false,
  });
  assert.deepStrictEqual(stairARoute.floorsCovered, [0, 1, 2, 3, 4, 5, 6, 7]);
  console.log(
    `\n✓ Sequential Staircase A [GF -> 7F]: ${stairARoute.totalDistance}m | Path: ${stairARoute.nodeIds.join(' -> ')}`
  );

  // 3. Verify sequential Staircase B route GF -> 7F
  const stairBRoute = await postJson('/navigation/route', {
    startNodeId: 'GF-STAIR-B',
    destinationNodeId: '7F-STAIR-B',
    accessibleOnly: false,
  });
  assert.deepStrictEqual(stairBRoute.floorsCovered, [0, 1, 2, 3, 4, 5, 6, 7]);
  console.log(
    `✓ Sequential Staircase B [GF -> 7F]: ${stairBRoute.totalDistance}m | Path: ${stairBRoute.nodeIds.join(' -> ')}`
  );

  // 4. Verify Wheelchair-Accessible route GF Entrance -> 7F Rooftop Terrace (Lift 1)
  const lift1Route = await postJson('/navigation/route', {
    startNodeId: 'GF-MAIN-ENTRANCE',
    destinationNodeId: '7F-TERRACE-CENTRAL',
    accessibleOnly: true,
  });
  assert.deepStrictEqual(lift1Route.floorsCovered, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert(
    lift1Route.nodeIds.every((id) => !id.includes('STAIR')),
    'Accessible route must not use stairs!'
  );
  console.log(
    `✓ Accessible Lift 1 Route [GF Entrance -> 7F Central Terrace]: ${lift1Route.totalDistance}m (${lift1Route.estimatedTimeMinutes} min) | Path: ${lift1Route.nodeIds.join(' -> ')}`
  );

  // 5. Verify East Wing route GF Drawing Hall -> 5F Open Terrace (Lift 2)
  const lift2Route = await postJson('/navigation/route', {
    startNodeId: 'GF-DRAWING-HALL',
    destinationNodeId: '5F-OPEN-TERRACE',
    accessibleOnly: true,
  });
  assert.deepStrictEqual(lift2Route.floorsCovered, [0, 1, 2, 3, 4, 5]);
  console.log(
    `✓ East Wing Lift 2 Route [GF Drawing Hall -> 5F Open Terrace]: ${lift2Route.totalDistance}m | Path: ${lift2Route.nodeIds.join(' -> ')}`
  );

  // 6. Verify 1F Class 02 -> 6F Main Seminar Hall
  const seminarRoute = await postJson('/navigation/route', {
    startNodeId: '1F-CLASS-02',
    destinationNodeId: '6F-SEMINAR-HALL',
    accessibleOnly: false,
  });
  assert.deepStrictEqual(seminarRoute.floorsCovered, [1, 2, 3, 4, 5, 6]);
  console.log(
    `✓ Academic Multi-Floor Route [1F Class 02 -> 6F Seminar Hall]: ${seminarRoute.totalDistance}m | Floors: [${seminarRoute.floorsCovered.join(', ')}]`
  );

  // 7. Verify Mid-Building Route 2F Classroom 201 -> 4F Sick Room
  const midRoute = await postJson('/navigation/route', {
    startNodeId: '2F-CLASS-201',
    destinationNodeId: '4F-SICK-ROOM',
    accessibleOnly: false,
  });
  assert.deepStrictEqual(midRoute.floorsCovered, [2, 3, 4]);
  console.log(
    `✓ Mid-Floor Route [2F Classroom 201 -> 4F Sick Room]: ${midRoute.totalDistance}m | Path: ${midRoute.nodeIds.join(' -> ')}`
  );

  console.log('\nALL MULTI-FLOOR (GF–7F) GRAPH & A* ROUTING CHECKS PASSED!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
