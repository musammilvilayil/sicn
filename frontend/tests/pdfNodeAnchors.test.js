import test from 'node:test';
import assert from 'node:assert/strict';
import { findPdfNodeAnchors, normalizePdfLabel } from '../src/utils/pdfNodeAnchors.js';

const viewport = {
  width: 1000,
  height: 800,
  convertToViewportPoint: (x, y) => [x, 800 - y],
};

test('normalizes drawing labels for exact room-number matching', () => {
  assert.equal(normalizePdfLabel('Classroom-201 / A'), 'CLASSROOM 201 A');
});

test('maps exact room labels into normalized PDF control points', () => {
  const nodes = [
    { nodeId: '2F-CLASS-201', name: 'Classroom 201', floor: 2, coordinates: { x: 18, y: 68 }, metadata: { roomNumber: '201' } },
    { nodeId: '2F-CLASS-202', name: 'Classroom 202', floor: 2, coordinates: { x: 18, y: 48 }, metadata: { roomNumber: '202' } },
  ];
  const items = [
    { str: '201', transform: [1, 0, 0, 1, 100, 700], width: 20 },
    { str: '202', transform: [1, 0, 0, 1, 300, 600], width: 20 },
  ];
  const anchors = findPdfNodeAnchors(items, viewport, nodes);
  assert.equal(anchors.length, 2);
  assert.equal(anchors[0].nodeId, '2F-CLASS-201');
  assert.equal(anchors[0].pdfX, 0.11);
  assert.equal(anchors[0].pdfY, 0.125);
});

test('does not confuse room 20 with room 201 or reuse one PDF label', () => {
  const nodes = [
    { nodeId: 'F-20', name: 'Room 20', coordinates: { x: 1, y: 1 }, metadata: { roomNumber: '20' } },
    { nodeId: 'F-201', name: 'Room 201', coordinates: { x: 2, y: 2 }, metadata: { roomNumber: '201' } },
  ];
  const items = [{ str: '201', transform: [1, 0, 0, 1, 50, 50], width: 10 }];
  const anchors = findPdfNodeAnchors(items, viewport, nodes);
  assert.equal(anchors.length, 1);
  assert.equal(anchors[0].nodeId, 'F-201');
});

test('detects common stair and lift labels for vertical-core anchors', () => {
  const nodes = [
    { nodeId: 'GF-STAIR-A', name: 'Main Staircase A', coordinates: { x: 42, y: 55 } },
    { nodeId: 'GF-LIFT-1', name: 'Lift 1', coordinates: { x: 48, y: 52 } },
  ];
  const items = [
    { str: 'STAIR A', transform: [1, 0, 0, 1, 100, 100], width: 30 },
    { str: 'LIFT 1', transform: [1, 0, 0, 1, 200, 200], width: 25 },
  ];
  const anchors = findPdfNodeAnchors(items, viewport, nodes);
  assert.equal(anchors.length, 2);
});
