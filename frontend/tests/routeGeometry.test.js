import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRouteSegmentBearing,
  getRouteSegmentPoints,
  getRouteTurnInstruction,
  interpolateRoutePosition,
  matchPositionToRoute,
  pointAlongPolyline,
} from '../src/utils/indoorNavigation.js';

const node = (nodeId, x, y, floor = 0) => ({ nodeId, name: nodeId, floor, coordinates: { x, y, z: floor * 3.9 } });

// Corridor node -> door -> room: the traced path is an L, not the diagonal.
const doorRoute = {
  path: [node('CORRIDOR', 0, 0), node('ROOM', 4, 3)],
  edges: [{
    edgeId: 'E', fromNode: 'CORRIDOR', toNode: 'ROOM', distance: 7, type: 'walking',
    geometry: { points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }] },
  }],
};

test('uses the traced edge geometry for a route segment', () => {
  assert.deepEqual(getRouteSegmentPoints(doorRoute, 0), [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }]);
});

test('reverses traced geometry when the edge is walked backwards', () => {
  const reversed = { path: [...doorRoute.path].reverse(), edges: doorRoute.edges };
  assert.deepEqual(getRouteSegmentPoints(reversed, 0), [{ x: 4, y: 3 }, { x: 4, y: 0 }, { x: 0, y: 0 }]);
});

test('falls back to the straight line without geometry or across floors', () => {
  const plain = { path: doorRoute.path, edges: [{ edgeId: 'E', distance: 5 }] };
  assert.deepEqual(getRouteSegmentPoints(plain, 0), [{ x: 0, y: 0 }, { x: 4, y: 3 }]);
  const stairs = { path: [node('A', 1, 1, 0), node('B', 1, 1, 1)], edges: [{ edgeId: 'S', distance: 10.6, type: 'stairs' }] };
  assert.deepEqual(getRouteSegmentPoints(stairs, 0), [{ x: 1, y: 1 }, { x: 1, y: 1 }]);
  assert.deepEqual(getRouteSegmentPoints({ path: [], edges: [] }, 0), []);
});

test('interpolates the walked position along the bend instead of through the wall', () => {
  const corner = interpolateRoutePosition(doorRoute, 0, 4);
  assert.ok(Math.abs(corner.x - 4) < 1e-9 && Math.abs(corner.y) < 1e-9);
  const inside = interpolateRoutePosition(doorRoute, 0, 5.5);
  assert.ok(Math.abs(inside.x - 4) < 1e-9 && Math.abs(inside.y - 1.5) < 1e-9);
  assert.equal(interpolateRoutePosition(doorRoute, 0, 99).progress, 1);
});

test('reports the walking bearing of the current piece of a segment', () => {
  assert.equal(getRouteSegmentBearing(doorRoute, 0, 1), 90);   // along +x
  assert.equal(getRouteSegmentBearing(doorRoute, 0, 6), 0);    // along +y
  assert.equal(pointAlongPolyline([{ x: 0, y: 0 }], 0.5).bearing, null);
});

test('map-matches a position to the nearest piece of the traced path', () => {
  const match = matchPositionToRoute({ floor: 0, x: 4.4, y: 2 }, doorRoute);
  assert.equal(match.segmentIndex, 0);
  assert.ok(Math.abs(match.x - 4) < 1e-9 && Math.abs(match.y - 2) < 1e-9);
  assert.ok(Math.abs(match.distance - 0.4) < 1e-9);
});

test('derives the junction turn from the geometry on both sides of a node', () => {
  const route = {
    path: [node('A', 0, 0), node('B', 5, 0), node('C', 5, 6)],
    edges: [
      { edgeId: 'AB', distance: 5, geometry: { points: [{ x: 0, y: 0 }, { x: 5, y: 0 }] } },
      // Leaves B heading on along +x before bending up to C.
      { edgeId: 'BC', distance: 8, geometry: { points: [{ x: 5, y: 0 }, { x: 7, y: 0 }, { x: 7, y: 6 }, { x: 5, y: 6 }] } },
    ],
  };
  assert.equal(getRouteTurnInstruction(route, 0).type, 'straight');
  const plain = { path: route.path, edges: [{ edgeId: 'AB', distance: 5 }, { edgeId: 'BC', distance: 6 }] };
  assert.equal(getRouteTurnInstruction(plain, 0).type, 'left');
});
