#!/usr/bin/env python3
"""Extract compact, auditable PDF text/vector candidates without guessing semantics."""
from __future__ import annotations
import argparse
import hashlib
import json
import re
from pathlib import Path
import fitz

DIMENSION_RE = re.compile(r"^\s*\d+(?:\.\d+)?\s*[xX×]\s*\d+(?:\.\d+)?\s*$")
FLOOR_TITLE_RE = re.compile(r"\b(GROUND|FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH)\s+FLOOR\s+PLAN\b", re.I)
ROOM_LABEL_RE = re.compile(
    r"\b(room|lab|office|class|toilet|library|store|staff|hall|corridor|lobby|stair|lift|reception|"
    r"principal|conference|waiting|department|pantry|records|valuation|drawing|rest|HOD|balcony|"
    r"faculty|hostel|kitchen|workshop|auditorium|passage|security|account|computer)\b", re.I
)

def rgb_key(value):
    return tuple(round(float(v), 3) for v in value) if value is not None else None

def bbox_center(bbox):
    return ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2)

def extract_page(page):
    spans = []
    raw = page.get_text("dict")
    for block in raw.get("blocks", []):
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                value = " ".join(span.get("text", "").split())
                if not value:
                    continue
                bbox = [round(float(v), 2) for v in span.get("bbox", [])]
                spans.append({
                    "text": value,
                    "bbox_pdf_points": bbox,
                    "font": span.get("font"),
                    "font_size_pdf_points": round(float(span.get("size", 0)), 2),
                })

    styles, style_ids = [], {}
    line_counts, curve_paths, rectangle_paths = {}, [], []
    operation_counts = {}
    drawing_count = 0
    for drawing_index, drawing in enumerate(page.get_drawings()):
        drawing_count += 1
        style = (
            rgb_key(drawing.get("color")),
            rgb_key(drawing.get("fill")),
            round(float(drawing.get("width") or 0), 2),
            bool(drawing.get("closePath")),
        )
        if style not in style_ids:
            style_ids[style] = len(styles)
            styles.append({
                "stroke_rgb": list(style[0]) if style[0] is not None else None,
                "fill_rgb": list(style[1]) if style[1] is not None else None,
                "stroke_width_pdf_points": style[2],
                "close_path": style[3],
            })
        style_id = style_ids[style]
        for item in drawing.get("items", []):
            kind = item[0]
            operation_counts[kind] = operation_counts.get(kind, 0) + 1
            if kind == "l":
                p1, p2 = item[1], item[2]
                coords = tuple(round(v, 2) for v in (p1.x, p1.y, p2.x, p2.y))
                # Canonicalise direction so identical hatch strokes collapse into one record.
                reverse = (coords[2], coords[3], coords[0], coords[1])
                if reverse < coords:
                    coords = reverse
                key = (coords, style_id)
                line_counts[key] = line_counts.get(key, 0) + 1
            elif kind == "c":
                points = item[1:]
                curve_paths.append([round(v, 2) for point in points for v in (point.x, point.y)] + [style_id])
            elif kind == "re":
                rect = item[1]
                rectangle_paths.append([round(v, 2) for v in (rect.x0, rect.y0, rect.x1, rect.y1)] + [style_id])
    line_segments = [list(coords) + [style_id, count] for (coords, style_id), count in line_counts.items()]

    dimensions = [s for s in spans if DIMENSION_RE.match(s["text"])]
    labels = [s for s in spans if ROOM_LABEL_RE.search(s["text"]) and not DIMENSION_RE.match(s["text"])]
    room_candidates = []
    for label in labels:
        lx, ly = bbox_center(label["bbox_pdf_points"])
        nearby = []
        for dim in dimensions:
            dx, dy = bbox_center(dim["bbox_pdf_points"])
            distance = ((lx - dx) ** 2 + (ly - dy) ** 2) ** 0.5
            if distance <= 100:
                nearby.append((distance, dim))
        nearby.sort(key=lambda pair: pair[0])
        room_candidates.append({
            "label": label["text"],
            "label_bbox_pdf_points": label["bbox_pdf_points"],
            "nearby_dimension_candidates": [
                {"text": dim["text"], "bbox_pdf_points": dim["bbox_pdf_points"], "annotation_gap_pdf_points": round(distance, 2)}
                for distance, dim in nearby[:3]
            ],
            "review_required": True,
            "note": "Text annotation anchor only; not a room centre, polygon, door or navigable node.",
        })
    title_spans = [s for s in spans if FLOOR_TITLE_RE.search(s["text"])]
    for candidate in room_candidates:
        cx, cy = bbox_center(candidate["label_bbox_pdf_points"])
        nearest_title = min(
            title_spans,
            key=lambda title: ((cx - bbox_center(title["bbox_pdf_points"])[0]) ** 2 +
                               (cy - bbox_center(title["bbox_pdf_points"])[1]) ** 2) ** 0.5,
            default=None,
        )
        if nearest_title:
            tx, ty = bbox_center(nearest_title["bbox_pdf_points"])
            candidate["nearest_floor_plan_title"] = nearest_title["text"]
            candidate["floor_title_gap_pdf_points"] = round(((cx - tx) ** 2 + (cy - ty) ** 2) ** 0.5, 2)
    unit_notes = [s["text"] for s in spans if re.search(r"ALL DIMENSIONS.*CM", s["text"], re.I)]
    return {
        "page_number": page.number + 1,
        "page_rect_pdf_points": [round(v, 2) for v in (page.rect.x0, page.rect.y0, page.rect.x1, page.rect.y1)],
        "rotation_degrees": page.rotation,
        "floor_plan_titles_detected": [s["text"] for s in title_spans],
        "dimension_unit_notes_detected": unit_notes,
        "text_spans": spans,
        "dimension_annotations": dimensions,
        "room_annotation_candidates": room_candidates,
        "drawing_count": drawing_count,
        "drawing_operation_counts": operation_counts,
        "vector_style_table": styles,
        "line_segments_compact": line_segments,
        "curve_paths_compact": curve_paths,
        "rectangle_paths_compact": rectangle_paths,
        "unique_line_segment_count": len(line_segments),
        "raw_line_segment_occurrences": sum(line_counts.values()),
        "not_metric_coordinates": True,
    }

def extract_pdf(pdf_path: Path, output_dir: Path):
    doc = fitz.open(pdf_path)
    pages = [extract_page(page) for page in doc]
    output_dir.mkdir(parents=True, exist_ok=True)
    for page in doc:
        pix = page.get_pixmap(matrix=fitz.Matrix(1.0, 1.0), alpha=False)
        pix.save(output_dir / f"{pdf_path.stem.replace(' ', '_')}_page_{page.number + 1:02d}.png")
    return {
        "source_pdf": str(pdf_path),
        "pdf_metadata": doc.metadata,
        "page_count": len(doc),
        "extraction_coordinate_system": "pdf_page_points_top_left_origin",
        "not_metric_coordinates": True,
        "pages": pages,
    }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", default="floorplan")
    parser.add_argument("--output-dir", default="artifacts/floorplan-extraction")
    args = parser.parse_args()
    input_dir, output_dir = Path(args.input_dir), Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    pdfs = sorted(input_dir.glob("*.pdf"))
    if not pdfs:
        raise SystemExit(f"No PDF files found in {input_dir}")
    reports, seen_hashes, duplicate_files = [], {}, []
    for pdf_path in pdfs:
        digest = hashlib.sha256(pdf_path.read_bytes()).hexdigest()
        if digest in seen_hashes:
            duplicate_files.append({"duplicate_pdf": pdf_path.name, "identical_to": seen_hashes[digest], "sha256": digest})
            continue
        seen_hashes[digest] = pdf_path.name
        report = extract_pdf(pdf_path, output_dir)
        json_path = output_dir / f"{pdf_path.stem.replace(' ', '_')}.geometry.json"
        json_path.write_text(json.dumps(report, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
        reports.append({
            "source_pdf": pdf_path.name,
            "sha256": digest,
            "page_count": report["page_count"],
            "pages": [{
                "page_number": page["page_number"],
                "floor_plan_titles_detected": page["floor_plan_titles_detected"],
                "drawing_count": page["drawing_count"],
                "raw_line_segment_occurrences": page["raw_line_segment_occurrences"],
                "unique_line_segment_count": page["unique_line_segment_count"],
                "curve_path_count": len(page["curve_paths_compact"]),
                "rectangle_path_count": len(page["rectangle_paths_compact"]),
                "text_span_count": len(page["text_spans"]),
                "dimension_annotation_count": len(page["dimension_annotations"]),
                "room_annotation_candidate_count": len(page["room_annotation_candidates"]),
                "room_candidates_by_floor_title": {title: sum(1 for item in page["room_annotation_candidates"] if item.get("nearest_floor_plan_title") == title) for title in page["floor_plan_titles_detected"]},
            } for page in report["pages"]],
        })
    summary = {
        "schema_version": 2,
        "extraction": "PDF text spans, dimension annotation candidates and compact vector primitives",
        "coordinate_system": "pdf_page_points_top_left_origin",
        "metric_calibration_performed": False,
        "architectural_semantics_assigned": False,
        "warning": "Text and vector primitives are candidates only. They are not classified as walls, doors, fences, room boundaries or walkable corridors without visual review and calibrated source evidence.",
        "duplicate_files": duplicate_files,
        "files": reports,
    }
    (output_dir / "extraction-summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
