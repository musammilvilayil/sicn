# SICN Complete System Audit & Implementation Specification

**Repository:** `musammilvilayil/sicn`  
**Audit baseline:** `main` at `e3aa133c8ca2d89b7d1980070d40ee360b5f5d01`  
**Product decisions:** Responsive web app (Android + iPhone browsers); hybrid phone-only positioning (PDR + map matching + QR correction); complete scope.  
**Status:** Source-level audit. Runtime, CI and physical-device validation remain outstanding.

## 1. Product objective

Deliver a dependable, mobile-first indoor navigation web application for the Bishop Jerome Institute Main Block. Users must be able to find rooms and facilities, follow multi-floor routes, correct their indoor position at QR checkpoints, use camera-based AR guidance where supported, and optionally share their location with explicitly authorized people. Administrators must be able to maintain building maps, navigation graph data and checkpoints safely.

The product must not claim GPS-level or centimetre-level indoor positioning. Phone-only web positioning is an estimate between authoritative QR checkpoints and is subject to sensor drift, browser permission restrictions, device differences and background execution limits.

## 2. Repository baseline and current state

- Default branch: `main`; repository is public and writable by the connected GitHub identity.
- Latest main commit at audit time: `e3aa133c8ca2d89b7d1980070d40ee360b5f5d01`, merging PR #6.
- PR #6 (2D QR scanning) is closed/merged into main. Its current behaviour enables a persistent scanner panel by user toggle; it does not implement route-aware stair-entry/landing transitions.
- PR #5 (AR QR checkpoint confirmation) is still open at audit time. It must be reviewed and reconciled with the transition state machine before merge; do not merge as-is.
- PR #1–#4 are closed in GitHub search. Their individual merge commits and final branch outcomes should be verified during the PR-history reconciliation before any cleanup.
- The CI workflow exists at `.github/workflows/ci.yml`. It runs frontend `npm ci`, oxlint, Vite production build, and backend dependency install plus `node --check`. It currently has no dedicated unit/integration/browser test jobs.
- Workflow-run lookup and commit combined-status lookup for the audited main merge commit returned no runs/status entries. This is **not evidence of a passing build**.
- The GitHub connector permits repository reads and branch/file/PR writes. This audit did not execute `npm ci`, frontend build/lint, backend tests, MongoDB integration tests or device tests.

## 3. Confirmed source-level findings

### 3.1 QR and floor transition correctness — critical

Relevant files:
- `frontend/src/components/IndoorCheckpointScanner.jsx`
- `frontend/src/pages/MapPage.jsx`
- `frontend/src/components/ARView.jsx`
- `frontend/src/context/NavigationContext.jsx`

Findings:
1. The 2D scanner is mounted from `MapPage` and controlled by `autoScannerOpen`. A user toggle keeps the rear camera scanner active; it is not tied to the next expected route checkpoint.
2. `handleConfirmIndoorCheckpoint` updates `startNodeId` and `currentFloor` for any registered QR returned by the API. It does not validate that the QR is the expected route checkpoint or floor transition endpoint.
3. AR QR detection accepts any registered QR. It immediately updates start node and floor and recalculates the route. It does not distinguish origin staircase QR from destination landing QR.
4. The AR step handler can set current floor from a selected route path step. Manual direction selection must not be allowed to imply that the user physically changed floors.
5. Scanner candidate copy explicitly says confirmation updates current floor. This is unsafe for the required two-checkpoint stair/lift workflow.

Required behaviour:
- Derive the next transition from the active route path/edge, including exact origin node, destination landing node, floor, and transit type.
- Use a single explicit transition state machine: `idle`, `approaching_origin`, `awaiting_origin_qr`, `transit_in_progress`, `awaiting_landing_qr`, `validating_landing`, `relocalizing`, `completed`, `recovery_required`.
- On origin QR: validate exact expected origin node/floor/transit core; confirm the user is at the entrance; retain the origin floor/map; instruct climb/take lift to the target floor. Do not update floor.
- On destination landing QR: validate exact expected landing node, same transit core, and expected destination floor; only then update confirmed position/floor, sync account/socket location, and resume/recalculate the remaining route.
- Reject unrelated, stale, wrong-staircase, wrong-floor and out-of-order QR payloads with a useful message and no location mutation.
- AR must decode from the already active camera stream; never open a second camera.
- In 2D, the browser cannot reliably detect physical proximity without a position estimate and cannot guarantee a camera can be silently opened. Use PDR/map-match proximity to offer the scanner at a checkpoint, with an explicit tap fallback and clear permission state. Stop camera when no longer needed.
- Support recovery/relocalization when confidence is low, without silently accepting an arbitrary QR as the next transition.

### 3.2 Positioning and sensor fusion — incomplete

Relevant file: `frontend/src/components/ARView.jsx`.

Findings:
- Device motion peak detection is implemented only in the AR view.
- Walking distance uses a fixed `0.7m` per detected step and advances a route step at an `85%` distance threshold. This is a coarse heuristic, not a calibrated PDR engine.
- Orientation sensors are optional and browser/device support differs. iOS permission requires a user gesture and secure context.
- No general 2D-mode positioning engine or confidence model is exposed from NavigationContext.
- QR checkpoints are the only reliable discrete indoor position anchors currently documented.

Required behaviour:
- Extract sensor collection and positioning from the AR component into a reusable positioning service/controller usable by 2D and AR.
- Implement filtered step detection, configurable per-device stride calibration, heading smoothing, elapsed-time handling, confidence/uncertainty and pause/resume lifecycle.
- Map-match estimates to valid graph edges and prevent impossible jumps across walls, floors or disconnected corridors.
- Do not infer a floor change from step count or compass. Vertical transitions remain pending until landing checkpoint confirmation.
- Expose tracking states: unavailable, permission_required, initializing, tracking_estimated, checkpoint_confirmed, low_confidence, paused.
- Throttle network updates and share only with explicit consent. Handle visibility changes, denied permissions, missing sensors and device sleep.
- Label estimates as estimates; do not display fake precision.

### 3.3 Floor map and coordinate accuracy — critical data dependency

Relevant files:
- `frontend/src/components/FloorMap.jsx`
- `backend/src/scripts/buildCampusGraph.js`
- `backend/src/data/seedData.json`
- `backend/src/models/Node.js`
- `backend/src/models/Edge.js`

Findings:
- FloorMap uses fixed transforms `scaleX = 60 + x * 8.8` and `scaleY = 60 + (85 - y) * 5.8` against an SVG viewBox of 1000 × 620.
- Ground Floor and First Floor have dedicated SVG plan markup. Floors 2–7 use a shared/generic architectural layout branch with floor-specific labels and node overlays.
- The graph generator stores x/y as numeric map coordinates and z as floor elevation; the Edge model explicitly defines `distance` in metres.
- The A* heuristic computes Euclidean distance from x/y/z coordinates while edge costs are metres. Unless x/y have been calibrated into metres or transformed consistently, the heuristic mixes units and its admissibility is not established. This must be fixed before relying on A* optimality; use Dijkstra as a correctness-safe fallback until a consistent metric coordinate system is available.
- The floor route polyline filters path nodes by floor before drawing. This can connect separated visits to the same floor as one visual segment and may draw misleading straight lines across disconnected route sections.
- Source comments and README describe blueprint-derived plans, but the repository audit cannot prove that every overlay is aligned with current, surveyed architectural source drawings.

Required behaviour:
- Treat the actual approved floor drawings as the source of truth. Confirm drawing version, orientation, dimensions, scale, origin and building wing for each floor.
- Store a per-floor transform/calibration (SVG/image coordinates to normalized map coordinates and, where surveyed, metric coordinates). Do not assume one global transform fits every floor.
- Store floor-plan asset/version and calibration metadata.
- Render each floor from its own plan asset and calibrated transform; do not silently substitute a generic plan where a real floor drawing is required.
- Draw route segments per contiguous same-floor path run; represent vertical edges with explicit transition markers rather than joining non-contiguous points.
- Add data validation for missing nodes, invalid coordinates, duplicate IDs/QRs, dangling edges, impossible cross-floor walking edges, and unreachable destinations.
- Keep map editing/version publishing auditable and reversible.

### 3.4 Routing engine — needs correctness and product rules

Relevant files:
- `backend/src/algorithms/aStar.js`
- `backend/src/controllers/navigationController.js` (controller referenced by routes)
- `backend/src/routes/navigationRoutes.js`

Findings:
- A* supports multi-floor routes and `accessibleOnly`; Edge records have distance, accessibility, type and direction instructions.
- Existing backend scripts test standard and accessible multi-floor route examples, but they are integration scripts requiring a running API/MongoDB rather than isolated automated unit tests.
- Accessibility currently depends on edge flags; map/node/edge data correctness determines whether the result is actually accessible.
- A* heuristic unit consistency is not proven (see map data section).

Required behaviour:
- Define one canonical graph contract and validate all route inputs/edges.
- Fix or disable the heuristic until metric units are consistent; add tests proving A* equals Dijkstra on representative graphs.
- Support route preferences: shortest, accessible, prefer lift, prefer stairs, avoid blocked edges and temporary closures.
- Return structured route steps with stable edge IDs, origin/destination node IDs, floor, transit type, expected checkpoint IDs, distances, instructions and route version.
- Add route deviation detection and bounded recalculation with hysteresis to avoid oscillation.
- Ensure accessibility claims are based on verified edge metadata (ramps, lift access, door widths/closures), not only a Boolean default.

### 3.5 Live location sharing — partial

Relevant files include `frontend/src/services/api.js`, Socket.IO context/server setup and `backend/src/controllers/authController.js`.

Findings:
- Socket.IO-based short-lived room sharing is documented; QR checkpoint scans are broadcast to room members.
- `api.updateMyLocation` persists a node ID and QR payload for authenticated users.
- The current design does not establish continuous sensor-fused positioning, consent granularity, retention rules, or reliable background tracking.
- Web apps may be suspended in background; continuous tracking cannot be guaranteed on iOS Safari or Android browsers.

Required behaviour:
- Share only after explicit opt-in; show sharing status, recipients, expiry and an immediate stop control.
- Validate server-side user identity and room membership; never trust client-supplied identity/role.
- Broadcast only confidence-qualified position updates with timestamp, floor, node/edge reference and source (QR vs estimate).
- Apply rate limits, stale update expiry, reconnect/resync and privacy-preserving retention defaults.
- Do not advertise background/always-on tracking as guaranteed in the web platform.

### 3.6 Mobile UX and responsive layout — needs full QA

Relevant files:
- `frontend/src/pages/MapPage.jsx`
- `frontend/src/components/FloorMap.jsx`
- `frontend/src/components/DirectionsBottomSheet.jsx`
- global styles and other page components.

Findings:
- MapPage uses fixed full-viewport layout, floating top search, right-side vertical floor dock, zoom controls and a bottom directions sheet.
- DirectionsBottomSheet uses fixed positioning and a desktop offset; controls and step rows need small-screen, safe-area, keyboard and touch QA.
- Existing commits claim some responsive improvements, but there is no current cross-page viewport test suite or screenshot regression evidence.

Required behaviour:
- Establish a shared mobile-first design system with spacing, typography, surface, elevation, breakpoints, safe-area and focus tokens.
- Audit every route/page and every overlay, not only MapPage.
- Test widths 320, 360, 375, 390, 414, 430, tablet and desktop; portrait and landscape where relevant.
- No horizontal overflow, clipped primary actions, overlapping controls or inaccessible drawers.
- Map gets the available viewport; floor picker, search, route sheet and action buttons must adapt without obscuring current position or destination.
- Add automated viewport smoke tests and manual Android Chrome/iOS Safari verification.

### 3.7 Security, operations and accessibility

- Existing repository documents JWT, role-protected Admin map CRUD, rate limiting, secure CORS and Socket.IO authentication. These controls must be regression-tested during refactoring.
- The frontend API helper reads a bearer token from localStorage. The existing README already flags token exposure and the need to review an HttpOnly-cookie/CSRF strategy. Threat-model and migrate only with a safe session transition plan.
- Add production observability, error reporting, health checks, backup/restore tests, deployment configuration and environment validation.
- Add keyboard navigation, screen-reader labels, contrast checks and reduced-motion support.
- Offline support should cache read-only floor plans and essential route metadata; never cache credentials or expose private location history.

## 4. Target architecture

Keep the current React + Vite + Tailwind frontend, Express + MongoDB API, Socket.IO sharing and optional FastAPI service where it has a measured purpose. Avoid a full rewrite.

Frontend service boundaries:
- `navigation/routeEngine`: route contract and route-step progression.
- `positioning/sensorProvider`: browser sensor permission and lifecycle.
- `positioning/pdrEngine`: filtered step/heading estimates and confidence.
- `positioning/mapMatcher`: constrain estimates to graph edges and route.
- `checkpoints/transitionMachine`: expected origin/landing QR state machine.
- `checkpoints/qrDecoder`: shared decoder abstraction; 2D camera lifecycle and AR existing-stream adapter.
- `maps/floorTransform`: per-floor coordinate transform and SVG mapping.
- `sharing/locationPublisher`: consent, throttling, stale updates and Socket.IO.
- React views consume these services; they must not independently mutate confirmed floor/position.

Backend boundaries:
- Buildings/floors/floor-plan versions.
- Nodes and edges with schema validation.
- QR checkpoint lookup/verification and transition metadata.
- Route calculation with route version and expected transition checkpoints.
- Authenticated location sessions and sharing rooms.
- Admin map publishing and audit log.

Position record contract:
`{ userId, buildingId, floor, nodeId?, edgeId?, x?, y?, confidence, source: 'qr'|'pdr'|'map_match', observedAt, sessionId? }`.
A QR-confirmed location is authoritative; PDR/map-match records are estimates and cannot confirm a floor transition.

## 5. Delivery plan — separate, testable PRs

### PR A — Audit/specification (this document)
- Commit the source-level audit, product decisions, architecture and acceptance criteria.
- No runtime code changes.

### PR B — Graph and routing correctness
- Add graph validation and deterministic unit tests.
- Make heuristic units consistent or use Dijkstra fallback.
- Fix contiguous floor route segment generation and structured transition metadata.
- Validate standard, accessible and multi-floor route fixtures.

### PR C — QR transition state machine
- Implement shared pure transition state machine with unit tests.
- Validate origin QR and destination landing QR against the exact expected route edge.
- Wire 2D scanner to context-aware checkpoint prompts and stop camera outside checkpoint/recovery.
- Wire AR decoder to the already active stream and same state machine.
- Do not let manual floor selector or AR step selection mutate confirmed physical floor.

### PR D — Positioning engine
- Extract sensor lifecycle from ARView.
- Add PDR, heading smoothing, map matching, confidence and QR re-anchoring.
- Add permission/unsupported/paused/recovery states and deterministic tests.
- Do not claim precise or background-guaranteed tracking.

### PR E — Floor map calibration and admin publishing
- Add per-floor plan assets/transforms and calibration metadata.
- Build graph validation/reporting and safe map version publishing.
- Replace generic plan fallback where authoritative floor drawings are required.
- Require verified building plan inputs for final coordinate calibration.

### PR F — Mobile-first UI/UX
- Rebuild shared responsive shell and navigation views.
- Adapt map, search, floor selector, directions sheet, QR/AR, profile, schedule, attendance and admin.
- Add viewport smoke tests and accessibility checks.

### PR G — Live sharing and reliability
- Consent-driven live location sessions, privacy controls, rate limits, reconnect and stale expiry.
- Offline map cache, observability, production health checks and deployment/backup documentation.

### PR H — End-to-end release verification
- Browser automation on representative viewport/device profiles.
- Real Android Chrome and iOS Safari HTTPS camera/sensor testing.
- Physical campus walk tests against surveyed QR placements and route ground truth.
- Publish known limitations and release checklist.

## 6. Mandatory acceptance criteria

1. A user can search and route to a valid destination on any of the eight floors.
2. Every route edge references existing nodes; graph validation reports no dangling or invalid floor transitions.
3. A* returns the same shortest path cost as Dijkstra for tested metric graphs, or Dijkstra is used.
4. Same-floor route polylines never bridge disconnected route runs.
5. At a stair/lift origin QR, the confirmed floor remains unchanged and the correct transit instruction is shown.
6. Only the expected landing QR for the same transit core and target floor confirms the transition.
7. Wrong, stale, unrelated and out-of-order QR codes do not change location or floor.
8. After landing confirmation, the destination floor map appears and the remaining route resumes.
9. AR QR detection uses the active camera stream and does not request a second camera.
10. 2D QR camera is opened only after explicit permission/user gesture and only while a relevant checkpoint/recovery scan is active.
11. PDR updates are labelled estimates, map-matched to valid graph geometry and corrected by QR.
12. Location sharing is opt-in, revocable, recipient-scoped and expires safely.
13. Mobile UI passes the defined viewport suite without horizontal overflow or obscured primary controls.
14. Frontend lint/build, backend syntax/unit tests and integration tests pass in CI.
15. Android Chrome and iOS Safari physical-device checks are recorded; campus map/QR calibration is verified on site.

## 7. External inputs needed for a genuinely accurate deployment

The repository alone cannot prove real-world floor-plan geometry or QR placement. Before final production accuracy sign-off, obtain:
- Approved current architectural floor plans for GF–7F, preferably vector/PDF with scale and revision.
- Confirmation of staircase/lift core IDs and landing positions on every floor.
- Physical QR inventory and exact installed location for each code.
- A small surveyed walking test set (start/end points, route distances, floor transitions and known obstructions).
- The production HTTPS domain and deployment environment details.

## 8. Audit conclusion

SICN already has a meaningful foundation: React/Vite, Express/MongoDB, multi-floor graph data, A* routing, QR lookup, AR camera guidance, Socket.IO sharing, attendance and role-protected admin operations. The main blockers are not a lack of features; they are correctness boundaries and missing verification: QR floor-transition state, sensor positioning confidence, map-coordinate calibration, route geometry, complete responsive QA and CI coverage.

Implement in the PR order above. Keep every PR small enough to test and review independently. Do not merge a PR solely because it compiles; require the relevant acceptance tests and clearly record any physical-device or surveyed-map checks that cannot be automated.
