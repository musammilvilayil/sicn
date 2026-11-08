function calculateMetricScale(input = {}) {
 const errors = [];
 const width = Number(input.pageWidth), height = Number(input.pageHeight), distance = Number(input.knownDistanceMeters);
 const points = Array.isArray(input.calibrationPoints) ? input.calibrationPoints : [];
 if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) errors.push('pageWidth and pageHeight must be positive PDF point dimensions.');
 if (!Number.isFinite(distance) || distance < 0.01) errors.push('knownDistanceMeters must be positive.');
 if (points.length !== 2) errors.push('Exactly two PDF points are required for scale calibration.');
 if (points.some(p => !Number.isFinite(Number(p?.x)) || !Number.isFinite(Number(p?.y)) || Number(p.x) < 0 || Number(p.x) > 1 || Number(p.y) < 0 || Number(p.y) > 1)) errors.push('Calibration points must use normalized coordinates between 0 and 1.');
 if (errors.length) return { valid: false, errors, metersPerPdfPoint: null, pdfPointDistance: null };
 const dx = (Number(points[1].x) - Number(points[0].x)) * width;
 const dy = (Number(points[1].y) - Number(points[0].y)) * height;
 const pdfPointDistance = Math.hypot(dx, dy);
 if (pdfPointDistance < 5) errors.push('Calibration points are too close; select a longer known dimension span.');
 if (!String(input.reference || '').trim()) errors.push('A source dimension reference is required.');
 return { valid: errors.length === 0, errors, pdfPointDistance, metersPerPdfPoint: errors.length ? null : distance / pdfPointDistance };
}
function metricPointsFromNormalized(points, pageWidth, pageHeight, metersPerPdfPoint) {
 return points.map(point => ({ x: Number(point.x) * Number(pageWidth) * Number(metersPerPdfPoint), y: Number(point.y) * Number(pageHeight) * Number(metersPerPdfPoint) }));
}
function measureMetricPolyline(points) {
 if (!Array.isArray(points) || points.length < 2) return null;
 let distance = 0;
 for (let i=1;i<points.length;i+=1) { const a=points[i-1], b=points[i]; if (!Number.isFinite(a?.x) || !Number.isFinite(a?.y) || !Number.isFinite(b?.x) || !Number.isFinite(b?.y)) return null; distance += Math.hypot(b.x-a.x,b.y-a.y); }
 return distance;
}
module.exports = { calculateMetricScale, metricPointsFromNormalized, measureMetricPolyline };
