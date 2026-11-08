import unittest
from pathlib import Path
import tempfile
import sys
import fitz
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from extract_floorplan_geometry import extract_pdf

class PdfGeometryExtractionTests(unittest.TestCase):
    def test_extracts_page_text_and_vector_primitives_without_metric_claims(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "sample.pdf"
            doc = fitz.open()
            page = doc.new_page(width=600, height=800)
            page.insert_text((40, 50), "ROOM 101 3.00m x 4.00m")
            page.draw_line((40, 100), (240, 100), color=(0, 0, 0), width=1)
            page.draw_rect(fitz.Rect(40, 120, 240, 220), color=(0, 0, 0), width=1)
            doc.save(source)
            report = extract_pdf(source, root / "out")
            page_report = report["pages"][0]
            self.assertEqual(report["page_count"], 1)
            self.assertEqual(page_report["raw_line_segment_occurrences"], 1)
            self.assertGreaterEqual(len(page_report["rectangle_paths_compact"]), 1)
            self.assertTrue(page_report["dimension_like_text"])
            self.assertTrue(report["not_metric_coordinates"])

if __name__ == "__main__":
    unittest.main()
