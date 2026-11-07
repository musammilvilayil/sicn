const UNIT_TO_METERS = { mm: 0.001, cm: 0.01, m: 1 };

function toMeters(value, unit) {
  const factor = UNIT_TO_METERS[String(unit || '').toLowerCase()];
  return factor ? Number(value) * factor : null;
}

function numberValue(value) {
  return Number(String(value).replace(',', '.'));
}

/**
 * Reads only explicitly unit-labelled drawing annotations.
 * It never infers scale or coordinates from room footprints.
 */
function parseArchitecturalMeasurement(input) {
  const source = String(input ?? '').trim();
  if (!source) return { source, kind: 'empty', measurements: [], warnings: [] };

  const measurements = [];
  const warnings = [];
  const pairPattern = /(?:(\d+(?:[.,]\d+)?\s*[x×]\s*)?)(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\b/gi;
  let match;

  while ((match = pairPattern.exec(source)) !== null) {
    const unit = match[4].toLowerCase();
    const first = numberValue(match[2]);
    const second = numberValue(match[3]);
    if (!(first > 0 && second > 0)) {
      warnings.push('A dimension pair must contain positive values.');
      continue;
    }
    const dimensionsMeters = [toMeters(first, unit), toMeters(second, unit)];
    measurements.push({
      kind: 'rectangle',
      sourceText: match[0],
      values: [first, second],
      unit,
      dimensionsMeters,
      areaSquareMeters: dimensionsMeters[0] * dimensionsMeters[1],
    });
  }

  const scalarPattern = /\b(width|riser|tread|height|depth|diameter|thickness)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\b|\b(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\s*(?:wide|width)\b/gi;
  while ((match = scalarPattern.exec(source)) !== null) {
    const label = (match[1] || 'width').toLowerCase();
    const value = numberValue(match[2] || match[4]);
    const unit = (match[3] || match[5]).toLowerCase();
    if (!(value > 0)) {
      warnings.push('A linear dimension must be positive.');
      continue;
    }
    measurements.push({
      kind: 'linear_dimension',
      label,
      sourceText: match[0],
      value,
      unit,
      meters: toMeters(value, unit),
    });
  }

  if (measurements.length) {
    const rectangles = measurements.filter((item) => item.kind === 'rectangle');
    const linear = measurements.filter((item) => item.kind === 'linear_dimension');
    return {
      source,
      kind: rectangles.length ? (rectangles.length > 1 ? 'compound_footprint' : 'footprint') : 'linear_dimensions',
      measurements,
      totalAreaSquareMeters: rectangles.length
        ? rectangles.reduce((sum, item) => sum + item.areaSquareMeters, 0)
        : undefined,
      linearDimensions: linear.reduce((result, item) => {
        result[item.label] = item.meters;
        return result;
      }, {}),
      warnings,
    };
  }

  if (/\d+\s*[x×]\s*\d+/.test(source)) {
    warnings.push('A dimension pair has no explicit unit; it was not converted.');
  }
  return {
    source,
    kind: 'unparsed',
    measurements: [],
    warnings: [...warnings, 'No explicit supported metric dimension was found.'],
  };
}

module.exports = { parseArchitecturalMeasurement, toMeters };
