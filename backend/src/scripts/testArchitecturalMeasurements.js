const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArchitecturalMeasurement } = require('../utils/architecturalMeasurements');
const { auditCampusGraph } = require('../utils/campusGraphAudit');

test('converts explicit centimetre room dimensions to metres and area', () => {
  const result = parseArchitecturalMeasurement('905x1230 cm');
  assert.equal(result.kind, 'footprint');
  assert.deepEqual(result.measurements[0].dimensionsMeters, [9.05, 12.3]);
  assert.equal(result.measurements[0].areaSquareMeters, 111.315);
});

test('parses linear widths written in metres or centimetres', () => {
  assert.equal(parseArchitecturalMeasurement('2.76m wide passage').measurements[0].meters, 2.76);
  assert.equal(parseArchitecturalMeasurement('Width 246 cm').measurements[0].meters, 2.46);
});

test('parses compound room footprints and sums their areas', () => {
  const result = parseArchitecturalMeasurement('400x600 cm + 276x288 cm');
  assert.equal(result.kind, 'compound_footprint');
  assert.equal(result.measurements.length, 2);
  assert.equal(result.totalAreaSquareMeters, 31.9488);
});

test('handles counted compound dimensions used by architectural schedules', () => {
  const result = parseArchitecturalMeasurement('5x 155x135 cm + 260x142 cm');
  assert.equal(result.kind, 'compound_footprint');
  assert.equal(result.measurements.length, 2);
  assert.deepEqual(result.measurements[0].dimensionsMeters, [1.55, 1.35]);
});

test('does not silently assume units for unlabelled dimensions', () => {
  const result = parseArchitecturalMeasurement('876x1203');
  assert.equal(result.kind, 'unparsed');
  assert.equal(result.measurements.length, 0);
  assert.ok(result.warnings.length > 0);
});

test('graph audit identifies distances without measurement provenance', () => {
  const graph = {
    nodes: [
      { nodeId: 'A', floor: 0, coordinates: { x: 1, y: 2, z: 0 }, metadata: { dimensions: '905x1230 cm' } },
      { nodeId: 'B', floor: 0, coordinates: { x: 2, y: 2, z: 0 }, metadata: {} },
    ],
    edges: [{ edgeId: 'AB', fromNode: 'A', toNode: 'B', distance: 10, type: 'walking', isBidirectional: true }],
  };
  const report = auditCampusGraph(graph);
  assert.equal(report.valid, true);
  assert.equal(report.summary.unverifiedDistanceCount, 1);
  assert.ok(report.warnings.some((warning) => warning.code === 'UNVERIFIED_EDGE_DISTANCE'));
  assert.equal(report.measurementSummary.parsed, 1);
});

test('graph audit rejects dangling edges and non-adjacent floor transitions', () => {
  const graph = {
    nodes: [
      { nodeId: 'A', floor: 0, coordinates: { x: 1, y: 2, z: 0 } },
      { nodeId: 'B', floor: 2, coordinates: { x: 1, y: 2, z: 7.8 } },
    ],
    edges: [
      { edgeId: 'AB', fromNode: 'A', toNode: 'B', distance: 7, type: 'stairs', isBidirectional: true },
      { edgeId: 'MISSING', fromNode: 'A', toNode: 'C', distance: 1, type: 'walking', isBidirectional: true },
    ],
  };
  const report = auditCampusGraph(graph);
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((error) => error.code === 'INVALID_VERTICAL_TRANSITION'));
  assert.ok(report.errors.some((error) => error.code === 'DANGLING_EDGE'));
});
