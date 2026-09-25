import importlib.util
from pathlib import Path
import tempfile
import unittest
import openpyxl

spec = importlib.util.spec_from_file_location("extract_miph", Path(__file__).parents[1] / "scripts/extract-miph.py")
extractor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extractor)


class ExtractionTests(unittest.TestCase):
    def test_headers_duplicates_and_formulas(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test.xlsx"
            book = openpyxl.Workbook()
            book.remove(book.active)
            headers = ["N°ENREGISTREMENT", "NOM DE MARQUE", "DENOMINATION COMMUNE INTERNATIONALE",
                       "FORME", "DOSAGE", "CONDITIONNEMENT",
                       "LABORATOIRES DETENTEUR DE LA DECISION D'ENREGISTREMENT"]
            for name in ["Nomenclature test", "Non Renouvelés", "Retraits"]:
                sheet = book.create_sheet(name)
                sheet.append(["title"])
                sheet.append(headers)
                sheet.append(["001/TEST", "  Médicament  ", "Ingredient", "COMP", "1MG", "B/10", "Holder"])
            book.worksheets[1]["E3"] = "=1+1"
            book.save(path)
            result = extractor.extract(path, "test", "https://example.com")
            self.assertEqual(len(result["records"]), 3)
            self.assertTrue(all("duplicate_registration_requires_review" in r["issues"] for r in result["records"]))
            self.assertIn("formula_in_source_row", result["records"][1]["issues"])
            self.assertEqual(result["records"][0]["candidate"]["normalizedName"], "médicament")
            self.assertEqual(result["records"][0]["raw"]["NOM DE MARQUE"], "  Médicament  ")
            self.assertNotIn("manufacturerId", result["records"][0]["candidate"])
            self.assertEqual(result["records"][2]["candidate"]["status"], "INACTIVE")

            book.worksheets[0]["E3"] = 0.015
            book.worksheets[0]["E3"].number_format = "0.0%"
            book.worksheets[1]["E3"] = 0.015
            book.worksheets[1]["E3"].number_format = "General"
            book.worksheets[2]["E3"] = "X" * 150
            book.save(path)
            result = extractor.extract(path, "test", "https://example.com")
            self.assertEqual(result["records"][0]["candidate"]["strength"], "1.5%")
            self.assertEqual(result["records"][0]["raw"]["DOSAGE"], 0.015)
            self.assertEqual(result["records"][0]["rawNumberFormats"]["DOSAGE"], "0.0%")
            self.assertIn("strength_without_unit_requires_review", result["records"][1]["issues"])
            self.assertNotIn("too_long_strength", result["records"][2]["issues"])


if __name__ == "__main__":
    unittest.main()
