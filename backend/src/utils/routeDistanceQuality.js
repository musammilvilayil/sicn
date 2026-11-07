const VERIFIED_SOURCES = new Set(['architectural_plan', 'field_measured']);

function summarizeRouteDistanceQuality(edges = []) {
  const list = Array.isArray(edges) ? edges : [];
  const verifiedEdgeCount = list.filter((edge) => VERIFIED_SOURCES.has(edge.distanceEvidence?.source)).length;
  const estimatedEdgeCount = list.filter((edge) => edge.distanceEvidence?.source === 'admin_estimate').length;
  const unverifiedEdgeCount = list.length - verifiedEdgeCount - estimatedEdgeCount;

  let status = 'verified';
  let message = 'All route segments have declared measurement evidence.';
  if (!list.length) {
    status = 'not_applicable';
    message = 'No route segments to assess.';
  } else if (unverifiedEdgeCount > 0) {
    status = 'unverified';
    message = 'This route includes legacy distances without measurement evidence. Treat distance and walking time as provisional.';
  } else if (estimatedEdgeCount > 0) {
    status = 'estimated';
    message = 'This route includes administrator estimates. Distance and walking time are approximate.';
  }

  return {
    status,
    message,
    edgeCount: list.length,
    verifiedEdgeCount,
    estimatedEdgeCount,
    unverifiedEdgeCount,
  };
}

module.exports = { summarizeRouteDistanceQuality };
