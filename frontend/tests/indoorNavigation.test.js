import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCompassHeading,
  getMapBearing,
  getRelativeBearing,
  getSegmentDistance,
  interpolateRoutePosition,
  StepDetector,
  validateRouteCheckpoint,
  advanceAlongRoute,
  matchPositionToRoute,
  solveAffineCalibration,
  transformMapToPlan,
  getRouteTurnInstruction,
} from '../src/utils/indoorNavigation.js';

test('normalizes iOS compass headings', () => {
  assert.equal(extractCompassHeading({ webkitCompassHeading: -10 }), 350);
});

test('calculates cardinal map bearings for east and north', () => {
  const origin = { coordinates: { x: 0, y: 0 } };
  assert.equal(getMapBearing(origin, { coordinates: { x: 1, y: 0 } }), 90);
  assert.equal(getMapBearing(origin, { coordinates: { x: 0, y: 1 } }), 0);
});

test('calculates left/right relative turn with calibrated map north', () => {
  assert.equal(getRelativeBearing(90, 0, 0), 90);
  assert.equal(getRelativeBearing(0, 90, 0), -90);
  assert.equal(getRelativeBearing(0, 30, 30), 0);
});

test('uses route edge distance and interpolates only on the same floor', () => {
  const route = {
    path: [
      { floor: 0, coordinates: { x: 0, y: 0 } },
      { floor: 0, coordinates: { x: 10, y: 0 } },
      { floor: 1, coordinates: { x: 10, y: 0 } },
    ],
    edges: [{ distance: 20 }, { distance: 5, type: 'stairs' }],
  };
  assert.equal(getSegmentDistance(route, 0), 20);
  assert.deepEqual(interpolateRoutePosition(route, 0, 5), {
    floor: 0, x: 2.5, y: 0, progress: 0.25, distanceRemaining: 15,
  });
  assert.equal(interpolateRoutePosition(route, 1, 1), null);
});

test('step detector rejects repeated peaks inside refractory interval', () => {
  const detector = new StepDetector();
  assert.equal(detector.push(1.5, 1000), true);
  assert.equal(detector.push(1.6, 1100), false);
  assert.equal(detector.push(0.1, 1200), false);
  assert.equal(detector.push(1.5, 1400), true);
});

test('requires the exact origin and destination landing for a floor transition', () => {
  const route = {
    path: [
      { nodeId: 'GF-STAIR-A', floor: 0 },
      { nodeId: '1F-STAIR-A', floor: 1 },
    ],
  };
  assert.deepEqual(
    validateRouteCheckpoint(route, 0, { nodeId: 'GF-STAIR-A', floor: 0 }, 0),
    { valid: true, floor: 0, stage: 'transition-origin' }
  );
  assert.equal(
    validateRouteCheckpoint(route, 0, { nodeId: '1F-STAIR-A', floor: 1 }, 0).valid,
    false,
    'destination landing must not be accepted before origin confirmation'
  );
  assert.deepEqual(
    validateRouteCheckpoint(route, 0, { nodeId: '1F-STAIR-A', floor: 1 }, 0, {
      originNodeId: 'GF-STAIR-A',
      destinationNodeId: '1F-STAIR-A',
    }),
    { valid: true, floor: 1, stage: 'transition-destination' }
  );
  assert.equal(validateRouteCheckpoint(route, 0, { nodeId: '1F-STAIR-B', floor: 1 }, 0).valid, false);
  assert.equal(
    validateRouteCheckpoint(route, 0, { nodeId: '1F-STAIR-A', floor: 2 }, 0, {
      originNodeId: 'GF-STAIR-A',
      destinationNodeId: '1F-STAIR-A',
    }).valid,
    false,
    'a mismatched floor number must be rejected'
  );
});

test('rejects unrelated or wrong-floor checkpoints during normal route navigation', () => {
  const route = { path: [{ nodeId: 'GF-A', floor: 0 }, { nodeId: 'GF-B', floor: 0 }] };
  assert.equal(validateRouteCheckpoint(route, 0, { nodeId: 'GF-B', floor: 0 }, 0).valid, true);
  assert.equal(validateRouteCheckpoint(route, 0, { nodeId: '1F-X', floor: 1 }, 0).valid, false);
});



test('advances PDR over consecutive same-floor edges and preserves overflow', () => {
  const route = {
    path: [
      { nodeId: 'A', floor: 0, coordinates: { x: 0, y: 0 } },
      { nodeId: 'B', floor: 0, coordinates: { x: 10, y: 0 } },
      { nodeId: 'C', floor: 0, coordinates: { x: 20, y: 0 } },
    ],
    edges: [{ distance: 2, type: 'walking' }, { distance: 3, type: 'walking' }],
  };
  assert.deepEqual(advanceAlongRoute(route, 0, 1.5, 2), {
    segmentIndex: 1, walkedMeters: 1.5, remainingMeters: 0,
    blockedByTransition: false, arrived: false,
  });
});

test('PDR stops before a stair edge and never increments the confirmed floor', () => {
  const route = {
    path: [
      { nodeId: 'A', floor: 0, coordinates: { x: 0, y: 0 } },
      { nodeId: 'B', floor: 0, coordinates: { x: 10, y: 0 } },
      { nodeId: 'C', floor: 1, coordinates: { x: 10, y: 0 } },
    ],
    edges: [{ distance: 2, type: 'walking' }, { distance: 7, type: 'stairs' }],
  };
  const result = advanceAlongRoute(route, 0, 1.5, 2);
  assert.equal(result.segmentIndex, 1);
  assert.equal(result.walkedMeters, 0);
  assert.equal(result.blockedByTransition, true);
});

test('map matching projects to the nearest route segment on the same floor', () => {
  const route = {
    path: [
      { nodeId: 'A', floor: 0, coordinates: { x: 0, y: 0 } },
      { nodeId: 'B', floor: 0, coordinates: { x: 10, y: 0 } },
      { nodeId: 'C', floor: 0, coordinates: { x: 10, y: 10 } },
    ],
    edges: [{ distance: 10 }, { distance: 10 }],
  };
  const match = matchPositionToRoute({ x: 6, y: 1, floor: 0 }, route, { maxDistance: 2 });
  assert.equal(match.segmentIndex, 0);
  assert.equal(match.x, 6);
  assert.equal(match.y, 0);
  assert.equal(match.distance, 1);
  assert.equal(matchPositionToRoute({ x: 6, y: 1, floor: 1 }, route), null);
});

test('affine calibration maps graph coordinates to normalized PDF coordinates', () => {
  const calibration = solveAffineCalibration([
    { mapX: 0, mapY: 0, pdfX: 0.1, pdfY: 0.2 },
    { mapX: 100, mapY: 0, pdfX: 0.9, pdfY: 0.2 },
    { mapX: 0, mapY: 100, pdfX: 0.1, pdfY: 0.8 },
    { mapX: 100, mapY: 100, pdfX: 0.9, pdfY: 0.8 },
  ]);
  const mapped = transformMapToPlan({ x: 50, y: 50 }, calibration);
  assert.ok(Math.abs(mapped.x - 0.5) < 1e-8);
  assert.ok(Math.abs(mapped.y - 0.5) < 1e-8);
  assert.ok(calibration.rmsError < 1e-8);
});

test('affine calibration rejects collinear control points', () => {
  assert.throws(() => solveAffineCalibration([
    { mapX: 0, mapY: 0, pdfX: 0, pdfY: 0 },
    { mapX: 1, mapY: 1, pdfX: 0.5, pdfY: 0.5 },
    { mapX: 2, mapY: 2, pdfX: 1, pdfY: 1 },
  ]), /collinear/i);
});


test('recovery QR on the confirmed floor is accepted as an off-route reroute origin', () => {
  const route = { path: [{ nodeId: 'GF-A', floor: 0 }, { nodeId: 'GF-B', floor: 0 }] };
  assert.deepEqual(
    validateRouteCheckpoint(route, 0, { nodeId: 'GF-C', floor: 0 }, 0),
    {
      valid: true,
      floor: 0,
      stage: 'off-route-checkpoint',
      reason: 'This checkpoint confirms that you left the planned route. A new route will be calculated from here.',
    }
  );
});

test('route geometry generates left, right and straight junction instructions', () => {
  const makeRoute = (coords) => ({
    path: coords.map(([x, y], index) => ({
      nodeId: String(index), name: `Node ${index}`, floor: 0, coordinates: { x, y },
    })),
  });
  assert.equal(getRouteTurnInstruction(makeRoute([[0, 0], [0, 10], [10, 10]]), 0).type, 'right');
  assert.equal(getRouteTurnInstruction(makeRoute([[0, 0], [0, 10], [-10, 10]]), 0).type, 'left');
  assert.equal(getRouteTurnInstruction(makeRoute([[0, 0], [0, 10], [0, 20]]), 0).type, 'straight');
});
