#!/usr/bin/env python3
"""Generate the in-app floor-plan line work from the architectural PDFs.

For every floor (GF-7F) this tool

1. converts the source sheet to SVG with poppler's ``pdftocairo`` and reads the
   vector paths (walls, doors, windows, stairs, sanitary fixtures);
2. rotates the sheet upright and translates the floor drawing into the shared
   building frame used by the navigation graph (metres, 1:100 drawings, so
   72 pt = 2.54 m);
3. removes drafting annotations that are not part of the building: dimension
   lines and arrowheads, dashed section lines, the red extension outline, grey
   hatching, title blocks and everything outside the building hull;
4. writes ``frontend/src/data/floorplans/floor-<n>.json`` with compact SVG path
   data (centimetres, y pointing down) plus the room-name texts that are not
   already covered by a navigation node.

Requirements: ``pdftocairo`` (poppler-utils) and ``pdfplumber``.

    python tools/build_floorplan_assets.py

The per-floor sheet offsets in ``FLOORS`` were found by cross-correlating the
wall line work of each floor against the ground floor (translation only; all
sheets share the same scale and orientation). ``--check-registration``
re-derives them with numpy/Pillow and reports the difference.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
PLAN_DIR = REPO / "floorplan"
OUT_DIR = REPO / "frontend" / "src" / "data" / "floorplans"
SEED_PATH = REPO / "backend" / "src" / "data" / "seedData.json"

FRAME_ID = "bji-main-block-plan-1to100-v1"
PT_PER_M = 72 / 2.54          # 1:100 drawing: 1 m = 10 mm on paper
SHEET_WIDTH_PT = 2384.0       # portrait A0 page width; content is rotated 90 degrees
FRAME_X0_PT = 60.0            # frame origin inside the registered floor window
FRAME_Y1_PT = 1170.0
EXTENT_M = (66.0, 42.0)       # frame width / height in metres
CM = 100

GF = "BJI_BUILDING PLAN 01 GF MAIN BLOCK_04022026.pdf"
F1 = "BJI_BUILDING PLAN 0000_1ST FLOOR MAIN BLOCK_04022026.pdf"
F23 = "BJI_MAIN_BLOCK_2ND_&_3RD_FLOOR_BUILDING_PLAN_00000_04022026.pdf"
F45 = "BJI_BUILDING_PLAN_0002_4TH_&_5TH_FLOOR_MAIN_BLOCK_04022026.pdf"
F67 = "BJI_BUILDING_PLAN_003_6TH_&_7TH_FLOOR_MAIN_BLOCK_04022026.pdf"

# floor -> (sheet, label, upright-sheet offset of the floor window in pt)
FLOORS = {
    0: (GF, "Ground Floor", (150, 1100)),
    1: (F1, "1st Floor", (272, 961)),
    2: (F23, "2nd Floor", (53, 58)),
    3: (F23, "3rd Floor", (940, 1190)),
    4: (F45, "4th Floor", (74, 50)),
    5: (F45, "5th Floor", (948, 1209)),
    6: (F67, "6th Floor", (350, 23)),
    7: (F67, "7th Floor", (920, 1162)),
}

# Building outline with roughly one metre of margin (metres, clockwise). Anything
# with a vertex outside it is drafting annotation, not building.
HULL = [
    (-0.3, 28.4), (6.4, 36.6), (7.6, 38.9), (10.6, 39.9), (13.4, 38.9), (14.4, 36.0),
    (12.8, 31.5), (13.3, 30.2), (17.0, 40.6), (17.6, 41.5), (36.0, 33.6), (66.3, 33.7),
    (66.3, 5.8), (49.0, 5.8), (49.0, 4.8), (38.6, 4.8), (38.6, 6.3), (35.4, 6.5),
    (35.4, 4.2), (30.7, 4.9), (30.5, 5.9), (25.6, 6.4), (25.3, 5.9), (22.6, 6.6),
    (20.6, 0.6), (19.5, 0.4), (2.0, 8.6), (2.4, 10.5), (8.3, 22.0), (7.4, 23.3),
    (4.0, 25.4), (0.3, 27.3),
]

# Leftover annotation fragments, removed by bounding box (metres).
ERASE = {
    0: [(40.5, 24.5, 41.6, 33.0), (44.9, 14.9, 45.6, 15.6)],
}

# Texts replaced or added by hand (floor -> list of (x, y, text)).
EXTRA_LABELS = {
    6: [(56.5, 27.0, "5th floor terrace (below)")],
    7: [(56.5, 27.0, "5th floor terrace (below)"), (15.5, 12.0, "Seminar hall roof")],
}
DROP_LABELS = {
    6: {"FIFTH FLOOR OPEN TERRACE"},
    7: {"OPEN TERRACE"},
}

WALL, DETAIL, FINE = 0.72, 0.48, 0.12
BLACK, GREY, RED, CYAN = (0, 0, 0), (152, 152, 152), (255, 0, 0), (0, 255, 255)

_ATTR = re.compile(r'([\w:-]+)="([^"]*)"')
_TOKEN = re.compile(r"[MLCZ]|-?[\d.]+(?:e-?\d+)?")


# --------------------------------------------------------------------------- #
# PDF -> primitives
# --------------------------------------------------------------------------- #

def _rgb(value):
    if not value or value == "none":
        return None
    match = re.match(r"rgb\(([\d.]+)%, ([\d.]+)%, ([\d.]+)%\)", value)
    return tuple(round(float(part) * 2.55) for part in match.groups())


def _bezier(p0, p1, p2, p3, steps=6):
    points = []
    for i in range(1, steps + 1):
        t = i / steps
        a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3
        points.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
                       a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return points


def read_sheet(pdf_name):
    """Return the sheet's vector paths in upright sheet coordinates (pt)."""
    with tempfile.TemporaryDirectory() as tmp:
        svg_path = Path(tmp) / "sheet.svg"
        subprocess.run(["pdftocairo", "-svg", str(PLAN_DIR / pdf_name), str(svg_path)], check=True)
        text = svg_path.read_text()
    body = text[text.index("</defs>"):]
    primitives = []
    for match in re.finditer(r"<path ([^>]*)/>", body):
        attrs = dict(_ATTR.findall(match.group(1)))
        matrix = (1, 0, 0, 1, 0, 0)
        if attrs.get("transform"):
            matrix = tuple(float(v) for v in re.findall(r"-?[\d.]+", attrs["transform"]))

        def upright(x, y, m=matrix):
            x, y = float(x), float(y)
            px, py = m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]
            return (py, SHEET_WIDTH_PT - px)   # rotate the page 90 degrees counter-clockwise

        tokens = _TOKEN.findall(attrs["d"])
        subpaths, current, i = [], None, 0
        while i < len(tokens):
            command = tokens[i]
            if command == "M":
                current = [upright(tokens[i + 1], tokens[i + 2])]
                subpaths.append(current)
                i += 3
            elif command == "L":
                current.append(upright(tokens[i + 1], tokens[i + 2]))
                i += 3
            elif command == "C":
                current += _bezier(current[-1], upright(tokens[i + 1], tokens[i + 2]),
                                   upright(tokens[i + 3], tokens[i + 4]), upright(tokens[i + 5], tokens[i + 6]))
                i += 7
            else:  # Z
                current.append(current[0])
                i += 1
        stroke = _rgb(attrs.get("stroke"))
        width = round(float(attrs.get("stroke-width", 0)) * abs(matrix[0]), 3) if stroke else 0
        if subpaths:
            primitives.append({"fill": _rgb(attrs.get("fill")), "stroke": stroke, "width": width, "subs": subpaths})
    return primitives


def to_frame(floor, primitives):
    """Translate one floor's window of the sheet into frame metres (y up)."""
    ox, oy = FLOORS[floor][2]
    x0, y0, x1, y1 = ox - 80, oy - 80, ox + 2200, oy + 1330
    out = []
    for prim in primitives:
        xs = [p[0] for sub in prim["subs"] for p in sub]
        ys = [p[1] for sub in prim["subs"] for p in sub]
        if max(xs) < x0 or min(xs) > x1 or max(ys) < y0 or min(ys) > y1:
            continue
        subs = [[((u - ox - FRAME_X0_PT) / PT_PER_M, (FRAME_Y1_PT - (v - oy)) / PT_PER_M) for u, v in sub]
                for sub in prim["subs"]]
        fx = [p[0] for sub in subs for p in sub]
        fy = [p[1] for sub in subs for p in sub]
        out.append({**prim, "subs": subs, "bb": (min(fx), min(fy), max(fx), max(fy))})
    return out


# --------------------------------------------------------------------------- #
# Cleaning
# --------------------------------------------------------------------------- #

def inside(polygon, x, y):
    result, j = False, len(polygon) - 1
    for i, (xi, yi) in enumerate(polygon):
        xj, yj = polygon[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            result = not result
        j = i
    return result


def _line_key(segment):
    (x0, y0), (x1, y1) = segment
    angle = math.atan2(y1 - y0, x1 - x0) % math.pi
    if angle > math.pi - 0.005:   # keep near-horizontal lines in one bucket
        angle -= math.pi
    return angle, x0 * math.sin(angle) - y0 * math.cos(angle)


def clean(floor, primitives):
    hx = [p[0] for p in HULL]
    hy = [p[1] for p in HULL]
    near = (min(hx) - 5, min(hy) - 5, max(hx) + 5, max(hy) + 5)
    primitives = [p for p in primitives
                  if not (p["bb"][2] < near[0] or p["bb"][0] > near[2] or p["bb"][3] < near[1] or p["bb"][1] > near[3])]

    # Arrowheads: small filled shapes. Dimension lines end on them.
    arrows = [p for p in primitives if p["fill"] and max(p["bb"][2] - p["bb"][0], p["bb"][3] - p["bb"][1]) < 0.75]
    arrow_ids = {id(p) for p in arrows}
    grid = {}
    for arrow in arrows:
        b = arrow["bb"]
        for gx in range(int((b[0] - 0.1) * 2), int((b[2] + 0.1) * 2) + 1):
            for gy in range(int((b[1] - 0.1) * 2), int((b[3] + 0.1) * 2) + 1):
                grid.setdefault((gx, gy), []).append(b)

    def near_arrow(point, reach=0.09):
        return any(b[0] - reach <= point[0] <= b[2] + reach and b[1] - reach <= point[1] <= b[3] + reach
                   for b in grid.get((int(point[0] * 2), int(point[1] * 2)), ()))

    candidates = [p for p in primitives
                  if id(p) not in arrow_ids
                  and (p["stroke"] in (BLACK, CYAN) or (p["stroke"] is None and p["fill"] == BLACK)
                       or (p["fill"] == BLACK and p["stroke"] == BLACK))]

    def two_point(p):
        return bool(p["subs"]) and all(len(sub) == 2 for sub in p["subs"]) and p["stroke"] == BLACK

    # Dimension lines: straight segments touching an arrowhead, then any straight
    # piece that continues one of them (the lines are split around the figure).
    dimension, lines = set(), {}

    def remember(segment):
        angle, offset = _line_key(segment)
        lines.setdefault((round(angle / 0.01), round(offset / 0.03)), []).append(segment)

    def continues(segment):
        angle, offset = _line_key(segment)
        ka, ko = round(angle / 0.01), round(offset / 0.03)
        for da in (-1, 0, 1):
            for do in (-1, 0, 1):
                for other in lines.get((ka + da, ko + do), ()):
                    gap = min(math.hypot(segment[i][0] - other[j][0], segment[i][1] - other[j][1])
                              for i in (0, 1) for j in (0, 1))
                    if gap < 1.6:
                        return True
        return False

    for p in candidates:
        if two_point(p) and any(near_arrow(sub[0]) or near_arrow(sub[1]) for sub in p["subs"]):
            dimension.add(id(p))
            for sub in p["subs"]:
                remember(sub)
    changed = True
    while changed:
        changed = False
        for p in candidates:
            if id(p) in dimension or not two_point(p):
                continue
            if any(continues(sub) for sub in p["subs"]):
                dimension.add(id(p))
                for sub in p["subs"]:
                    remember(sub)
                changed = True
    candidates = [p for p in candidates if id(p) not in dimension]

    # Dashed (section / overhead) lines: runs of five or more short collinear dashes.
    buckets = {}
    for p in candidates:
        if len(p["subs"]) == 1 and len(p["subs"][0]) == 2 and not p["fill"]:
            segment = p["subs"][0]
            length = math.hypot(segment[1][0] - segment[0][0], segment[1][1] - segment[0][1])
            if 0.02 < length < 0.42:
                angle, offset = _line_key(segment)
                buckets.setdefault((round(angle / 0.02), round(offset / 0.04)), []).append((p, segment))
    dashes = set()
    for (ka, ko), _ in buckets.items():
        members = [item for da in (-1, 0, 1) for do in (-1, 0, 1) for item in buckets.get((ka + da, ko + do), [])]
        if len(members) < 5:
            continue
        ux, uy = math.cos(ka * 0.02), math.sin(ka * 0.02)
        along = sorted(((s[0][0] + s[1][0]) / 2 * ux + (s[0][1] + s[1][1]) / 2 * uy, id(p)) for p, s in members)
        run = [along[0]]
        for previous, current in zip(along, along[1:]):
            if current[0] - previous[0] < 0.75:
                run.append(current)
            else:
                if len(run) >= 5:
                    dashes.update(i for _, i in run)
                run = [current]
        if len(run) >= 5:
            dashes.update(i for _, i in run)
    candidates = [p for p in candidates if id(p) not in dashes]

    erase = ERASE.get(floor, ())
    kept = []
    for p in candidates:
        if any(not inside(HULL, x, y) for sub in p["subs"] for x, y in sub):
            continue
        b = p["bb"]
        if any(b[0] >= e[0] and b[1] >= e[1] and b[2] <= e[2] and b[3] <= e[3] for e in erase):
            continue
        kept.append(p)
    return kept


# --------------------------------------------------------------------------- #
# Labels
# --------------------------------------------------------------------------- #

_SKIP = re.compile(
    r"[\d .]+|[WVD]\d?( V2)?|.*\d+ ?[xX] ?\d+.*|UP|A|B|RS|O|D|URINAL|WASH|Lift|C\.Shutter|1:12|"
    r"ELEVATION|SCALE.*|.*FLOOR PLAN|LAYOUT PLAN|OF B|ISHOP|JEROME|INSTITUTE|, KOLLAM|Fire escape stair|"
    r"BREAKABLE GLASS|OPEN PARAPET( WALL)?|WALL|")
_TOILET = re.compile(r"(d\.)?toilet", re.I)
_UPPER = {"KTU", "CCF", "HOD", "CS", "WC", "P.A"}


def _title(text):
    if re.match(r"[\d.]+ M ", text):          # "2.76 M WIDE PASSAGE"
        return text.lower()
    words = []
    for word in text.split():
        bare = word.strip(".,")
        words.append(word if bare.upper() in _UPPER else word.capitalize() if word.upper() != "M" else "m")
    return " ".join(words)


def read_labels(floor):
    """Room-name texts of one floor in frame metres (uses pdfplumber)."""
    import pdfplumber

    pdf_name, _, (ox, oy) = FLOORS[floor]
    runs, current = [], None
    with pdfplumber.open(PLAN_DIR / pdf_name) as pdf:
        for char in pdf.pages[0].chars:
            matrix = char["matrix"]
            angle = math.degrees(math.atan2(matrix[1], matrix[0]))
            cx, cy = (char["x0"] + char["x1"]) / 2, (char["top"] + char["bottom"]) / 2
            if current and abs(current["angle"] - angle) < 0.5 and \
                    math.hypot(cx - current["last"][0], cy - current["last"][1]) < max(char["size"], 6) * 1.6:
                current["text"] += char["text"]
                current["last"] = (cx, cy)
                current["points"].append((cx, cy))
            else:
                if current:
                    runs.append(current)
                current = {"text": char["text"], "angle": angle, "last": (cx, cy), "points": [(cx, cy)]}
    if current:
        runs.append(current)

    labels = []
    for run in runs:
        text = re.sub(r"\s+", " ", run["text"]).strip()
        if _SKIP.fullmatch(text) or text in DROP_LABELS.get(floor, ()):
            continue
        px = sum(p[0] for p in run["points"]) / len(run["points"])
        top = sum(p[1] for p in run["points"]) / len(run["points"])
        u, v = top, SHEET_WIDTH_PT - px
        x, y = (u - ox - FRAME_X0_PT) / PT_PER_M, (FRAME_Y1_PT - (v - oy)) / PT_PER_M
        if inside(HULL, x, y):
            labels.append([x, y, text])

    # Join two-line names ("PUBLIC" / "RELATION OFFICE").
    labels.sort(key=lambda item: -item[1])
    merged, used = [], set()
    for i, (x, y, text) in enumerate(labels):
        if i in used:
            continue
        for j in range(i + 1, len(labels)):
            if j in used or _TOILET.fullmatch(text) or _TOILET.fullmatch(labels[j][2]):
                continue
            if math.hypot(labels[j][0] - x, labels[j][1] - y) < 0.85:
                text = f"{text} {labels[j][2]}"
                x, y = (x + labels[j][0]) / 2, (y + labels[j][1]) / 2
                used.add(j)
        merged.append((x, y, text))
    return merged


def select_annotations(floor, labels, nodes):
    """Keep the plan texts that no labelled navigation node already covers."""
    named = [n for n in nodes if n["floor"] == floor and n["type"] != "corridor"]
    restrooms = [n for n in named if n["type"] == "restroom"]

    def distance(node, x, y):
        return math.hypot(node["coordinates"]["x"] - x, node["coordinates"]["y"] - y)

    result, toilets = [], []
    for x, y, text in labels:
        if _TOILET.fullmatch(text):
            if any(distance(n, x, y) < 8.0 for n in restrooms) or any(math.hypot(tx - x, ty - y) < 3.5 for tx, ty in toilets):
                continue
            toilets.append((x, y))
            result.append((x, y, "WC"))
            continue
        if any(distance(n, x, y) < 3.0 for n in named):
            continue
        if any(distance(n, x, y) < 12.0 and text.lower() in n["name"].lower() for n in named):
            continue
        result.append((x, y, _title(text).replace("' S", "'s").replace(" ' s", "'s")))
    result += EXTRA_LABELS.get(floor, [])
    return [{"x": round(x, 1), "y": round(y, 1), "text": text} for x, y, text in result]


# --------------------------------------------------------------------------- #
# Output
# --------------------------------------------------------------------------- #

def path_data(subpaths):
    """Compact SVG path: integer centimetres, y down, relative line segments."""
    parts = []
    for sub in subpaths:
        points = []
        for x, y in sub:
            point = (round(x * CM), round((EXTENT_M[1] - y) * CM))
            if not points or point != points[-1]:
                points.append(point)
        if len(points) < 2:
            continue
        parts.append(f"M{points[0][0]} {points[0][1]}l" + " ".join(
            f"{b[0] - a[0]} {b[1] - a[1]}" for a, b in zip(points, points[1:])))
    return "".join(parts)


def build_floor(floor, sheet_cache, nodes):
    pdf_name, label, _ = FLOORS[floor]
    if pdf_name not in sheet_cache:
        sheet_cache[pdf_name] = read_sheet(pdf_name)
    kept = clean(floor, to_frame(floor, sheet_cache[pdf_name]))
    layers = {"wall": [], "detail": [], "fine": [], "solid": []}
    for prim in kept:
        if prim["fill"]:
            layers["solid"] += prim["subs"]
        elif prim["width"] >= WALL - 0.01:
            layers["wall"] += prim["subs"]
        elif prim["width"] >= DETAIL - 0.01:
            layers["detail"] += prim["subs"]
        else:
            layers["fine"] += prim["subs"]
    return {
        "floor": floor,
        "label": label,
        "source": f"floorplan/{pdf_name}",
        "frame": {"id": FRAME_ID, "unitsPerMetre": CM, "width": int(EXTENT_M[0] * CM), "height": int(EXTENT_M[1] * CM)},
        "hull": path_data([HULL + [HULL[0]]]),
        "layers": {name: path_data(subs) for name, subs in layers.items()},
        "labels": select_annotations(floor, read_labels(floor), nodes),
    }


def check_registration(sheet_cache):
    import numpy as np
    from PIL import Image, ImageDraw

    def raster(floor):
        pdf_name, _, (ox, oy) = FLOORS[floor]
        if pdf_name not in sheet_cache:
            sheet_cache[pdf_name] = read_sheet(pdf_name)
        image = Image.new("L", (2200, 1300), 0)
        draw = ImageDraw.Draw(image)
        for prim in sheet_cache[pdf_name]:
            if prim["fill"] or prim["width"] != WALL or prim["stroke"] not in (BLACK, RED):
                continue
            for sub in prim["subs"]:
                points = [(u - ox, v - oy) for u, v in sub]
                if any(-50 < x < 2250 and -50 < y < 1350 for x, y in points):
                    draw.line(points, fill=255, width=2)
        return np.asarray(image, dtype=np.float32) / 255

    base = raster(0)
    for floor in range(1, 8):
        other = raster(floor)
        shape = (base.shape[0] * 2, base.shape[1] * 2)
        corr = np.fft.irfft2(np.fft.rfft2(base, shape) * np.conj(np.fft.rfft2(other, shape)), shape)
        dy, dx = np.unravel_index(np.argmax(corr), corr.shape)
        dy = dy - shape[0] if dy > shape[0] // 2 else dy
        dx = dx - shape[1] if dx > shape[1] // 2 else dx
        print(f"floor {floor}: residual offset dx={dx} pt, dy={dy} pt (0, 0 means registered)")


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--check-registration", action="store_true")
    parser.add_argument("--floors", type=int, nargs="*", default=list(FLOORS))
    args = parser.parse_args()
    sheet_cache = {}
    if args.check_registration:
        check_registration(sheet_cache)
        return
    nodes = json.loads(SEED_PATH.read_text())["nodes"]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for floor in args.floors:
        data = build_floor(floor, sheet_cache, nodes)
        target = OUT_DIR / f"floor-{floor}.json"
        target.write_text(json.dumps(data, separators=(",", ":")) + "\n")
        sizes = {name: len(value) for name, value in data["layers"].items()}
        print(f"floor {floor}: {target.stat().st_size / 1024:.0f} kB {sizes} labels={len(data['labels'])}")


if __name__ == "__main__":
    main()
