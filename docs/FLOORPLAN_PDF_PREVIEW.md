# SICN Architectural Floor Plan Sources

## In-app source preview

The map screen exposes an **Architectural Plan** preview for each floor. The Vite floor-plan asset plugin:

- serves the original PDFs from the repository's root `floorplan/` directory during local development;
- emits the same source PDFs into the production Vite build under `/floorplans/`;
- uses stable, URL-safe names so spaces and ampersands in the original file names do not affect routing.

## Floor-to-sheet registry

| Floor | Source sheet |
|---|---|
| GF | Ground-floor PDF |
| 1F | First-floor PDF |
| 2F and 3F | Shared 2nd/3rd-floor PDF |
| 4F and 5F | Shared 4th/5th-floor PDF |
| 6F and 7F | Shared 6th/7th-floor PDF |

## Important limitation

The preview is the original architectural source drawing only. It is **not yet the live navigation background** and does not prove that graph nodes, route edges, scale, rotation, or North are registered to the PDF. The paired-floor sheets are currently previewed as their complete source page; no crop or floor region is guessed.

The next calibration stage must visually inspect each page, identify the correct floor region, determine page orientation and scale, register surveyed control points, and transform graph coordinates. Physical checkpoint placement and corridor measurements must then be verified on site. Until those checks are complete, the schematic map remains the navigation map and the PDF preview is a reference.
