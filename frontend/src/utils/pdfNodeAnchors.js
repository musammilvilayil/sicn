export function normalizePdfLabel(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

function hasLabel(text, label) {
  const haystack = normalizePdfLabel(text);
  const needle = normalizePdfLabel(label);
  if (!needle) return false;
  if (/^\d+$/.test(needle)) {
    return new RegExp(`(^| )${needle}($| )`).test(haystack);
  }
  return haystack.includes(needle);
}

function getNodeLabels(node) {
  const labels = [];
  if (node.metadata?.roomNumber) labels.push(String(node.metadata.roomNumber));
  const name = String(node.name || '');
  const roomNumber = name.match(/\b\d{2,4}[A-Z]?\b/);
  if (roomNumber) labels.push(roomNumber[0]);

  const id = String(node.nodeId || '').toUpperCase();
  if (id.includes('STAIR-A')) labels.push('STAIR A', 'STAIRCASE A');
  if (id.includes('STAIR-B')) labels.push('STAIR B', 'STAIRCASE B', 'FIRE STAIR');
  if (id.includes('LIFT-1')) labels.push('LIFT 1');
  if (id.includes('LIFT-2')) labels.push('LIFT 2');
  if (id.includes('MAIN-ENTRANCE')) labels.push('MAIN ENTRANCE');
  if (id.includes('CORR-CENTRAL')) labels.push('CENTRAL CORRIDOR');
  if (id.includes('CORR-EAST')) labels.push('EAST PASSAGE', 'EAST CORRIDOR');
  if (id.includes('CORR-WEST')) labels.push('WEST CORRIDOR');

  return [...new Set(labels.filter(Boolean))];
}

export function findPdfNodeAnchors(textItems, viewport, nodes) {
  if (!Array.isArray(textItems) || !viewport || !Array.isArray(nodes)) return [];
  const usedItems = new Set();
  const anchors = [];

  for (const node of nodes) {
    let match = null;
    let matchedLabel = '';
    for (const label of getNodeLabels(node)) {
      const index = textItems.findIndex((item, itemIndex) =>
        !usedItems.has(itemIndex) &&
        Array.isArray(item.transform) &&
        item.transform.length >= 6 &&
        hasLabel(item.str, label)
      );
      if (index >= 0) {
        match = textItems[index];
        matchedLabel = label;
        usedItems.add(index);
        break;
      }
    }
    if (!match) continue;

    const x = Number(match.transform[4]) + Math.max(0, Number(match.width) || 0) / 2;
    const y = Number(match.transform[5]);
    if (!(viewport.width > 0 && viewport.height > 0)) continue;
    const point = typeof viewport.convertToViewportPoint === 'function'
      ? viewport.convertToViewportPoint(x, y)
      : [x, Number(viewport.height) - y];
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue;

    anchors.push({
      nodeId: node.nodeId,
      mapX: Number(node.coordinates?.x),
      mapY: Number(node.coordinates?.y),
      pdfX: Math.max(0, Math.min(1, point[0] / viewport.width)),
      pdfY: Math.max(0, Math.min(1, point[1] / viewport.height)),
      matchedLabel,
      sourceText: match.str,
    });
  }
  return anchors.filter((anchor) => Number.isFinite(anchor.mapX) && Number.isFinite(anchor.mapY));
}

