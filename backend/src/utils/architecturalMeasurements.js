const UNIT_TO_METERS = { mm: 0.001, cm: 0.01, m: 1 };

function toMeters(value, unit) {
  const factor = UNIT_TO_METERS[unit];
  if (!factor) return null;
  return Number(value) * factor;
}

/**
 * Parses explicit dimensions from architectural metadata without inventing a scale.
 * Supports room footprints, counted/compound footprints and linear widths.
 */
function parseArchitecturalMeasurement(input) {
  const source = String(input ?? '').trim();
  if (!source) return { source, kind: 'empty', measurements: [], warnings: [] };

  const measurements = [];
  const warnings = [];
  // Optional leading count handles labels such as "5x 155x135 cm".
  const pairPattern = /(?:(\d+(?:[.,]\d+)?\s*[x×]\s*)?)(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?/gi;
  let match;
  let inheritedUnit = null;

  while ((match = pairPattern.exec(source)) !== null) {
    const unit = (match[4] || inheritedUnit || '').toLowerCase();
    if (match[4]) inheritedUnit = unit;
    if (!unit || !UNIT_TO_METERS[unit]) {
      warnings.push('A dimension pair has no explicit unit; it was not converted.');
      continue;
    }
    const first = Number(match[2].replace(',', '.'));
    const second = Number(match[3].replace(',', '.'));
    if (!(first > 0 && second > 0)) {
      warnings.push('A dimension pair must contain positive values.');
      continue;
    }
    measurements.push({
      kind: 'rectangle',
      sourceText: match[0],
      values: [first, second],
      unit,
      dimensionsMeters: [toMeters(first, unit), toMeters(second, unit)],
      areaSquareMeters: toMeters(first, unit) * toMeters(second, unit),
    });
  }

  if (measurements.length) {
    return {
      source,
      kind: measurements.length > 1 ? 'compound_footprint' : 'footprint',
      measurements,
      totalAreaSquareMeters: measurements.reduce((sum, item) => sum + item.areaSquareMeters, 0),
      warnings,
    };
  }

  const scalar = source.match(/(?:width\s*[:=]?\s*)?(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\s*(?:wide|width)?/i);
  if (scalar) {
    const value = Number(scalar[1].replace(',', '.'));
    const unit = scalar[2].toLowerCase();
    if (value > 0) {
      return {
        source,
        kind: 'linear_dimension',
        measurements: [{ kind: 'width', sourceText: scalar[0], value, unit, meters: toMeters(value, unit) }],
        warnings,
      };
    }
  }

  return {
    source,
    kind: 'unparsed',
    measurements: [],
    warnings: [...warnings, 'No explicit supported metric dimension was found.'],
  };
}

module.exports = { parseArchitecturalMeasurement };
