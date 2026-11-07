# SICN 2D Compass and PDR Navigation

## Delivered in this branch

- Explicit, user-gesture sensor permission flow for DeviceOrientation and DeviceMotion (including iOS Safari permission APIs).
- Circular low-pass filtering for compass heading, avoiding the 359°/0° discontinuity.
- A per-device North reference calibration control. The user must physically align the phone with the North direction shown on the building plan before saving the reference.
- A measured 10-metre walking calibration to estimate the user's step length and store it locally.
- Step-based pedestrian dead reckoning along same-floor route edges, using the graph edge distance in metres.
- A live 2D user marker with phone-heading arrow and turn guidance.
- Route auto-framing when a route or floor changes.
- Separate route polylines for each contiguous floor segment, preventing false cross-floor line connections.
- Unit tests for compass normalization, bearings, route interpolation, distance selection and step detection.

## Safety and accuracy rules

1. PDR is an estimate, not a confirmed location. It is reset by a confirmed QR checkpoint.
2. Step tracking may advance only along same-floor walking edges.
3. A stairs/lift edge never changes the confirmed floor. The destination landing QR must confirm the floor transition.
4. If motion permission is unavailable, the compass may still work, but step progress remains manual.
5. Sensor access requires a secure HTTPS context and a user gesture. Background browser execution is not guaranteed.
6. North calibration stores a device-specific compass reference. It does not calibrate the graph geometry to the architectural PDF.

## Remaining prerequisite for surveyed accuracy

The current node coordinates are still graph coordinates (nominal 0–100 values), not verified measurements registered to the architectural PDFs. A heading calibration alone cannot make an inaccurately placed graph node accurate.

Before claiming Google-Maps-like surveyed accuracy, each PDF floor must be inspected and registered:
- confirm its actual North arrow and page rotation;
- extract the true floor drawing;
- choose surveyed control points (e.g. stair/lift cores and corridor junctions);
- calculate a per-floor pixel/metre-to-map transform;
- transform all nodes and route edges using that transform;
- verify the result against physical measurements on site.

The existing PDFs are already in `floorplan/`; do not replace them with guessed drawings. The binary drawings still need visual/vector inspection and control-point registration before this final calibration can be signed off.
