# Real floor-plan map and plan-traced navigation graph

The Explore map shows the building exactly as it is drawn on the architectural
sheets in `floorplan/`, and the navigation graph is positioned on those drawings.

## Building frame

- Units: metres. Extent: 66 m × 42 m. `+x` is right and `+y` is up on the upright sheet.
- Frame id: `bji-main-block-plan-1to100-v1` (stored on every edge geometry).
- The drawings are 1:100, so 72 pt on the PDF = 2.54 m. This was checked against
  printed dimensions (for example the 2712 cm east wing measures 27.06 m in the frame).
- All sheets share scale and orientation; each floor drawing differs only by a
  translation. The offsets were found by cross-correlating wall line work against
  the ground floor and are recorded in `tools/build_floorplan_assets.py`
  (`--check-registration` re-derives them) and in `frontend/src/config/floorPlans.js`.
- `z = floor × 3.9 m` (Section A-A / B-B: 390 cm floor to floor).
- Compass orientation: the main entrance (bottom edge of the plan) faces **West**, so
  plan-up is East (`PLAN_UP_COMPASS_BEARING = 90` in `frontend/src/utils/mapProjection.js`)
  and North is to the left of the plan. The map shows a north arrow. This is the default
  for every phone; "Align compass" stores a per-phone refinement.

## Pipeline

| Step | File | Output |
|---|---|---|
| Plan line work | `tools/build_floorplan_assets.py` | `frontend/src/data/floorplans/floor-<n>.json` |
| Graph | `backend/src/scripts/buildCampusGraph.js` | `backend/src/data/seedData.json` |
| Map rendering | `frontend/src/components/FloorMap.jsx`, `frontend/src/utils/mapProjection.js` | plan + nodes + route in one uniform projection |

The asset tool removes what is not building: dimension lines and arrowheads,
dashed section lines, the red extension outline, grey hatching, title blocks and
anything outside the building hull. Room names printed on the drawing are kept
as light annotations where no navigation node already labels the space.

## Graph rules

- A room node sits inside the room; the edge to it stores the walked polyline
  (passage point → door → room), so a route is drawn and measured through the door.
- Passage nodes follow the centreline of the 2.76 m west passage and the 2.73 m east passage.
- Edge distance = polyline length on the plan, rounded to 0.1 m, with
  `distanceEvidence.source = architectural_plan` and `geometry.verification.status = candidate`.
- Stairs and lifts exist only on the floors the drawings show: main stair GF–5F,
  fire escape stair GF–7F, central lift GF–5F, west lift GF–7F.
- `backend/src/scripts/testCampusGraph.js` keeps `seedData.json` in sync with the
  builder and checks geometry, connectivity and the vertical cores.

## What is still not verified

- Nothing here was measured on site. Distances and positions are as accurate as the drawings.
- Room numbers such as “Classroom 201” are app labels; the drawings only say “CLASSROOM”.
- The ground-floor entry is modelled as drawn: the 1:12 ramp and side passage beside
  the grand steps, with the grand steps rising to the 1st floor. Confirm on site.
- The compass orientation comes from “the entrance faces West”, not from a survey. If walking the right way shows as the wrong direction, stand on the route, face along it and tap **Align compass**.
- QR sticker positions must be placed and checked physically.

## Updating

1. Edit positions or rooms in `buildCampusGraph.js` (coordinates are metres read off the plan).
2. `npm --prefix backend run build:graph`
3. `python tools/build_floorplan_assets.py` (needs `pdftocairo` from poppler-utils and `pdfplumber`)
4. `npm --prefix backend run seed` on the target database. Seeding removes the retired
   schematic seed records listed in `backend/src/data/legacySeedIds.json`.
