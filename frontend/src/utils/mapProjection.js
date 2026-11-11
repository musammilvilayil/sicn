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

export const clampZoom = (zoom) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(Number(zoom) * 100) / 100));

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

/** Screen space covered by the map page's floating controls. */
export function getMapUiInsets(viewportWidth) {
  return viewportWidth >= 768
    ? { left: 258, right: 72, top: 64, bottom: 16 }
    : { left: 4, right: 4, top: 118, bottom: 128 };
}
