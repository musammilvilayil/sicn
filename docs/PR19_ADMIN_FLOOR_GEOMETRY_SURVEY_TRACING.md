# PR #19 — Admin floor-plan survey tracing

## Delivered
- Adds an Admin-only PDF tracing mode inside the calibrated floor-plan viewer.
- Lets an administrator trace candidate wall boundaries, fence boundaries, door openings, corridor centrelines, room footprints and room-label anchors.
- Saves and reloads traces per floor, source PDF and page.
- Renders saved candidates on the PDF with distinct visual styles; supports undo, clear and delete.
- Stores normalized PDF coordinates with source-page provenance. Backend validates floor, page, feature type, point counts and normalized coordinate bounds.
- Removes the byte-identical duplicate 6th/7th-floor PDF; the canonical file referenced by the frontend and manifest remains.

## Important accuracy boundary
The tracing interface stores `pdf_normalized` coordinates only. It is an annotation/review layer, not a metric survey. These traces must not be fed into routing or treated as measured metres until each page has a metric calibration and the candidate wall/door/corridor geometry is reviewed. Physical route lengths and QR sticker positions still require on-site measurement and verification.
