/**
 * Shared sensor and route-math helpers for phone-only 2D indoor navigation.
 * Map coordinates use +X = East and +Y = North. Compass bearings are clockwise
 * from North. A floor-plan registration offset must be calibrated before these
 * bearings can be treated as geographically accurate.
 */

export const normalizeDegrees = (value) => ((Number(value) % 360) + 360) % 360;

export function extractCompassHeading(event, screenAngle = 0) {
  if (typeof event?.webkitCompassHeading === 'number' && Number.isFinite(event.webkitCompassHeading)) {
    return normalizeDegrees(event.webkitCompassHeading);
  }

  if (!Number.isFinite(event?.alpha)) return null;

  const radians = Math.PI / 180;
  const alpha = event.alpha * radians;
  const beta = (event.beta || 0) * radians;
  const gamma = (event.gamma || 0) * radians;
  const cZ = Math.cos(alpha);
  const sZ = Math.sin(alpha);
  const sX = Math.sin(beta);
  const cY = Math.cos(gamma);
  const sY = Math.sin(gamma);
  const vx = -cZ * sY - sZ * sX * cY;
  const vy = -sZ * sY + cZ * sX * cY;

  if (Math.hypot(vx, vy) > 0.08) {
    let heading = Math.atan2(vx, vy) / radians;
    return normalizeDegrees(heading);
  }

  return normalizeDegrees(360 - event.alpha + screenAngle);
}

export function getMapBearing(from, to) {
  const dx = Number(to?.coordinates?.x) - Number(from?.coordinates?.x);
  const dy = Number(to?.coordinates?.y) - Number(from?.coordinates?.y);
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 1e-6) return null;
  return normalizeDegrees((Math.atan2(dx, dy) * 180) / Math.PI);
}

export function getRelativeBearing(targetBearing, deviceHeading, mapNorthHeading = 0) {
  if (!Number.isFinite(targetBearing) || !Number.isFinite(deviceHeading)) return null;
  const targetCompassBearing = normalizeDegrees(targetBearing + (mapNorthHeading || 0));
  return ((targetCompassBearing - deviceHeading + 540) % 360) - 180;
}

export function getSegmentDistance(routeResult, segmentIndex) {
  const edgeDistance = Number(routeResult?.edges?.[segmentIndex]?.distance);
  if (Number.isFinite(edgeDistance) && edgeDistance > 0) return edgeDistance;
  const directionDistance = Number(routeResult?.directions?.[segmentIndex + 1]?.distance);
  return Number.isFinite(directionDistance) && directionDistance > 0 ? directionDistance : 0;
}

export function interpolateRoutePosition(routeResult, segmentIndex, walkedMeters) {
  const from = routeResult?.path?.[segmentIndex];
  const to = routeResult?.path?.[segmentIndex + 1];
  if (!from?.coordinates || !to?.coordinates || from.floor !== to.floor) return null;

  const distance = getSegmentDistance(routeResult, segmentIndex);
  const progress = distance > 0 ? Math.max(0, Math.min(1, walkedMeters / distance)) : 0;
  return {
    floor: from.floor,
    x: from.coordinates.x + (to.coordinates.x - from.coordinates.x) * progress,
    y: from.coordinates.y + (to.coordinates.y - from.coordinates.y) * progress,
    progress,
    distanceRemaining: Math.max(0, distance - walkedMeters),
  };
}

export class StepDetector {
  constructor({ threshold = 1.2, releaseThreshold = 0.55, refractoryMs = 320 } = {}) {
    this.threshold = threshold;
    this.releaseThreshold = releaseThreshold;
    this.refractoryMs = refractoryMs;
    this.aboveThreshold = false;
    this.lastStepAt = 0;
  }

  push(magnitude, timestamp = Date.now()) {
    if (!Number.isFinite(magnitude)) return false;
    if (magnitude < this.releaseThreshold) this.aboveThreshold = false;
    if (magnitude < this.threshold || this.aboveThreshold) return false;
    this.aboveThreshold = true;
    if (timestamp - this.lastStepAt < this.refractoryMs) return false;
    this.lastStepAt = timestamp;
    return true;
  }

  reset() {
    this.aboveThreshold = false;
    this.lastStepAt = 0;
  }
}

/**
 * Validate a QR checkpoint against the active route. During a floor transition,
 * only the exact origin landing or exact destination landing on the same route
 * edge is accepted; this prevents a different staircase from changing floors.
 */
export function validateRouteCheckpoint(routeResult, activeStepIndex, checkpoint, currentFloor, transitionState = null) {
  if (!checkpoint?.nodeId || !Number.isFinite(Number(checkpoint.floor))) {
    return { valid: false, reason: 'Invalid checkpoint or missing floor metadata.' };
  }
  const checkpointFloor = Number(checkpoint.floor);
  const path = routeResult?.path || [];
  if (path.length < 2) {
    return { valid: true, floor: checkpointFloor, stage: 'manual' };
  }

  const current = path[activeStepIndex];
  const next = path[activeStepIndex + 1];
  if (!current) return { valid: false, reason: 'The active route position is invalid. Recalculate the route.' };

  if (next && Number(current.floor) !== Number(next.floor)) {
    if (Number(currentFloor) !== Number(current.floor)) {
      return { valid: false, reason: 'The confirmed floor does not match the active route. Recalculate or confirm your current checkpoint.' };
    }
    if (checkpoint.nodeId === current.nodeId && checkpointFloor === Number(current.floor)) {
      return { valid: true, floor: Number(current.floor), stage: 'transition-origin' };
    }
    const originConfirmed = transitionState?.originNodeId === current.nodeId;
    const destinationMatches = transitionState?.destinationNodeId === next.nodeId;
    if (
      originConfirmed &&
      destinationMatches &&
      checkpoint.nodeId === next.nodeId &&
      checkpointFloor === Number(next.floor)
    ) {
      return { valid: true, floor: Number(next.floor), stage: 'transition-destination' };
    }
    return {
      valid: false,
      reason: 'Confirm the origin staircase/lift QR first, then scan the matching destination landing QR.',
    };
  }

  const isOnCurrentFloorRoute = path.some(
    (node) => node.nodeId === checkpoint.nodeId && Number(node.floor) === checkpointFloor
  );
  if (!isOnCurrentFloorRoute || checkpointFloor !== Number(currentFloor)) {
    return { valid: false, reason: 'This QR checkpoint is not on the active route and confirmed current floor.' };
  }
  return { valid: true, floor: checkpointFloor, stage: 'route-checkpoint' };
}


/** Advance PDR distance along route edges without ever crossing a floor transition. */
export function advanceAlongRoute(routeResult, segmentIndex, walkedMeters, stepMeters) {
  const path = routeResult?.path || [];
  const edges = routeResult?.edges || [];
  let index = Math.max(0, Math.min(Number(segmentIndex) || 0, Math.max(0, path.length - 1)));
  let progress = Math.max(0, Number(walkedMeters) || 0);
  let remaining = Math.max(0, Number(stepMeters) || 0);
  let blockedByTransition = false;

  while (remaining > 0 && index < path.length - 1) {
    const from = path[index];
    const to = path[index + 1];
    const edge = edges[index];
    if (!from || !to || from.floor !== to.floor || ['stairs', 'lift'].includes(edge?.type)) {
      blockedByTransition = true;
      break;
    }
    const distance = getSegmentDistance(routeResult, index);
    if (distance <= 0) break;
    const available = Math.max(0, distance - progress);
    if (remaining < available) {
      progress += remaining;
      remaining = 0;
    } else {
      remaining -= available;
      index += 1;
      progress = 0;
    }
  }

  return {
    segmentIndex: index,
    walkedMeters: progress,
    remainingMeters: remaining,
    blockedByTransition,
    arrived: index >= path.length - 1,
  };
}

/** Project a point onto a finite segment; returns the nearest point and distance. */
export function projectOntoSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared > 0
    ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
    : 0;
  const projected = { x: start.x + t * dx, y: start.y + t * dy };
  return { ...projected, t, distance: Math.hypot(point.x - projected.x, point.y - projected.y) };
}

/** Snap a sensor position to the nearest same-floor route segment within a corridor. */
export function matchPositionToRoute(position, routeResult, options = {}) {
  const { maxDistance = 12, preferredSegmentIndex = null, heading = null, headingTolerance = 100 } = options;
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
  const path = routeResult?.path || [];
  let best = null;
  for (let index = 0; index < path.length - 1; index += 1) {
    const from = path[index];
    const to = path[index + 1];
    if (Number(from.floor) !== Number(position.floor) || Number(to.floor) !== Number(position.floor)) continue;
    const a = from.coordinates;
    const b = to.coordinates;
    if (!a || !b) continue;
    const projection = projectOntoSegment(position, a, b);
    const segmentBearing = getMapBearing(from, to);
    const headingDifference = Number.isFinite(heading) && segmentBearing !== null
      ? Math.abs(((segmentBearing - heading + 540) % 360) - 180)
      : 0;
    const isPreferred = preferredSegmentIndex === null || index === preferredSegmentIndex;
    const score = projection.distance + (isPreferred ? 0 : 0.5) + (headingDifference > headingTolerance ? 2 : 0);
    if (!best || score < best.score) best = { ...projection, segmentIndex: index, floor: from.floor, headingDifference, score };
  }
  if (!best || best.distance > maxDistance) return null;
  return best;
}

/**
 * Solve an affine transform from map coordinates to normalized PDF coordinates.
 * At least three non-collinear control points are required. More points use
 * least squares so administrators can reduce hand-click noise.
 */
export function solveAffineCalibration(controlPoints) {
  if (!Array.isArray(controlPoints) || controlPoints.length < 3) {
    throw new Error('At least three control points are required.');
  }
  const points = controlPoints.map((point) => ({
    x: Number(point.mapX), y: Number(point.mapY),
    u: Number(point.pdfX), v: Number(point.pdfY),
  }));
  if (points.some((p) => ![p.x, p.y, p.u, p.v].every(Number.isFinite))) {
    throw new Error('Every control point must contain finite map and PDF coordinates.');
  }
  const solve3 = (matrix, vector) => {
    const a = matrix.map((row, i) => [...row, vector[i]]);
    for (let col = 0; col < 3; col += 1) {
      let pivot = col;
      for (let row = col + 1; row < 3; row += 1) {
        if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
      }
      if (Math.abs(a[pivot][col]) < 1e-10) throw new Error('Control points are collinear; choose points spread across the floor.');
      [a[col], a[pivot]] = [a[pivot], a[col]];
      const divisor = a[col][col];
      for (let j = col; j < 4; j += 1) a[col][j] /= divisor;
      for (let row = 0; row < 3; row += 1) {
        if (row === col) continue;
        const factor = a[row][col];
        for (let j = col; j < 4; j += 1) a[row][j] -= factor * a[col][j];
      }
    }
    return a.map((row) => row[3]);
  };
  const sums = [0, 0, 0, 0, 0, 0];
  const normal = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  points.forEach(({ x, y, u, v }) => {
    const row = [x, y, 1];
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) normal[i][j] += row[i] * row[j];
      sums[i] += row[i] * u;
      sums[i + 3] += row[i] * v;
    }
  });
  const xCoefficients = solve3(normal, sums.slice(0, 3));
  const yCoefficients = solve3(normal, sums.slice(3, 6));
  const residuals = points.map((p) => {
    const u = xCoefficients[0] * p.x + xCoefficients[1] * p.y + xCoefficients[2];
    const v = yCoefficients[0] * p.x + yCoefficients[1] * p.y + yCoefficients[2];
    return Math.hypot(u - p.u, v - p.v);
  });
  return {
    xCoefficients,
    yCoefficients,
    rmsError: Math.sqrt(residuals.reduce((sum, value) => sum + value * value, 0) / residuals.length),
    maxError: Math.max(...residuals),
    pointCount: points.length,
  };
}

export function transformMapToPlan(point, calibration) {
  const x = calibration?.xCoefficients;
  const y = calibration?.yCoefficients;
  if (!Array.isArray(x) || !Array.isArray(y) || x.length !== 3 || y.length !== 3) return null;
  return {
    x: x[0] * point.x + x[1] * point.y + x[2],
    y: y[0] * point.x + y[1] * point.y + y[2],
  };
}
