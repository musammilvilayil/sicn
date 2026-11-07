import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCompassHeading,
  getMapBearing,
  getRelativeBearing,
  getSegmentDistance,
  interpolateRoutePosition,
  StepDetector,
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
