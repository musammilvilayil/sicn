const GEOMETRY_KINDS = new Set([
  'corridor_centerline',
  'door_connector',
  'room_entry_connector',
  'stair_path',
  'lift_path',
]);
const VERIFICATION_STATES = new Set(['candidate', 'reviewed', 'field_verified']);

function measurePolyline(points) {
  if (!Array.isArray(points) || points.length < 2) return null;
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (!Number.isFinite(previous?.x) || !Number.isFinite(previous?.y) ||
        !Number.isFinite(current?.x) || !Number.isFinite(current?.y)) return null;
    length += Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  return length;
}

function validateEdgeGeometry(geometry, options = {}) {
  const errors = [];
  if (!geometry || typeof geometry !== 'object') {
    return { valid: false, errors: ['Geometry is required for geometry validation.'], lengthMeters: null };
  }
  if (!GEOMETRY_KINDS.has(geometry.kind)) errors.push('Unsupported geometry kind.');
  if (geometry.coordinateSystem !== 'local_metric_m') errors.push('coordinateSystem must be local_metric_m.');
  if (!String(geometry.coordinateFrameId || '').trim()) errors.push('coordinateFrameId is required.');
  if (!String(geometry.sourceRef || '').trim()) errors.push('sourceRef must identify the drawing/page or field survey.');
  if (!Number.isInteger(geometry.floor) || geometry.floor < 0 || geometry.floor > 7) errors.push('floor must be an integer from 0 to 7.');
  const lengthMeters = measurePolyline(geometry.points);
  if (lengthMeters === null || !(lengthMeters > 0)) errors.push('points must contain at least two finite metric x/y coordinates.');
  const verification = geometry.verification || {};
  if (!VERIFICATION_STATES.has(verification.status)) errors.push('verification.status must be candidate, reviewed, or field_verified.');
  if (verification.status === 'field_verified') {
    if (options.distanceEvidenceSource !== 'field_measured') {
      errors.push('field_verified geometry requires field_measured distance evidence.');
    }
    if (!verification.verifiedAt || !String(verification.verifiedBy || '').trim()) {
      errors.push('field_verified geometry requires verifiedAt and verifiedBy.');
    }
  }
  if (lengthMeters !== null && Number.isFinite(Number(options.distanceMeters))) {
    const distance = Number(options.distanceMeters);
    const tolerance = Math.max(0.15, distance * 0.02);
    if (Math.abs(lengthMeters - distance) > tolerance) {
      errors.push(`Polyline length (${lengthMeters.toFixed(3)}m) differs from edge distance (${distance.toFixed(3)}m) by more than ${tolerance.toFixed(3)}m.`);
    }
  }
  return { valid: errors.length === 0, errors, lengthMeters };
}

module.exports = { GEOMETRY_KINDS, measurePolyline, validateEdgeGeometry };
