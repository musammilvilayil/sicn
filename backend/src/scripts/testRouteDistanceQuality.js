const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeRouteDistanceQuality } = require('../utils/routeDistanceQuality');

test('distinguishes plan-derived geometry from field-measured distances', () => {
  const result = summarizeRouteDistanceQuality([
    { distanceEvidence: { source: 'field_measured' } },
    { distanceEvidence: { source: 'architectural_plan' } },
  ]);
  assert.equal(result.status, 'plan_derived');
  assert.equal(result.verifiedEdgeCount, 2);
  assert.equal(result.fieldVerifiedEdgeCount, 1);
  assert.equal(result.planDerivedEdgeCount, 1);
  assert.match(result.message, /not physically measured on site/);
});

test('marks a route field-verified only when every edge was physically measured', () => {
  const result = summarizeRouteDistanceQuality([{ distanceEvidence: { source: 'field_measured' } }]);
  assert.equal(result.status, 'field_verified');
  assert.equal(result.fieldVerifiedEdgeCount, 1);
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
  const result = summarizeRouteDistanceQuality([{ distanceEvidence: { source: 'field_measured' } }, {}]);
  assert.equal(result.status, 'unverified');
  assert.equal(result.unverifiedEdgeCount, 1);
  assert.match(result.message, /provisional/);
});

test('handles a route with no edges', () => {
  assert.equal(summarizeRouteDistanceQuality([]).status, 'not_applicable');
});
