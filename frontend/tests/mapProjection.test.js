import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAP_FRAME,
  MAP_VIEWBOX,
  MAX_ZOOM,
  MIN_ZOOM,
  PX_PER_METER,
  clampPan,
  clampZoom,
  fitPlanToViewport,
  getMapUiInsets,
  getScaleBar,
  zoomAroundPoint,
  panToCenter,
  projectX,
  projectY,
  unprojectPoint,
} from '../src/utils/mapProjection.js';
import { getPlanRegistration } from '../src/config/floorPlans.js';
import { transformMapToPlan } from '../src/utils/indoorNavigation.js';

const readJson = (relativePath) => JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));

test('projects plan metres with one uniform scale and y pointing up', () => {
  assert.equal(projectX(10) - projectX(0), 10 * PX_PER_METER);
  assert.equal(projectY(0) - projectY(10), 10 * PX_PER_METER);
  // The whole 66 m × 42 m frame stays inside the 1000 × 620 viewBox.
  assert.ok(projectX(0) >= 0 && projectX(MAP_FRAME.widthMeters) <= MAP_VIEWBOX.width);
  assert.ok(projectY(MAP_FRAME.heightMeters) >= 0 && projectY(0) <= MAP_VIEWBOX.height);
});

test('unprojects a clicked map point back to plan metres', () => {
  assert.deepEqual(unprojectPoint(projectX(36.4), projectY(22.7)), { x: 36.4, y: 22.7 });
  assert.deepEqual(unprojectPoint(-500, 5000), { x: 0, y: 0 });
  assert.deepEqual(unprojectPoint(5000, -500), { x: MAP_FRAME.widthMeters, y: MAP_FRAME.heightMeters });
});

test('limits zoom and keeps the plan reachable while panning', () => {
  assert.equal(clampZoom(0.01), MIN_ZOOM);
  assert.equal(clampZoom(99), MAX_ZOOM);
  const clamped = clampPan({ x: 99999, y: -99999 }, 1, 1400, 860);
  assert.ok(clamped.x > 0 && clamped.x < 1400);
  assert.ok(clamped.y < 0 && clamped.y > -860);
  // Centring a point left of the viewBox centre pans the map to the right.
  assert.ok(panToCenter(100, 310, 2, 1400, 860).x > 0);
});

test('home view fits the building beside the desktop sidebar and on phones', () => {
  const desktop = fitPlanToViewport(1400, 860, getMapUiInsets(1400));
  assert.ok(desktop.zoom >= MIN_ZOOM && desktop.zoom <= 1);
  assert.ok(desktop.pan.x > 0, 'building is shifted right of the sidebar');
  const phone = fitPlanToViewport(390, 844, getMapUiInsets(390));
  assert.ok(phone.zoom >= 0.9 && phone.zoom <= 1.2);
});

test('ships generated plan line work for every floor in the shared frame', () => {
  for (let floor = 0; floor <= 7; floor += 1) {
    const plan = readJson(`../src/data/floorplans/floor-${floor}.json`);
    assert.equal(plan.floor, floor);
    assert.equal(plan.frame.id, MAP_FRAME.id);
    assert.equal(plan.frame.width, MAP_FRAME.widthMeters * plan.frame.unitsPerMetre);
    assert.equal(plan.frame.height, MAP_FRAME.heightMeters * plan.frame.unitsPerMetre);
    assert.match(plan.source, /^floorplan\/.+\.pdf$/);
    assert.match(plan.layers.wall, /^M-?\d+ -?\d+l/);
    assert.ok(plan.layers.wall.length > 1000, `floor ${floor} has wall line work`);
    for (const label of plan.labels) {
      assert.ok(label.x >= 0 && label.x <= MAP_FRAME.widthMeters && label.y >= 0 && label.y <= MAP_FRAME.heightMeters);
      assert.ok(label.text.length > 0);
    }
  }
});

test('built-in registration places every seed node on its source PDF page', () => {
  const { nodes } = readJson('../../backend/src/data/seedData.json');
  for (let floor = 0; floor <= 7; floor += 1) {
    const registration = getPlanRegistration(floor);
    assert.equal(registration.pageNumber, 1);
    for (const node of nodes.filter((item) => item.floor === floor)) {
      const point = transformMapToPlan(node.coordinates, registration);
      assert.ok(point.x > 0 && point.x < 1 && point.y > 0 && point.y < 1, `${node.nodeId} is on the page`);
    }
  }
  // The sheets are rotated a quarter turn: +x on the plan runs down the PDF page.
  const gf = getPlanRegistration(0);
  const a = transformMapToPlan({ x: 10, y: 10 }, gf);
  const b = transformMapToPlan({ x: 20, y: 10 }, gf);
  assert.ok(Math.abs(a.x - b.x) < 1e-12 && b.y > a.y);
  assert.equal(getPlanRegistration(9), null);
});

test('zooming keeps the point under the cursor or pinch in place', () => {
  const pan = { x: 40, y: -25 };
  const anchor = { x: 180, y: 90 };
  const next = zoomAroundPoint(pan, 1.5, 3, anchor);
  // Screen offset of the anchored map point: anchor = pan + zoom * p  =>  p = (anchor - pan) / zoom
  const before = { x: (anchor.x - pan.x) / 1.5, y: (anchor.y - pan.y) / 1.5 };
  const after = { x: (anchor.x - next.x) / 3, y: (anchor.y - next.y) / 3 };
  assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9);
  // Zooming around the centre only scales the pan.
  assert.deepEqual(zoomAroundPoint({ x: 10, y: 20 }, 1, 2, { x: 0, y: 0 }), { x: 20, y: 40 });
});

test('phone insets grow with the directions sheet; desktop insets follow the side panel', () => {
  const closed = getMapUiInsets(390, { sheet: 'none', viewportHeight: 844 });
  const peek = getMapUiInsets(390, { sheet: 'peek', viewportHeight: 844 });
  const half = getMapUiInsets(390, { sheet: 'half', viewportHeight: 844 });
  assert.ok(closed.bottom < peek.bottom && peek.bottom < half.bottom);
  const open = getMapUiInsets(1400, { panelOpen: true });
  const collapsed = getMapUiInsets(1400, { panelOpen: false });
  assert.ok(open.left > collapsed.left && collapsed.left >= 76);
});

test('scale bar picks a round length that fits', () => {
  assert.deepEqual(getScaleBar(9), { metres: 10, width: 90 });
  assert.deepEqual(getScaleBar(40), { metres: 2, width: 80 });
  assert.equal(getScaleBar(500).metres, 1);
});
