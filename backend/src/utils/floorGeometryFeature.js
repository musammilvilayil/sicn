const FEATURE_TYPES = new Set(['wall_boundary','fence_boundary','door_opening','corridor_centerline','room_footprint','room_label_anchor','room_entry_connector']);
function validateFloorGeometryFeature(input = {}) {
 const errors = [];
 const floor = Number(input.floor), pageNumber = Number(input.pageNumber);
 if (!Number.isInteger(floor) || floor < 0 || floor > 7) errors.push('floor must be an integer from 0 through 7.');
 if (!String(input.sourcePdf || '').trim()) errors.push('sourcePdf is required.');
 if (!Number.isInteger(pageNumber) || pageNumber < 1) errors.push('pageNumber must be a positive integer.');
 if (!FEATURE_TYPES.has(input.featureType)) errors.push('Unsupported floor geometry feature type.');
 if (input.coordinateSystem && input.coordinateSystem !== 'pdf_normalized') errors.push('New survey traces must use pdf_normalized coordinates.');
 const points = Array.isArray(input.points) ? input.points : [];
 const minimum = input.featureType === 'room_label_anchor' ? 1 : input.featureType === 'room_footprint' ? 3 : 2;
 if (points.length < minimum || points.length > 500) errors.push(`points must contain between ${minimum} and 500 coordinates for this feature type.`);
 if (points.some(p => !Number.isFinite(Number(p?.x)) || !Number.isFinite(Number(p?.y)) || Number(p.x) < 0 || Number(p.x) > 1 || Number(p.y) < 0 || Number(p.y) > 1)) errors.push('Every point must have normalized x/y coordinates between 0 and 1.');
 if (String(input.label || '').length > 100) errors.push('label must be 100 characters or fewer.');
 if (String(input.notes || '').length > 1000) errors.push('notes must be 1000 characters or fewer.');
 return { valid: errors.length === 0, errors };
}
module.exports = { FEATURE_TYPES, validateFloorGeometryFeature };
