const { parseArchitecturalMeasurement } = require('./architecturalMeasurements');
const { validateEdgeGeometry } = require('./floorGeometry');

const VALID_EDGE_TYPES = new Set(['walking', 'stairs', 'lift', 'ramp']);

function auditCampusGraph(graph, options = {}) {
  const floorHeightMeters = Number(options.floorHeightMeters ?? 3.9);
  const errors = [];
  const warnings = [];
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const nodeMap = new Map();
  const edgeIds = new Set();
  const geometrySummary = { edgesWithGeometry: 0, reviewedGeometry: 0, fieldVerifiedGeometry: 0, edgesWithoutGeometry: 0, verticalTransitionsWithoutGeometry: 0, invalidGeometry: 0, geometryLengthMismatches: 0 };
  const geometryFrames = new Set();
  const floorCounts = {};
  const measurementSummary = {
    parsed: 0,
    unparsed: 0,
    missing: 0,
    nodesWithMeasurements: 0,
    nodesWithoutMeasurements: 0,
    parsedAnnotations: 0,
    roomFootprints: 0,
    totalMeasuredRoomAreaSquareMeters: 0,
    stairSpecifications: [],
    records: [],
  };

  for (const node of nodes) {
    if (!node?.nodeId || nodeMap.has(node.nodeId)) {
      errors.push({ code: 'DUPLICATE_OR_MISSING_NODE_ID', nodeId: node?.nodeId ?? null });
      continue;
    }
    nodeMap.set(node.nodeId, node);
    if (!Number.isInteger(node.floor) || node.floor < 0 || node.floor > 7) {
      errors.push({ code: 'INVALID_FLOOR', nodeId: node.nodeId, floor: node.floor });
    }
    for (const axis of ['x', 'y', 'z']) {
      if (!Number.isFinite(Number(node.coordinates?.[axis]))) {
        errors.push({ code: 'INVALID_COORDINATE', nodeId: node.nodeId, axis });
      }
    }
    floorCounts[node.floor] = (floorCounts[node.floor] || 0) + 1;

    const raw = node.metadata?.dimensions || node.metadata?.description || '';
    const parsed = parseArchitecturalMeasurement(raw);
    if (!raw) measurementSummary.missing += 1;
    if (!parsed.measurements.length) {
      measurementSummary.unparsed += raw ? 1 : 0;
      measurementSummary.nodesWithoutMeasurements += 1;
    } else {
      measurementSummary.parsed += 1;
      measurementSummary.nodesWithMeasurements += 1;
      measurementSummary.parsedAnnotations += parsed.measurements.length;
      const rectangles = parsed.measurements.filter((item) => item.kind === 'rectangle');
      measurementSummary.roomFootprints += rectangles.length;
      measurementSummary.totalMeasuredRoomAreaSquareMeters += rectangles.reduce(
        (sum, item) => sum + item.areaSquareMeters, 0
      );
      const record = {
        nodeId: node.nodeId,
        floor: node.floor,
        sourceField: node.metadata?.dimensions ? 'dimensions' : 'description',
        sourceText: raw,
        measurements: parsed.measurements,
      };
      measurementSummary.records.push(record);
      if (node.type === 'stair') {
        const linear = parsed.linearDimensions || {};
        if (linear.width || linear.riser || linear.tread) {
          measurementSummary.stairSpecifications.push({ nodeId: node.nodeId, ...linear });
        }
      }
    }
  }

  for (const edge of edges) {
    if (!edge?.edgeId || edgeIds.has(edge.edgeId)) {
      errors.push({ code: 'DUPLICATE_OR_MISSING_EDGE_ID', edgeId: edge?.edgeId ?? null });
      continue;
    }
    edgeIds.add(edge.edgeId);
    const from = nodeMap.get(edge.fromNode);
    const to = nodeMap.get(edge.toNode);
    if (!from || !to) {
      errors.push({ code: 'DANGLING_EDGE', edgeId: edge.edgeId, fromNode: edge.fromNode, toNode: edge.toNode });
      continue;
    }
    if (!Number.isFinite(Number(edge.distance)) || Number(edge.distance) <= 0) {
      errors.push({ code: 'INVALID_EDGE_DISTANCE', edgeId: edge.edgeId, distance: edge.distance });
    }
    if (!VALID_EDGE_TYPES.has(edge.type)) {
      errors.push({ code: 'INVALID_EDGE_TYPE', edgeId: edge.edgeId, type: edge.type });
    }
    const floorDelta = Math.abs(from.floor - to.floor);
    if (floorDelta > 0 && (floorDelta !== 1 || !['stairs', 'lift'].includes(edge.type))) {
      errors.push({ code: 'INVALID_VERTICAL_TRANSITION', edgeId: edge.edgeId, floorDelta, type: edge.type });
    }
    if (floorDelta === 0 && ['stairs', 'lift'].includes(edge.type)) {
      warnings.push({ code: 'SAME_FLOOR_VERTICAL_EDGE', edgeId: edge.edgeId, type: edge.type });
    }
    if (!edge.geometry) {
      if (floorDelta > 0) {
        // A floor-local 2D polyline cannot describe a stair or lift run.
        geometrySummary.verticalTransitionsWithoutGeometry += 1;
      } else {
        geometrySummary.edgesWithoutGeometry += 1;
        warnings.push({ code: 'MISSING_WALKABLE_GEOMETRY', edgeId: edge.edgeId });
      }
    } else {
      geometrySummary.edgesWithGeometry += 1;
      if (edge.geometry.coordinateFrameId) geometryFrames.add(edge.geometry.coordinateFrameId);
      const geometryCheck = validateEdgeGeometry(edge.geometry, {
        distanceMeters: edge.distance,
        distanceEvidenceSource: edge.distanceEvidence?.source,
      });
      if (!geometryCheck.valid) {
        geometrySummary.invalidGeometry += 1;
        if (geometryCheck.errors.some((message) => message.includes('Polyline length'))) geometrySummary.geometryLengthMismatches += 1;
        warnings.push({ code: 'INVALID_EDGE_GEOMETRY', edgeId: edge.edgeId, errors: geometryCheck.errors });
      }
      if (edge.geometry.verification?.status === 'reviewed') geometrySummary.reviewedGeometry += 1;
      if (edge.geometry.verification?.status === 'field_verified' && geometryCheck.valid) geometrySummary.fieldVerifiedGeometry += 1;
      if (Number.isInteger(from.floor) && edge.geometry.floor !== from.floor) {
        warnings.push({ code: 'EDGE_GEOMETRY_FLOOR_MISMATCH', edgeId: edge.edgeId, geometryFloor: edge.geometry.floor, fromFloor: from.floor });
      }
    }
    if (!edge.distanceEvidence) {
      warnings.push({ code: 'UNVERIFIED_EDGE_DISTANCE', edgeId: edge.edgeId, distance: edge.distance });
    } else if (!['architectural_plan', 'field_measured', 'admin_estimate'].includes(edge.distanceEvidence.source)) {
      warnings.push({ code: 'UNKNOWN_DISTANCE_EVIDENCE_SOURCE', edgeId: edge.edgeId });
    }
  }

  const adjacency = new Map(nodes.map((node) => [node.nodeId, []]));
  for (const edge of edges) {
    if (!adjacency.has(edge.fromNode) || !adjacency.has(edge.toNode)) continue;
    adjacency.get(edge.fromNode).push(edge.toNode);
    if (edge.isBidirectional) adjacency.get(edge.toNode).push(edge.fromNode);
  }
  const visited = new Set();
  const components = [];
  for (const node of nodes) {
    if (visited.has(node.nodeId)) continue;
    const queue = [node.nodeId];
    const component = [];
    visited.add(node.nodeId);
    while (queue.length) {
      const current = queue.shift();
      component.push(current);
      for (const next of adjacency.get(current) || []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    components.push(component);
  }
  if (components.length > 1) {
    warnings.push({ code: 'DISCONNECTED_GRAPH', componentSizes: components.map((component) => component.length) });
  }

  const unverifiedDistanceCount = edges.filter((edge) => !edge.distanceEvidence).length;
  const verifiedDistanceCount = edges.length - unverifiedDistanceCount;
  const countBySource = (source) => edges.filter((edge) => edge.distanceEvidence?.source === source).length;
  // Node x/y only count as metres when every same-floor edge carries valid
  // metric geometry in one shared frame; otherwise they are schematic.
  const metricPlanFrame = edges.length > 0
    && geometrySummary.edgesWithoutGeometry === 0
    && geometrySummary.invalidGeometry === 0
    && geometryFrames.size === 1;
  return {
    valid: errors.length === 0,
    summary: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      floorCounts,
      connectedComponents: components.length,
      verifiedDistanceCount,
      unverifiedDistanceCount,
      planDerivedDistanceCount: countBySource('architectural_plan'),
      fieldMeasuredDistanceCount: countBySource('field_measured'),
      adminEstimateDistanceCount: countBySource('admin_estimate'),
      coordinateSpace: metricPlanFrame
        ? 'architectural_plan_xy_metres_with_metric_floor_elevation'
        : 'schematic_xy_with_metric_floor_elevation',
      coordinateFrameId: metricPlanFrame ? [...geometryFrames][0] : null,
      floorHeightMeters,
    },
    geometrySummary,
    measurementSummary,
    errors,
    warnings,
  };
}

module.exports = { auditCampusGraph };
