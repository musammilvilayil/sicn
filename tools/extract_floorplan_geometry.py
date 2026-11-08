#!/usr/bin/env python3
"""Extract auditable PDF primitives without guessing their architectural meaning."""
from __future__ import annotations
import argparse
import json
import re
from pathlib import Path
import fitz

DIMENSION_RE = re.compile(r"(?<![A-Za-z])(?:\d+(?:\.\d+)?)\s*(?:mm|cm|m|')?(?:\s*[x×]\s*\d+(?:\.\d+)?)?", re.I)
ROOM_LABEL_RE = re.compile(r"\b(room|lab|office|class|toilet|library|store|staff|hall|corridor|lobby|stair|lift|reception)\b", re.I)

def serialise_color(value):
    return list(value) if value is not None else None

def extract_page(page):
    text_dict = page.get_text("dict")
    spans = []
    for block in text_dict.get("blocks", []):
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                value = " ".join(span.get("text", "").split())
                if not value:
                    continue
                bbox = [round(float(v), 3) for v in span.get("bbox", [])]
                spans.append({
                    "text": value,
                    "bbox_pdf_points": bbox,
                    "font": span.get("font"),
                    "font_size_pdf_points": round(float(span.get("size", 0)), 3),
                    "dimension_like": bool(DIMENSION_RE.search(value)),
                    "room_or_wayfinding_label_like": bool(ROOM_LABEL_RE.search(value)),
                })
    drawings = []
    line_segments = []
    rectangles = []
    for drawing_index, drawing in enumerate(page.get_drawings()):
        rect = drawing.get("rect")
        item_types = {}
        items = []
        for item in drawing.get("items", []):
            kind = item[0]
            item_types[kind] = item_types.get(kind, 0) + 1
            if kind == "l":
                p1, p2 = item[1], item[2]
                segment = {
                    "drawing_index": drawing_index,
                    "p1_pdf_points": [round(p1.x, 3), round(p1.y, 3)],
                    "p2_pdf_points": [round(p2.x, 3), round(p2.y, 3)],
                    "stroke_width_pdf_points": round(float(drawing.get("width") or 0), 3),
                    "stroke_rgb": serialise_color(drawing.get("color")),
                    "fill_rgb": serialise_color(drawing.get("fill")),
                    "close_path": bool(drawing.get("closePath")),
                }
                line_segments.append(segment)
                items.append({"type": "line", **segment})
            elif kind == "re":
                r = item[1]
                rectangle = {
                    "drawing_index": drawing_index,
                    "rect_pdf_points": [round(r.x0, 3), round(r.y0, 3), round(r.x1, 3), round(r.y1, 3)],
                    "stroke_width_pdf_points": round(float(drawing.get("width") or 0), 3),
                    "stroke_rgb": serialise_color(drawing.get("color")),
                    "fill_rgb": serialise_color(drawing.get("fill")),
                }
                rectangles.append(rectangle)
                items.append({"type": "rectangle", **rectangle})
            else:
                # Preserve the operation type and let reviewers inspect the source drawing.
                items.append({"type": str(kind)})
        drawings.append({
            "drawing_index": drawing_index,
            "bbox_pdf_points": [round(v, 3) for v in rect] if rect else None,
            "operation_counts": item_types,
            "item_count": len(drawing.get("items", [])),
            "stroke_width_pdf_points": round(float(drawing.get("width") or 0), 3),
            "stroke_rgb": serialise_color(drawing.get("color")),
            "fill_rgb": serialise_color(drawing.get("fill")),
            "items": items,
        })
    return {
        "page_number": page.number + 1,
        "page_rect_pdf_points": [round(page.rect.x0, 3), round(page.rect.y0, 3), round(page.rect.x1, 3), round(page.rect.y1, 3)],
        "rotation_degrees": page.rotation,
        "text_spans": spans,
        "drawing_count": len(drawings),
        "line_segment_count": len(line_segments),
        "rectangle_count": len(rectangles),
        "drawings": drawings,
        "line_segments": line_segments,
        "rectangles": rectangles,
        "dimension_like_text": [s for s in spans if s["dimension_like"]],
        "room_or_wayfinding_label_like_text": [s for s in spans if s["room_or_wayfinding_label_like"]],
    }

def extract_pdf(pdf_path: Path, output_dir: Path):
    doc = fitz.open(pdf_path)
    pages = [extract_page(page) for page in doc]
    output_dir.mkdir(parents=True, exist_ok=True)
    for page, page_data in zip(doc, pages):
        pix = page.get_pixmap(matrix=fitz.Matrix(1.25, 1.25), alpha=False)
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
    reports = []
    for pdf_path in pdfs:
        report = extract_pdf(pdf_path, output_dir)
        json_path = output_dir / f"{pdf_path.stem.replace(' ', '_')}.geometry.json"
        json_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
        reports.append({
            "source_pdf": pdf_path.name,
            "page_count": report["page_count"],
            "pages": [{
                "page_number": page["page_number"],
                "drawing_count": page["drawing_count"],
                "line_segment_count": page["line_segment_count"],
                "rectangle_count": page["rectangle_count"],
                "text_span_count": len(page["text_spans"]),
                "dimension_annotation_count": len(page["dimension_like_text"]),
                "room_or_wayfinding_label_count": len(page["room_or_wayfinding_label_like_text"]),
            } for page in report["pages"]],
        })
    summary = {
        "schema_version": 1,
        "extraction": "PDF text spans and vector primitives",
        "coordinate_system": "pdf_page_points_top_left_origin",
        "metric_calibration_performed": False,
        "architectural_semantics_assigned": False,
        "warning": "Vector lines/rectangles are raw candidates only. They are not classified as walls, doors, fences, room boundaries or walkable corridors without visual review and calibrated source evidence.",
        "files": reports,
    }
    (output_dir / "extraction-summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
