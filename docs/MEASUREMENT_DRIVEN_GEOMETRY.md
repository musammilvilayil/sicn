# Measurement-driven campus geometry audit

## What this delivery adds

- A reusable parser for explicit architectural dimensions already stored in node metadata.
- Unit conversion for mm, cm and m.
- Room footprint and area extraction, including compound footprints such as `400x600 cm + 276x288 cm`.
- Linear width extraction for labels such as `Width 246 cm` and `2.76m wide passage`.
- A graph audit that checks node/edge integrity, floor-transition semantics, connectivity and measurement provenance.
- A repeatable command: `npm --prefix backend run audit:geometry`.

## Important accuracy boundary

The seed dataset currently contains schematic x/y coordinates (roughly a 0–100 map space) while edge distances are stored in metres. Those coordinate systems are not interchangeable. Room width/length metadata describes the room footprint, not the position of its centre or the length of a corridor route. A room's dimensions therefore must not be used as a substitute for surveyed node coordinates or edge lengths.

The audit deliberately does **not** manufacture metric x/y coordinates or rewrite edge distances. Every existing edge without a `distanceEvidence` record is reported as unverified. This makes the remaining survey work visible rather than presenting estimated values as measured facts.

## Current source-data baseline

The checked-in seed graph contains 133 nodes and 154 edges across GF–7F. The current metadata includes explicit metric dimensions on many room/equipment nodes, corridor width labels and staircase/lift dimensions. The original architectural PDF sheets are stored under `floorplan/`.

The current graph has one connected component and no dangling edge references in the seed data. However, its 154 edge distances do not currently carry measurement provenance. That means the distances may be useful routing weights, but the repository does not establish them as surveyed measurements.

## Audit output

The JSON report includes:

- Node and edge counts and floor distribution.
- Connected-component count.
- Parsed, unparsed and missing dimension metadata.
- Parsed dimensions converted to metres and square metres.
- Invalid coordinates, duplicate identifiers, dangling edges and invalid vertical transitions.
- A warning for every edge distance that lacks explicit measurement provenance.

## Next step to reach surveyed metric geometry

A trustworthy automatic conversion from PDF drawings to graph coordinates needs a drawing parser that can inspect the actual PDF vector/text content, identify dimension-line endpoints and associate each dimension with the correct wall/room/corridor. The PDF binaries are present in the repository, but their geometry must be inspected and validated per sheet/page before coordinates can be generated. A dimension string alone cannot establish where a node lies on a floor plan.

After the drawing parser produces candidate geometry, it should emit a reviewable per-floor coordinate proposal with source page, dimension references, confidence and residual checks. Only accepted proposals should update the navigation graph. Physical walkthrough verification remains a separate release gate.
