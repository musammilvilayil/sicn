export const FLOOR_PLANS = Object.freeze({
  0: {
    label: 'Ground Floor',
    url: '/floorplans/ground-floor.pdf',
    sourceName: 'BJI_BUILDING PLAN 01 GF MAIN BLOCK_04022026.pdf',
  },
  1: {
    label: '1st Floor',
    url: '/floorplans/first-floor.pdf',
    sourceName: 'BJI_BUILDING PLAN 0000_1ST FLOOR MAIN BLOCK_04022026.pdf',
  },
  2: {
    label: '2nd Floor',
    url: '/floorplans/second-third-floor.pdf',
    sourceName: 'BJI_MAIN_BLOCK_2ND_&_3RD_FLOOR_BUILDING_PLAN_00000_04022026.pdf',
    sharedSheetFloors: [2, 3],
  },
  3: {
    label: '3rd Floor',
    url: '/floorplans/second-third-floor.pdf',
    sourceName: 'BJI_MAIN_BLOCK_2ND_&_3RD_FLOOR_BUILDING_PLAN_00000_04022026.pdf',
    sharedSheetFloors: [2, 3],
  },
  4: {
    label: '4th Floor',
    url: '/floorplans/fourth-fifth-floor.pdf',
    sourceName: 'BJI_BUILDING_PLAN_0002_4TH_&_5TH_FLOOR_MAIN_BLOCK_04022026.pdf',
    sharedSheetFloors: [4, 5],
  },
  5: {
    label: '5th Floor',
    url: '/floorplans/fourth-fifth-floor.pdf',
    sourceName: 'BJI_BUILDING_PLAN_0002_4TH_&_5TH_FLOOR_MAIN_BLOCK_04022026.pdf',
    sharedSheetFloors: [4, 5],
  },
  6: {
    label: '6th Floor',
    url: '/floorplans/sixth-seventh-floor.pdf',
    sourceName: 'BJI_BUILDING_PLAN_003_6TH_&_7TH_FLOOR_MAIN_BLOCK_04022026.pdf',
    sharedSheetFloors: [6, 7],
  },
  7: {
    label: '7th Floor',
    url: '/floorplans/sixth-seventh-floor.pdf',
    sourceName: 'BJI_BUILDING_PLAN_003_6TH_&_7TH_FLOOR_MAIN_BLOCK_04022026.pdf',
    sharedSheetFloors: [6, 7],
  },
});

/**
 * Exact registration of the building plan frame (node x/y in metres) onto each
 * source PDF page, as used by tools/build_floorplan_assets.py: the drawings are
 * 1:100 (72 pt = 2.54 m), rotated a quarter turn on a 2384 × 3370 pt page, and
 * every floor window is offset by a translation only.
 */
const PLAN_PAGE = Object.freeze({ width: 2384, height: 3370, ptPerMeter: 72 / 2.54, originX: 60, originY: 1170 });
const PLAN_FLOOR_OFFSETS = Object.freeze({
  0: [150, 1100],
  1: [272, 961],
  2: [53, 58],
  3: [940, 1190],
  4: [74, 50],
  5: [948, 1209],
  6: [350, 23],
  7: [920, 1162],
});

/** Affine transform (map metres -> normalized PDF page coordinates) for a floor. */
export function getPlanRegistration(floor) {
  const offset = PLAN_FLOOR_OFFSETS[Number(floor)];
  if (!offset) return null;
  const { width, height, ptPerMeter, originX, originY } = PLAN_PAGE;
  return {
    pageNumber: 1,
    xCoefficients: [0, ptPerMeter / width, (width - originY - offset[1]) / width],
    yCoefficients: [ptPerMeter / height, 0, (originX + offset[0]) / height],
    source: 'built_in_plan_registration',
  };
}
