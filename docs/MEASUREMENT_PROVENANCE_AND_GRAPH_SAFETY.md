# Measurement provenance and graph safety

## Architectural annotation extraction

The geometry audit reads explicit unit-labelled measurements from each node's `metadata.dimensions` field, or from `metadata.description` when no dimensions field exists. It normalizes mm, cm and m to metres, computes areas only for explicit rectangular footprints, and extracts labelled stair/corridor dimensions such as width, riser and tread.

This is metadata extraction, not drawing-scale reconstruction. A room footprint does not provide its centre point, door position, corridor centreline, wall boundary or route length. No x/y coordinate or edge distance is inferred from room dimensions.

## Edge distance provenance

Every newly created navigation edge must provide:
- a positive `distance` in metres;
- `distanceEvidence.source`: `architectural_plan`, `field_measured` or `admin_estimate`;
- optional reference, measurement date and notes.

The Admin API no longer derives metres from schematic x/y values. Existing legacy edges remain available for backwards-compatible routing, but the graph audit reports them as unverified until an administrator supplies defensible evidence.

Example request body:

```json
{
  "fromNode": "GF-FOYER",
  "toNode": "GF-CORR-CENTRAL",
  "distance": 4.8,
  "distanceEvidence": {
    "source": "field_measured",
    "reference": "Ground-floor centreline measurement",
    "measuredAt": "2026-11-08T10:00:00.000Z",
    "notes": "Measured along the walkable path"
  }
}
```

## What still requires the original drawing geometry or site survey

- Extracting vector wall/door/centreline geometry from the PDF sheets and establishing page-to-floor regions.
- Registering each floor in a common metric coordinate frame.
- Replacing schematic graph coordinates with surveyed positions.
- Re-measuring each route edge along its walkable path, including turns and door approaches.
- Physical verification of QR sticker locations, stair/lift landings and mobile positioning error.

A passing CI audit means the stored data is structurally consistent; it does not certify real-world distances or indoor positioning accuracy.
