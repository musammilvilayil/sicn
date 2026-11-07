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
});

test('rejects unrelated or wrong-floor checkpoints during normal route navigation', () => {
  const route = { path: [{ nodeId: 'GF-A', floor: 0 }, { nodeId: 'GF-B', floor: 0 }] };
  assert.equal(validateRouteCheckpoint(route, 0, { nodeId: 'GF-B', floor: 0 }, 0).valid, true);
  assert.equal(validateRouteCheckpoint(route, 0, { nodeId: '1F-X', floor: 1 }, 0).valid, false);
});

test('requires origin QR before destination QR and verifies both landing floors', () => {
  const route = {
    path: [
      { nodeId: 'GF-STAIR-A', floor: 0 },
      { nodeId: '1F-STAIR-A', floor: 1 },
    ],
  };
  const destination = { nodeId: '1F-STAIR-A', floor: 1 };
  assert.equal(validateRouteCheckpoint(route, 0, destination, 0).valid, false);
  const origin = validateRouteCheckpoint(route, 0, { nodeId: 'GF-STAIR-A', floor: 0 }, 0);
  assert.equal(origin.stage, 'transition-origin');
  assert.deepEqual(
    validateRouteCheckpoint(route, 0, destination, 0, {
      originNodeId: 'GF-STAIR-A',
      destinationNodeId: '1F-STAIR-A',
    }),
    { valid: true, floor: 1, stage: 'transition-destination' }
  );
  assert.equal(
    validateRouteCheckpoint(route, 0, { nodeId: '1F-STAIR-A', floor: 2 }, 0, {
      originNodeId: 'GF-STAIR-A',
      destinationNodeId: '1F-STAIR-A',
    }).valid,
    false
  );
});
