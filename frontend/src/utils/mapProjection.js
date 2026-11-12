/**
 * Projection between the building plan frame and the map SVG.
 *
 * Node coordinates are metres in one frame shared by every floor
 * (+x right, +y up on the upright architectural sheet; 66 m × 42 m). The map
 * SVG keeps its historic 1000 × 620 viewBox and draws the frame with one
 * uniform scale so the floor plan is never stretched.
 */
export const MAP_FRAME = Object.freeze({
  id: 'bji-main-block-plan-1to100-v1',
  widthMeters: 66,
  heightMeters: 42,
});

export const MAP_VIEWBOX = Object.freeze({ width: 1000, height: 620 });

/**
 * Compass bearing of plan-up. The main entrance is on the bottom edge of the
 * plan and faces West, so walking "up" the plan is walking East (90°) and
 * North is to the left of the plan. A phone can refine this with "Align
 * compass"; that per-device value is kept under MAP_NORTH_STORAGE_KEY.
 */
export const PLAN_UP_COMPASS_BEARING = 90;
export const MAP_NORTH_STORAGE_KEY = 'sicn_map_north_heading_v2';
export const MAP_NORTH_CHANGE_EVENT = 'sicn-map-north-change';

/** This phone's own compass alignment, or null when it uses the building default. */
export function readSavedMapNorth() {
  if (typeof window === 'undefined') return null;
  const saved = window.localStorage.getItem(MAP_NORTH_STORAGE_KEY);
  return saved !== null && Number.isFinite(Number(saved)) ? Number(saved) : null;
}

export const PX_PER_METER = 14.5;

const OFFSET_X = (MAP_VIEWBOX.width - MAP_FRAME.widthMeters * PX_PER_METER) / 2;
const OFFSET_Y = (MAP_VIEWBOX.height - MAP_FRAME.heightMeters * PX_PER_METER) / 2;

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 6;

/** Transform for plan artwork authored in centimetres with y pointing down. */
export const PLAN_LAYER_TRANSFORM = `translate(${OFFSET_X} ${OFFSET_Y}) scale(${PX_PER_METER / 100})`;

export const projectX = (x) => OFFSET_X + Number(x) * PX_PER_METER;
export const projectY = (y) => OFFSET_Y + (MAP_FRAME.heightMeters - Number(y)) * PX_PER_METER;

export function projectPoint(point) {
  return { x: projectX(point.x), y: projectY(point.y) };
}

/** SVG viewBox point -> plan metres, rounded to 0.1 m and kept inside the frame. */
export function unprojectPoint(svgX, svgY) {
  const clamp = (value, max) => Math.max(0, Math.min(max, Math.round(value * 10) / 10));
  return {
    x: clamp((svgX - OFFSET_X) / PX_PER_METER, MAP_FRAME.widthMeters),
    y: clamp(MAP_FRAME.heightMeters - (svgY - OFFSET_Y) / PX_PER_METER, MAP_FRAME.heightMeters),
  };
}

export const clampZoom = (zoom) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(Number(zoom) * 1000) / 1000));

/**
 * Screen pixels per viewBox unit when the map is shown at zoom 1 inside a
 * container (the SVG is letterboxed, so the tighter axis wins).
 */
export function getBaseScale(containerWidth, containerHeight) {
  const width = Math.min(Number(containerWidth) || MAP_VIEWBOX.width, 1380);
  const height = Math.min(Number(containerHeight) || MAP_VIEWBOX.height, 860);
  return Math.max(0.05, Math.min(width / MAP_VIEWBOX.width, height / MAP_VIEWBOX.height));
}

/** Keep the plan from being dragged completely out of view at any zoom. */
export function clampPan(pan, zoom, containerWidth, containerHeight) {
  const base = getBaseScale(containerWidth, containerHeight);
  const limitX = Math.max(140, (MAP_VIEWBOX.width * base * zoom) / 2);
  const limitY = Math.max(110, (MAP_VIEWBOX.height * base * zoom) / 2);
  return {
    x: Math.max(-limitX, Math.min(limitX, Number(pan?.x) || 0)),
    y: Math.max(-limitY, Math.min(limitY, Number(pan?.y) || 0)),
  };
}

/**
 * Pan (screen px) that puts a viewBox point at the centre of the part of the
 * container left free by `insets` (floating sidebar, search bar, bottom sheet).
 */
export function panToCenter(svgX, svgY, zoom, containerWidth, containerHeight, insets = {}) {
  const { left = 0, right = 0, top = 0, bottom = 0 } = insets;
  const base = getBaseScale(containerWidth, containerHeight);
  return clampPan({
    x: (MAP_VIEWBOX.width / 2 - svgX) * base * zoom + (left - right) / 2,
    y: (MAP_VIEWBOX.height / 2 - svgY) * base * zoom + (top - bottom) / 2,
  }, zoom, containerWidth, containerHeight);
}

/** viewBox bounds of the building outline (the plan fills almost the whole frame). */
const PLAN_BOUNDS = Object.freeze({ width: 968, height: 598 });

/**
 * Zoom and pan that show the whole building inside the part of the screen
 * that is not covered by floating UI (sidebar, search bar, bottom sheet).
 */
export function fitPlanToViewport(containerWidth, containerHeight, insets = {}) {
  const { left = 0, right = 0, top = 0, bottom = 0 } = insets;
  const base = getBaseScale(containerWidth, containerHeight);
  const availableWidth = Math.max(120, containerWidth - left - right);
  const availableHeight = Math.max(120, containerHeight - top - bottom);
  const zoom = clampZoom(Math.min(
    availableWidth / (PLAN_BOUNDS.width * base),
    availableHeight / (PLAN_BOUNDS.height * base)
  ));
  return {
    zoom,
    pan: {
      x: Math.round(left + availableWidth / 2 - containerWidth / 2),
      y: Math.round(top + availableHeight / 2 - containerHeight / 2),
    },
  };
}

/** Desktop layout: slim navigation rail plus the docked search / directions panel. */
export const DESKTOP_BREAKPOINT = 768;
export const DESKTOP_RAIL_WIDTH = 76;
export const getDesktopPanelWidth = (viewportWidth) => (viewportWidth >= 1024 ? 400 : 352);

/**
 * Screen space covered by the map page's floating controls.
 * Desktop: navigation rail + side panel on the left, floor picker on the right.
 * Phone: search bar and chips on top, bottom navigation and route sheet below.
 */
export function getMapUiInsets(viewportWidth, { panelOpen = true, sheet = 'none', viewportHeight = 800 } = {}) {
  if (viewportWidth >= DESKTOP_BREAKPOINT) {
    const left = DESKTOP_RAIL_WIDTH + 12 + (panelOpen ? getDesktopPanelWidth(viewportWidth) + 12 : 0);
    return { left, right: 72, top: 16, bottom: 16 };
  }
  // Bottom navigation (~66 px) plus the visible part of the directions sheet.
  const nav = 66;
  const sheetHeight = sheet === 'full' ? viewportHeight * 0.78 : sheet === 'half' ? viewportHeight * 0.46 : sheet === 'peek' ? 150 : 62;
  const bottom = Math.round(nav + sheetHeight);
  return { left: 4, right: 4, top: 118, bottom };
}

/**
 * Pan that keeps the map point under `anchor` (screen px measured from the
 * centre of the map container) fixed while the zoom changes — the way a map
 * zooms around the cursor or the middle of a pinch.
 */
export function zoomAroundPoint(pan, zoom, nextZoom, anchor = { x: 0, y: 0 }) {
  const ratio = nextZoom / zoom;
  return {
    x: anchor.x - (anchor.x - pan.x) * ratio,
    y: anchor.y - (anchor.y - pan.y) * ratio,
  };
}

/** A round scale-bar length (metres) and its on-screen width for the current zoom. */
export function getScaleBar(screenPixelsPerMetre, maxWidth = 96) {
  const steps = [1, 2, 5, 10, 20, 50, 100];
  let metres = steps[0];
  for (const step of steps) {
    if (step * screenPixelsPerMetre <= maxWidth) metres = step;
  }
  return { metres, width: Math.round(metres * screenPixelsPerMetre) };
}
