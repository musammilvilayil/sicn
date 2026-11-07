import test from 'node:test';
import assert from 'node:assert/strict';
import { FLOOR_PLANS } from '../src/config/floorPlans.js';

test('provides an architectural source drawing for every floor GF through 7F', () => {
  assert.deepEqual(Object.keys(FLOOR_PLANS).map(Number), [0, 1, 2, 3, 4, 5, 6, 7]);
  for (const floor of Object.keys(FLOOR_PLANS)) {
    assert.match(FLOOR_PLANS[floor].url, /^\/floorplans\/.+\.pdf$/);
    assert.match(FLOOR_PLANS[floor].sourceName, /\.pdf$/i);
  }
});

test('maps paired upper floors to their shared source drawing sheets', () => {
  assert.equal(FLOOR_PLANS[2].url, FLOOR_PLANS[3].url);
  assert.equal(FLOOR_PLANS[4].url, FLOOR_PLANS[5].url);
  assert.equal(FLOOR_PLANS[6].url, FLOOR_PLANS[7].url);
  assert.equal(new Set(Object.values(FLOOR_PLANS).map((plan) => plan.url)).size, 5);
});
