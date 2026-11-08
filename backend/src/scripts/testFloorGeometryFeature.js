const test = require('node:test');
const assert = require('node:assert/strict');
const { validateFloorGeometryFeature } = require('../utils/floorGeometryFeature');
const base = { floor: 0, sourcePdf: 'BJI_BUILDING PLAN 01 GF MAIN BLOCK_04022026.pdf', pageNumber: 1, featureType: 'corridor_centerline', coordinateSystem: 'pdf_normalized', points: [{x:0.1,y:0.2},{x:0.4,y:0.2},{x:0.7,y:0.3}] };
test('accepts normalized candidate corridor trace', () => assert.equal(validateFloorGeometryFeature(base).valid, true));
test('requires three points for room footprint', () => assert.equal(validateFloorGeometryFeature({...base,featureType:'room_footprint',points:base.points.slice(0,2)}).valid, false));
test('allows a single room-label anchor', () => assert.equal(validateFloorGeometryFeature({...base,featureType:'room_label_anchor',points:[{x:0.5,y:0.5}]}).valid, true));
test('rejects out-of-range coordinates and unsupported types', () => {
 assert.equal(validateFloorGeometryFeature({...base,points:[{x:1.2,y:0.5},{x:0.4,y:0.2}]}).valid, false);
 assert.equal(validateFloorGeometryFeature({...base,featureType:'unknown'}).valid, false);
});
