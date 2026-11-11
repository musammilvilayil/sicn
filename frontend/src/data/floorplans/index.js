/**
 * Lazy loaders for the per-floor plan line work generated from the
 * architectural PDFs by tools/build_floorplan_assets.py. Each floor is its
 * own chunk so only the floors a visitor opens are downloaded.
 */
const loaders = import.meta.glob('./floor-*.json');
const cache = new Map();

export function loadFloorPlan(floor) {
  const key = `./floor-${Number(floor)}.json`;
  if (!loaders[key]) return Promise.resolve(null);
  if (!cache.has(key)) {
    cache.set(key, loaders[key]().then((module) => module.default ?? module));
  }
  return cache.get(key);
}
