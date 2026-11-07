function solve3(matrix, vector) {
  const rows = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    if (Math.abs(rows[pivot][column]) < 1e-10) {
      throw new Error('Control points are collinear. Choose at least three points spread across the floor.');
    }
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let j = column; j < 4; j += 1) rows[column][j] /= divisor;
    for (let row = 0; row < 3; row += 1) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let j = column; j < 4; j += 1) rows[row][j] -= factor * rows[column][j];
    }
  }
  return rows.map((row) => row[3]);
}

function solveAffineCalibration(controlPoints) {
  if (!Array.isArray(controlPoints) || controlPoints.length < 3) {
    throw new Error('At least three control points are required.');
  }
  const normal = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const targetX = [0, 0, 0];
  const targetY = [0, 0, 0];
  for (const point of controlPoints) {
    const { mapX, mapY, pdfX, pdfY } = point;
    if (![mapX, mapY, pdfX, pdfY].every(Number.isFinite) || pdfX < 0 || pdfX > 1 || pdfY < 0 || pdfY > 1) {
      throw new Error('Control point coordinates must be finite and PDF coordinates must be normalized between 0 and 1.');
    }
    const row = [mapX, mapY, 1];
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) normal[i][j] += row[i] * row[j];
      targetX[i] += row[i] * pdfX;
      targetY[i] += row[i] * pdfY;
    }
  }
  const xCoefficients = solve3(normal, targetX);
  const yCoefficients = solve3(normal, targetY);
  const errors = controlPoints.map((point) => {
    const x = xCoefficients[0] * point.mapX + xCoefficients[1] * point.mapY + xCoefficients[2];
    const y = yCoefficients[0] * point.mapX + yCoefficients[1] * point.mapY + yCoefficients[2];
    return Math.hypot(x - point.pdfX, y - point.pdfY);
  });
  return {
    xCoefficients,
    yCoefficients,
    rmsError: Math.sqrt(errors.reduce((sum, value) => sum + value * value, 0) / errors.length),
    maxError: Math.max(...errors),
  };
}

module.exports = { solveAffineCalibration };
