const test = require('node:test');
const assert = require('node:assert/strict');
const { solveAffineCalibration } = require('../utils/floorCalibration');

test('solves a normalized map-to-PDF affine transform from four points', () => {
  const result = solveAffineCalibration([
    { nodeId: 'A', mapX: 0, mapY: 0, pdfX: 0.1, pdfY: 0.2 },
    { nodeId: 'B', mapX: 100, mapY: 0, pdfX: 0.9, pdfY: 0.2 },
    { nodeId: 'C', mapX: 0, mapY: 100, pdfX: 0.1, pdfY: 0.8 },
    { nodeId: 'D', mapX: 100, mapY: 100, pdfX: 0.9, pdfY: 0.8 },
  ]);
  assert.ok(Math.abs(result.xCoefficients[0] - 0.008) < 1e-10);
  assert.ok(Math.abs(result.yCoefficients[1] - 0.006) < 1e-10);
  assert.ok(result.rmsError < 1e-10);
});

test('rejects collinear control points', () => {
  assert.throws(() => solveAffineCalibration([
    { nodeId: 'A', mapX: 0, mapY: 0, pdfX: 0, pdfY: 0 },
    { nodeId: 'B', mapX: 1, mapY: 1, pdfX: 0.5, pdfY: 0.5 },
    { nodeId: 'C', mapX: 2, mapY: 2, pdfX: 1, pdfY: 1 },
  ]), /collinear/i);
});

test('rejects invalid PDF normalized coordinates', () => {
  assert.throws(() => solveAffineCalibration([
    { nodeId: 'A', mapX: 0, mapY: 0, pdfX: 0, pdfY: 0 },
    { nodeId: 'B', mapX: 1, mapY: 0, pdfX: 1.2, pdfY: 0 },
    { nodeId: 'C', mapX: 0, mapY: 1, pdfX: 0, pdfY: 1 },
  ]), /normalized/i);
});
