/**
 * Spoken navigation phrases. Pure functions so the wording can be tested;
 * the browser speech itself lives in hooks/useVoiceGuidance.js.
 */

const floorName = (floor) => (Number(floor) === 0 ? 'the Ground Floor' : `Floor ${floor}`);

/** Drop bracketed suffixes such as "(Ground Floor)" or "(1:12)" that read badly aloud. */
export function spokenPlace(name) {
  return String(name || '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+—\s+.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanSentence(text) {
  return String(text || '')
    .replace(/\s*\(([^)]*)\)/g, (match, inner) => (/floor/i.test(inner) ? `, ${inner}` : ''))
    .replace(/\s+/g, ' ')
    .replace(/[.\s]+$/, '')
    .trim();
}

const metres = (value) => {
  const rounded = Math.round(Number(value) || 0);
  return `${rounded} ${rounded === 1 ? 'metre' : 'metres'}`;
};

const destinationOf = (routeResult) => {
  const path = routeResult?.path || [];
  return path[path.length - 1] || null;
};

/** "Starting route to Seminar Hall. About 4 minutes, 99 metres. You will change floors once." */
export function getRouteIntroPhrase(routeResult) {
  if (!routeResult?.path?.length) return '';
  const destination = destinationOf(routeResult);
  const minutes = Math.max(1, Math.round(Number(routeResult.estimatedTimeMinutes) || 0));
  const parts = [
    `Starting route to ${spokenPlace(destination?.name) || 'your destination'}.`,
    `About ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}, ${metres(routeResult.totalDistance)}.`,
  ];
  const floorChanges = Math.max(0, (routeResult.floorsCovered?.length || 1) - 1);
  if (floorChanges === 1) parts.push('You will change floors once.');
  else if (floorChanges > 1) parts.push(`You will change floors ${floorChanges} times.`);
  return parts.join(' ');
}

/**
 * What to say when the user starts walking segment `segmentIndex`
 * (directions[segmentIndex + 1] describes that segment).
 */
export function getSegmentPhrase(routeResult, segmentIndex) {
  const step = routeResult?.directions?.[segmentIndex + 1];
  if (!step) return '';
  const from = routeResult.path?.[segmentIndex];
  const to = routeResult.path?.[segmentIndex + 1];

  if (step.type === 'stairs' || step.type === 'lift') {
    const transit = step.type === 'lift' ? 'lift' : 'stairs';
    const target = floorName(step.transition?.toFloor ?? to?.floor);
    const action = step.type === 'lift'
      ? `Take the lift to ${target}.`
      : `Take the stairs ${Number(to?.floor) > Number(from?.floor) ? 'up' : 'down'} to ${target}.`;
    return `${action} Scan the QR code at the ${transit} first, then the landing QR code on ${target}.`;
  }

  if (step.type === 'arrive') {
    const place = spokenPlace(destinationOf(routeResult)?.name);
    return Number(step.distance) >= 2
      ? `Your destination, ${place}, is ahead in ${metres(step.distance)}.`
      : `Your destination, ${place}, is just ahead.`;
  }

  const sentence = cleanSentence(step.instruction) || `Continue towards ${spokenPlace(to?.name)}`;
  return Number(step.distance) >= 2 ? `${sentence}, ${metres(step.distance)}.` : `${sentence}.`;
}

/** "In 4 metres, turn left at the west passage." — null when there is no real turn. */
export function getApproachPhrase(turn, remainingMeters) {
  if (!turn || turn.type === 'straight') return null;
  const where = spokenPlace(turn.atNodeName);
  const action = turn.type === 'u-turn' ? 'make a U-turn' : `turn ${turn.type}`;
  const lead = remainingMeters >= 1.5 ? `In ${metres(remainingMeters)}, ${action}` : `${action.charAt(0).toUpperCase()}${action.slice(1)} now`;
  return where ? `${lead} at ${where}.` : `${lead}.`;
}

export function getArrivalPhrase(routeResult) {
  const place = spokenPlace(destinationOf(routeResult)?.name);
  return place ? `You have arrived at ${place}.` : 'You have arrived.';
}

export function getFloorArrivalPhrase(floor, nextPlaceName) {
  const next = spokenPlace(nextPlaceName);
  return next ? `You are on ${floorName(floor)}. Continue to ${next}.` : `You are on ${floorName(floor)}.`;
}

export const WRONG_WAY_PHRASE = 'Wrong direction. Turn around and follow the blue line.';
