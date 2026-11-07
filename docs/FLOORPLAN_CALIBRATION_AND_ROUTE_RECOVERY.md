# SICN Calibration, Map Matching and Route Recovery

## What this implementation provides

- An in-app PDF.js viewer for the repository's original GF–7F architectural sheets.
- Per-floor registration to the existing navigation graph using at least three non-collinear control points.
- A least-squares affine transform from graph coordinates to normalized PDF page coordinates.
- Route, checkpoint and estimated-position overlays on the rendered PDF page after registration.
- Server-side persistence of the PDF source, page number, page dimensions, control points, transform and fit residual.
- Admin-only save, replace, delete and physical-verification attestation endpoints.
- Route-constrained PDR progress that carries step-distance overflow across adjacent walking edges and stops at stairs/lifts.
- Same-floor route-segment map matching for the estimated position.
- Geometry-based next-junction left/right/straight/U-turn instructions.
- Sustained heading-deviation warning. It asks the user to confirm a nearby QR checkpoint before recalculating; compass heading alone is not treated as a position fix.
- A QR checkpoint on the confirmed current floor that is outside the planned route is accepted as a recovery origin and triggers a fresh route calculation.
- The existing ordered origin-QR then destination-QR state machine remains mandatory for all floor transitions in 2D and AR.

## Admin floor registration procedure

1. Open the map on the target floor and choose **Architectural Plan**.
2. Select the correct PDF page. For paired-floor source sheets, choose the page containing the target floor drawing and click only that floor's region.
3. Select a known graph node from the floor list.
4. Click the exact same physical location on the PDF drawing.
5. Repeat for at least three points that are spread across the floor and are not in a straight line. Stair/lift cores and corridor junctions are useful control points only when their graph locations are already correct.
6. Review the affine fit and save. The route overlay is then drawn on the PDF page using the stored transform.
7. Walk the actual corridors, measure representative distances, check every transition landing and QR location, then record the field verification note only after that physical check is complete.

The fit's RMS error measures how well the clicked control points fit the affine transform; it does not measure building survey accuracy.

## Accuracy boundaries

- The app does not invent floor-plan coordinates, scale, North, room positions or corridor lengths.
- Graph node coordinates currently originate from the existing schematic campus graph. They must be checked against the actual drawing before registration.
- The PDF preview is rendered at runtime using PDF.js from a pinned CDN build. The original PDFs remain served from the repository's Vite floor-plan asset plugin.
- The current route matcher is constrained to the route graph and graph-coordinate space. It is not Wi-Fi/BLE/UWB positioning, visual SLAM or independent continuous XY localization.
- PDR remains an estimate based on phone step detection and the user's stride calibration. It can drift, especially during turns, stairs, phone carrying changes or background suspension.
- Heading mismatch is only a deviation warning. A confirmed QR checkpoint supplies the location used for rerouting.
- The field-verification endpoint stores an explicit administrator attestation and note. The code cannot perform a physical campus walk or validate the actual site itself.
- Each floor must be registered separately, including each floor region on a shared 2F/3F, 4F/5F or 6F/7F source sheet.

## API

- `GET /api/floor-calibrations` — public read of saved floor registrations.
- `PUT /api/floor-calibrations/:floor` — Admin-only registration save/replace.
- `POST /api/floor-calibrations/:floor/verify` — Admin-only physical walkthrough attestation; requires explicit confirmation and a note.
- `DELETE /api/floor-calibrations/:floor` — Admin-only registration removal.

## Validation

Unit tests cover affine transform fitting and collinearity rejection, route-segment projection, PDR overflow, floor-transition stopping, ordered QR transitions, off-route QR recovery and route turn geometry. GitHub Actions runs frontend lint/build/tests and backend syntax/routing/calibration tests.
