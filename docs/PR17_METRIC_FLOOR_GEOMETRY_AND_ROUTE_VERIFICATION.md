# PR #17 — Metric floor geometry and route verification

## Scope delivered

- Adds a strict metric-polyline contract for route-edge geometry.
- Supports corridor centrelines, door connectors and room-entry connectors.
- Measures a route edge by summing every polyline segment, so bends are included rather than measuring only the endpoint chord.
- Requires an explicit per-floor metric coordinate frame and a source reference (drawing page or field-survey record).
- Distinguishes candidate, reviewed and field-verified geometry. Field verification requires a named verifier, timestamp and `field_measured` distance provenance.
- Adds a floor-plan intake manifest for GF–7F, linking each floor to the exact PDF already stored in the repository.

## Ground-floor / room / corridor / door policy

The current seed graph includes ground-floor and room nodes, but its x/y positions are schematic. Room dimension annotations establish footprints/areas only; they do not establish room-centre coordinates, door openings, wall boundaries, corridor bends or the path a person walks. The PDF files are present, but this PR does not claim vector geometry extraction or a site survey.

The manifest therefore marks each floor `source_available_not_extracted` and initializes geometry feature counts to zero. This is intentional: it prevents fabricated room polygons, corridor centrelines, wall/fence lines or door positions from being mistaken for surveyed geometry.

## Geometry contract

An edge may store a `geometry` object with:
- `kind`: `corridor_centerline`, `door_connector`, `room_entry_connector`, `stair_path` or `lift_path`;
- `coordinateSystem`: exactly `local_metric_m`;
- `coordinateFrameId`: stable per-floor calibrated frame identifier;
- `floor`: integer floor number;
- `sourceRef`: source PDF/page or field-survey reference;
- `points`: at least two finite `{x, y}` points in metres;
- `verification`: `candidate`, `reviewed` or `field_verified`.

The polyline length must match the edge distance within max(0.15 m, 2%). A reviewed drawing geometry is not the same as a physically field-verified route.

## Next physical/source-data gates

1. Extract vector paths and text from each PDF page and map page numbers to floors.
2. Calibrate each page into its own metric frame using multiple known dimensions, and inspect residual error.
3. Trace wall boundaries, walkable corridor centrelines, door openings, room footprints and door-to-room connectors; model vertical stair/lift transitions with per-floor landing geometry plus separately measured vertical transit data.
4. Review the extracted geometry visually against the source PDF; reject ambiguous/low-confidence features.
5. Measure actual walkable route lengths on site, including bends and door approaches; record verifier/date.
6. Verify QR sticker locations and test route instructions on Android Chrome and iOS Safari.

No PR or CI run can substitute for the site walkthrough. Existing edge weights remain routable legacy weights until they receive defensible geometry/distance evidence.
