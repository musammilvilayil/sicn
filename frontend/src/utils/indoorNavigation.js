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
