import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("build_floorplan_assets", ROOT / "tools" / "build_floorplan_assets.py")
assets = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = assets
SPEC.loader.exec_module(assets)


def stroke(points, width=assets.WALL):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return {"fill": None, "stroke": assets.BLACK, "width": width, "subs": [points],
            "bb": (min(xs), min(ys), max(xs), max(ys))}


def arrow(x, y):
    points = [(x, y), (x + 0.25, y + 0.06), (x + 0.25, y - 0.06), (x, y)]
    return {"fill": assets.BLACK, "stroke": assets.BLACK, "width": assets.FINE, "subs": [points],
            "bb": (x, y - 0.06, x + 0.25, y + 0.06)}


class CleaningTest(unittest.TestCase):
    def test_keeps_walls_and_removes_drafting_annotations(self):
        wall = stroke([(45.0, 10.0), (60.0, 10.0)])
        fixture = stroke([(50.0, 12.0), (50.3, 12.2), (50.6, 12.0)], assets.FINE)
        # Interior dimension line: two pieces split around the figure, arrowheads at both ends.
        dim_a = stroke([(50.0, 15.0), (52.0, 15.0)])
        dim_b = stroke([(53.0, 15.0), (55.0, 15.0)])
        arrows = [arrow(49.75, 15.0), arrow(55.0, 15.0)]
        # A piece that only continues the dimension line (no arrowhead of its own).
        dim_mid = stroke([(52.2, 15.0), (52.8, 15.0)])
        dashes = [stroke([(46.0 + i * 0.25, 18.0), (46.1 + i * 0.25, 18.0)]) for i in range(8)]
        outside = stroke([(45.0, 10.0), (80.0, 10.0)])
        red = {**stroke([(45.0, 11.0), (60.0, 11.0)]), "stroke": assets.RED}
        grey = {**stroke([(45.0, 12.0), (60.0, 12.0)]), "stroke": assets.GREY}

        kept = assets.clean(9, [wall, fixture, dim_a, dim_b, dim_mid, *arrows, *dashes, outside, red, grey])
        self.assertEqual({id(p) for p in kept}, {id(wall), id(fixture)})

    def test_point_in_hull(self):
        self.assertTrue(assets.inside(assets.HULL, 55.0, 20.0))    # east wing
        self.assertTrue(assets.inside(assets.HULL, 15.0, 15.0))    # west wing
        self.assertFalse(assets.inside(assets.HULL, 55.0, 38.0))   # north of the east wing
        self.assertFalse(assets.inside(assets.HULL, 70.0, 20.0))


class OutputTest(unittest.TestCase):
    def test_path_data_is_integer_centimetres_with_y_down(self):
        data = assets.path_data([[(0.0, 42.0), (1.0, 42.0), (1.0, 41.0)], [(2.0, 0.0), (2.0, 0.0)]])
        self.assertEqual(data, "M0 0l100 0 0 100")

    def test_frame_matches_the_one_to_hundred_scale(self):
        self.assertAlmostEqual(assets.PT_PER_M, 28.3465, places=4)
        self.assertEqual(sorted(assets.FLOORS), list(range(8)))

    def test_annotation_selection_skips_texts_covered_by_nodes(self):
        nodes = [
            {"floor": 0, "type": "lab", "name": "CAD Lab", "coordinates": {"x": 24.0, "y": 29.5}},
            {"floor": 0, "type": "restroom", "name": "Toilets", "coordinates": {"x": 32.3, "y": 23.4}},
            {"floor": 0, "type": "corridor", "name": "West Passage", "coordinates": {"x": 19.4, "y": 23.8}},
        ]
        labels = [(23.9, 29.0, "CAD LAB"), (31.3, 24.4, "Toilet"), (48.8, 30.7, "TOILET"),
                  (19.5, 23.5, "2.76 M WIDE PASSAGE"), (57.0, 14.0, "STORE ROOM")]
        selected = assets.select_annotations(0, labels, nodes)
        self.assertEqual([item["text"] for item in selected], ["WC", "2.76 m wide passage", "Store Room"])

    def test_generated_assets_are_in_sync_with_the_frame(self):
        for floor in range(8):
            plan = json.loads((assets.OUT_DIR / f"floor-{floor}.json").read_text())
            self.assertEqual(plan["frame"]["id"], assets.FRAME_ID)
            self.assertEqual(plan["source"], f"floorplan/{assets.FLOORS[floor][0]}")
            self.assertTrue(plan["layers"]["wall"].startswith("M"))


if __name__ == "__main__":
    unittest.main()
