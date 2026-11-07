const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeRouteDistanceQuality } = require('../utils/routeDistanceQuality');

test('marks a route as verified only when every edge has plan or field evidence', () => {
  const result = summarizeRouteDistanceQuality([
    { distanceEvidence: { source: 'field_measured' } },
    { distanceEvidence: { source: 'architectural_plan' } },
  ]);
  assert.equal(result.status, 'verified');
  assert.equal(result.verifiedEdgeCount, 2);
  assert.equal(result.unverifiedEdgeCount, 0);
});

test('marks admin estimates as approximate', () => {
  const result = summarizeRouteDistanceQuality([
    { distanceEvidence: { source: 'field_measured' } },
    { distanceEvidence: { source: 'admin_estimate' } },
  ]);
  assert.equal(result.status, 'estimated');
  assert.equal(result.estimatedEdgeCount, 1);
});

test('marks legacy routes with missing evidence as provisional', () => {
  const result = summarizeRouteDistanceQuality([
    { distanceEvidence: { source: 'field_measured' } },
    {},
  ]);
  assert.equal(result.status, 'unverified');
  assert.equal(result.unverifiedEdgeCount, 1);
  assert.match(result.message, /provisional/);
});

test('handles a route with no edges', () => {
  assert.equal(summarizeRouteDistanceQuality([]).status, 'not_applicable');
});
