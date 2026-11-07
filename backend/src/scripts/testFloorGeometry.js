const test = require('node:test');
const assert = require('node:assert/strict');
const { measurePolyline, validateEdgeGeometry } = require('../utils/floorGeometry');

const baseGeometry = {
  kind: 'corridor_centerline',
  coordinateSystem: 'local_metric_m',
  coordinateFrameId: 'GF-PDF-PAGE-1-LOCAL-METRIC-V1',
  floor: 0,
  sourceRef: 'floorplan/BJI_BUILDING PLAN 01 GF MAIN BLOCK_04022026.pdf#page=1',
  points: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }],
  verification: { status: 'reviewed' },
};

test('measures a bent corridor centreline by segment lengths, not endpoint chord', () => {
  assert.equal(measurePolyline(baseGeometry.points), 7);
});

test('accepts a reviewed metric corridor path when edge distance matches its polyline', () => {
  const result = validateEdgeGeometry(baseGeometry, { distanceMeters: 7, distanceEvidenceSource: 'architectural_plan' });
  assert.equal(result.valid, true);
  assert.equal(result.lengthMeters, 7);
});

test('rejects geometry that mixes schematic coordinates with metres', () => {
  const result = validateEdgeGeometry({ ...baseGeometry, coordinateSystem: 'schematic_0_100' }, { distanceMeters: 7 });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((message) => message.includes('local_metric_m')));
});

test('rejects a straight-line distance that ignores corridor bends', () => {
  const result = validateEdgeGeometry(baseGeometry, { distanceMeters: 5, distanceEvidenceSource: 'architectural_plan' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((message) => message.includes('Polyline length')));
});

test('requires field evidence and operator identity for field-verified geometry', () => {
  const geometry = {
    ...baseGeometry,
    verification: { status: 'field_verified', verifiedAt: '2026-11-08T10:00:00.000Z', verifiedBy: 'site-surveyor' },
  };
  assert.equal(validateEdgeGeometry(geometry, { distanceMeters: 7, distanceEvidenceSource: 'admin_estimate' }).valid, false);
  assert.equal(validateEdgeGeometry(geometry, { distanceMeters: 7, distanceEvidenceSource: 'field_measured' }).valid, true);
});

test('rejects invalid points and unsupported geometry kinds', () => {
  const result = validateEdgeGeometry({ ...baseGeometry, kind: 'wall_guess', points: [{ x: 0, y: 0 }] });
  assert.equal(result.valid, false);
  assert.ok(result.errors.length >= 2);
});

test('supports explicit door and room-entry connector geometry', () => {
  for (const kind of ['door_connector', 'room_entry_connector']) {
    const result = validateEdgeGeometry({ ...baseGeometry, kind }, { distanceMeters: 7 });
    assert.equal(result.valid, true);
  }
});
