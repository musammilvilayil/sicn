function summarizeRouteDistanceQuality(edges = []) {
  const list = Array.isArray(edges) ? edges : [];
  const fieldVerifiedEdgeCount = list.filter((edge) => edge.distanceEvidence?.source === 'field_measured').length;
  const planDerivedEdgeCount = list.filter((edge) => edge.distanceEvidence?.source === 'architectural_plan').length;
  const estimatedEdgeCount = list.filter((edge) => edge.distanceEvidence?.source === 'admin_estimate').length;
  const unverifiedEdgeCount = list.length - fieldVerifiedEdgeCount - planDerivedEdgeCount - estimatedEdgeCount;

  let status = 'field_verified';
  let message = 'Every route segment has a field-measured distance.';
  if (!list.length) {
    status = 'not_applicable';
    message = 'No route segments to assess.';
  } else if (unverifiedEdgeCount > 0) {
    status = 'unverified';
    message = 'This route includes legacy distances without measurement evidence. Treat distance and walking time as provisional.';
  } else if (estimatedEdgeCount > 0) {
    status = 'estimated';
    message = 'This route includes administrator estimates. Distance and walking time are approximate.';
  } else if (planDerivedEdgeCount > 0) {
    status = 'plan_derived';
    message = 'Distances are derived from calibrated architectural plans, not physically measured on site. Complete a walkthrough before relying on precise navigation.';
  }

  return {
    status,
    message,
    edgeCount: list.length,
    verifiedEdgeCount: fieldVerifiedEdgeCount + planDerivedEdgeCount,
    fieldVerifiedEdgeCount,
    planDerivedEdgeCount,
    estimatedEdgeCount,
    unverifiedEdgeCount,
  };
}

module.exports = { summarizeRouteDistanceQuality };
