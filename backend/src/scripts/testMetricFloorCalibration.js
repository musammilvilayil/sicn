const test=require('node:test');
const assert=require('node:assert/strict');
const {calculateMetricScale,metricPointsFromNormalized,measureMetricPolyline}=require('../utils/metricFloorCalibration');
const base={pageWidth:1000,pageHeight:2000,knownDistanceMeters:10,reference:'Dimension 1000 cm on source plan',calibrationPoints:[{x:0.1,y:0.2},{x:0.6,y:0.2}]};
test('derives metres per PDF point from two known dimension endpoints',()=>{const result=calculateMetricScale(base);assert.equal(result.valid,true);assert.equal(result.pdfPointDistance,500);assert.equal(result.metersPerPdfPoint,0.02);});
test('rejects coincident or too-close calibration points',()=>assert.equal(calculateMetricScale({...base,calibrationPoints:[{x:0.2,y:0.2},{x:0.201,y:0.2}]}).valid,false));
test('rejects missing source reference',()=>assert.equal(calculateMetricScale({...base,reference:''}).valid,false));
test('converts normalized points to local metric coordinates',()=>{const points=metricPointsFromNormalized([{x:0,y:0},{x:0.5,y:0}],1000,2000,0.02);assert.deepEqual(points,[{x:0,y:0},{x:10,y:0}]);assert.equal(measureMetricPolyline(points),10);});
