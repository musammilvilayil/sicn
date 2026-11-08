# PR #18 — PDF vector extraction and review pipeline

## Delivered
- Automated extraction of text spans, dimension-like annotations, drawing operations, vector line segments and rectangle primitives from every checked-in floor-plan PDF.
- Per-page page bounds, rotation, text bounding boxes and vector coordinates are retained in PDF page points.
- Raster page previews are generated for visual review.
- GitHub Actions uploads the machine-readable reports and previews as the `floorplan-vector-extraction` artifact.
- A synthetic PDF test verifies text, dimensions, lines, rectangles and the non-metric coordinate declaration.

## Accuracy and safety
PDF point coordinates are not metres. This pipeline does not infer which vector strokes are walls, fences, doors, room boundaries or walkable corridors. It does not automatically connect endpoints or derive room centroids. Architectural semantics must be assigned only after a human reviews each page preview and the corresponding source geometry. Metric calibration must be performed independently per page using multiple known dimensions and a recorded residual error. Physical route distances still require a site walkthrough.

## CI usage
Every PR and main CI run extracts all PDFs under `floorplan/` and publishes JSON plus PNG previews for 14 days. This makes source inspection repeatable and exposes whether a drawing is vector-based or mostly raster/text.
