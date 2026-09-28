import csv
import json
import tempfile
import unittest
from fractions import Fraction
from io import StringIO
from pathlib import Path
from zipfile import ZipFile

import openpyxl

from pipeline.statistics import (
    BANDS, STOCK_COLUMNS, STOCK_MEMBER, build_statistics, make_area, money_pence,
    read_lookup, read_prices, read_stock, stock_values, validate_parent_groups,
)

ROOT = Path(__file__).resolve().parents[1]


def source_stock(counts=None, total="4420"):
    return {"code": "E02002830", "rawCounts": dict(zip(BANDS, counts or
             ["2570", "820", "460", "140", "210", "180", "30", "10"])),
            "rawReportedTotal": total}


def area_inputs():
    return dict(code="E02002830", name="Example", geography="MSOA", parent="E06000016",
                price={"rawValue": 246000}, stock=source_stock(),
                charge={"bandDPence": 252875, "rawComponents": {
                    "Z": "2121.87", "AH": "0", "AI": "315.23", "AJ": "91.65", "AK": "0"}})


class StatisticsUnitTests(unittest.TestCase):
    def test_money_removes_serialization_noise_and_rounds_half_up(self):
        self.assertEqual(money_pence("2511.3200000000002"), 251132)
        self.assertEqual(money_pence("0.005"), 1)
        self.assertEqual(money_pence("-0.005"), -1)
        for raw in (None, "", "[x]", "nan", "Infinity", True):
            self.assertIsNone(money_pence(raw))

    def test_exact_weighting_uses_band_sum_not_reported_total(self):
        inputs = area_inputs()
        inputs["stock"]["rawReportedTotal"] = "4410"
        area = make_area(**inputs)
        self.assertEqual(area["councilTaxExactPence"], {"numerator": 7779625, "denominator": 39})
        self.assertEqual(area["sourceRefs"]["stock"]["reconciliationDifference"], 10)
        self.assertEqual(area["availability"], "available")

    def test_markers_preserved_without_fallback(self):
        for marker, reason in (("-", "stock-marker-unverified"), ("[c]", "stock-suppressed"),
                               ("?", "source-value-unrecognised"), ("1.5", "source-value-unrecognised"),
                               ("-1", "source-value-unrecognised"), ("", "stock-unavailable")):
            with self.subTest(marker=marker):
                inputs = area_inputs()
                inputs["stock"]["rawCounts"]["H"] = marker
                area = make_area(**inputs)
                self.assertEqual(area["sourceRefs"]["stock"]["rawCounts"]["H"], marker)
                self.assertIn(reason, area["unavailableReasons"])
                self.assertIsNone(area["councilTaxExactPence"])

    def test_numeric_zero_is_not_suppressed(self):
        inputs = area_inputs()
        inputs["stock"] = source_stock(["10"] + ["0"] * 7, "10")
        area = make_area(**inputs)
        self.assertEqual(area["availability"], "available")
        self.assertEqual(area["councilTaxExactPence"], {"numerator": 505750, "denominator": 3})

    def test_zero_denominator_withholds_result(self):
        inputs = area_inputs()
        inputs["stock"] = source_stock(["0"] * 8, "0")
        area = make_area(**inputs)
        self.assertIn("stock-denominator-zero", area["unavailableReasons"])
        self.assertIsNone(area["councilTaxExactPence"])

    def test_missing_rows_still_produce_area(self):
        for field, reason in (("price", "price-unavailable"), ("stock", "stock-unavailable"),
                               ("charge", "charge-unavailable")):
            inputs = area_inputs()
            inputs[field] = None
            area = make_area(**inputs)
            self.assertEqual(area["code"], "E02002830")
            self.assertEqual(area["availability"], "unavailable")
            self.assertIn(reason, area["unavailableReasons"])
            self.assertIsNone(area["sourceRefs"][field])

    def test_missing_band_and_total_are_not_zero(self):
        inputs = area_inputs()
        del inputs["stock"]["rawCounts"]["H"]
        inputs["stock"]["rawReportedTotal"] = "-"
        area = make_area(**inputs)
        self.assertIn("stock-unavailable", area["unavailableReasons"])
        self.assertIn("stock-total-unavailable", area["unavailableReasons"])
        self.assertIsNone(area["sourceRefs"]["stock"]["reportedTotal"])

    def test_price_suppression_and_invalid_money(self):
        for value in ("[x]", None, "NaN", -10, 0):
            inputs = area_inputs()
            inputs["price"]["rawValue"] = value
            area = make_area(**inputs)
            self.assertIsNone(area["pricePence"])
            self.assertIn("price-unavailable", area["unavailableReasons"])

    def test_geography_review_withholds_otherwise_valid_baseline(self):
        area = make_area(**area_inputs(), geography_review=True)
        self.assertIn("geography-needs-review", area["unavailableReasons"])
        self.assertIsNone(area["councilTaxExactPence"])

    def test_stock_reconciliation_beyond_bound_fails(self):
        with self.assertRaisesRegex(ValueError, "rounding bound"):
            stock_values(source_stock(total="4370"))

    def test_charge_component_mismatch_fails(self):
        inputs = area_inputs()
        inputs["charge"]["rawComponents"]["Z"] = "2000"
        with self.assertRaisesRegex(ValueError, "Charge components"):
            make_area(**inputs)

    def test_unreviewed_parent_conflict_fails(self):
        stock = {"E02002830": {"observedParentGroup": "E06000016"}}
        lookup = {"E02002830": {"parentCode": "E09000032"}}
        with self.assertRaisesRegex(ValueError, "Unexplained stock parent"):
            validate_parent_groups(stock, lookup)


class ImporterSchemaTests(unittest.TestCase):
    def test_price_cell_and_marker_are_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "prices.xlsx"
            workbook = openpyxl.Workbook()
            sheet = workbook.active
            sheet.title = "1a"
            sheet.append(["Title"])
            sheet.append(["Source"])
            sheet.append(["Local authority code", "Local authority name", "MSOA code", "MSOA name"]
                         + [None] * 119 + ["Year ending Sep 2025"])
            row = ["E06000016", "Leicester", "E02002830", "Example"] + [None] * 119 + ["[x]"]
            sheet.append(row)
            workbook.save(path)
            self.assertEqual(read_prices(path, "MSOA")["E02002830"]["rawValue"], "[x]")
            self.assertEqual(read_prices(path, "MSOA")["E02002830"]["cell"], "1a!DT4")
            sheet.append(row)
            workbook.save(path)
            with self.assertRaisesRegex(ValueError, "Duplicate MSOA price"):
                read_prices(path, "MSOA")
            sheet["DT3"] = "Year ending Dec 2025"
            workbook.save(path)
            with self.assertRaisesRegex(ValueError, "schema or period"):
                read_prices(path, "MSOA")
            workbook.close()

    def test_lookup_duplicate_does_not_overwrite_parent(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "lookup.csv"
            path.write_text("MSOA21CD,MSOA21NM,LAD25CD,LAD25NM\n"
                            "E02002830,Example,E06000016,Leicester\n"
                            "E02002830,Example,E09000032,Wandsworth\n")
            with self.assertRaisesRegex(ValueError, "Duplicate lookup"):
                read_lookup(path)

    def test_stock_geography_filter_raw_marker_and_duplicate(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "stock.zip"
            stream = StringIO()
            writer = csv.writer(stream)
            writer.writerow(STOCK_COLUMNS)
            lad = ["LAUA", "2465", "E06000016", "Leicester"] + ["10"] * 8 + ["..", "80"]
            msoa = ["MSOA", "2465", "E02002830", "Example"] + ["10"] * 7 + ["-", "..", "70"]
            ignored = ["LSOA", "2465", "E01000001", "Ignored"] + ["0"] * 8 + ["..", "0"]
            for row in (lad, msoa, ignored):
                writer.writerow(row)
            with ZipFile(path, "w") as archive:
                archive.writestr(STOCK_MEMBER, stream.getvalue())
            msoas, lads, _ = read_stock(path)
            self.assertEqual(set(msoas), {"E02002830"})
            self.assertEqual(set(lads), {"E06000016"})
            self.assertEqual(msoas["E02002830"]["rawCounts"]["H"], "-")
            self.assertEqual(msoas["E02002830"]["observedParentGroup"], "E06000016")
            writer.writerow(lad)
            with ZipFile(path, "w") as archive:
                archive.writestr(STOCK_MEMBER, stream.getvalue())
            with self.assertRaisesRegex(ValueError, "Duplicate LAUA stock"):
                read_stock(path)


class PublishedSourceIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        sources = {source["id"]: source for source in json.loads((ROOT / "data/source-manifest.json").read_text())["sources"]}
        if not (ROOT / sources["ons-msoa-prices"]["localPath"]).exists():
            raise unittest.SkipTest("Restore the pinned source archive to run source integration checks")
        cls.areas, cls.report, cls.context = build_statistics(ROOT, sources)
        cls.by_code = {area["code"]: area for area in cls.areas}

    def test_selected_inventory_keeps_unavailable_rows(self):
        self.assertEqual(len(self.areas), 203)
        self.assertEqual(len(self.by_code), 203)
        self.assertEqual(self.report["coverage"]["MSOA"], {"total": 198, "available": 91, "unavailable": 107})
        self.assertEqual(self.report["coverage"]["LAD"], {"total": 5, "available": 5, "unavailable": 0})
        self.assertEqual(len(self.context["parent_lookup"]), 7264)

    def test_real_msoa_examples_match_independent_phase0_fixtures(self):
        for fixture in json.loads((ROOT / "data/fixtures/phase0-worked-examples.json").read_text()):
            area = self.by_code[fixture["msoa_code"]]
            baseline = area["councilTaxExactPence"]
            expected = fixture["baseline_exact_gbp"]
            self.assertEqual(Fraction(baseline["numerator"], baseline["denominator"]),
                             100 * Fraction(expected["numerator"], expected["denominator"]))

    def test_real_lad_matches_independently_transcribed_fixture(self):
        fixture = json.loads((ROOT / "data/fixtures/phase1-lad-worked-example.json").read_text())
        area = self.by_code[fixture["code"]]
        self.assertEqual(area["councilTaxExactPence"], fixture["expected"]["councilTaxExactPence"])
        self.assertEqual(area["sourceRefs"]["stock"]["rawCounts"], fixture["stock"]["rawCounts"])
        self.assertEqual(area["pricePence"], 24492200)
        self.assertEqual(area["sourceRefs"]["stock"]["geography"], "LAUA")
        self.assertTrue(self.report["independentLadExample"]["exactBaselineMatches"])

    def test_national_vintage_conflicts_are_explained_and_enumerated(self):
        self.assertEqual(len(self.report["stockParentDisagreements"]), 101)
        self.assertEqual(len(self.report["ladVintageExclusions"]), 2)
        self.assertEqual(self.report["stock"]["nationalMsoaNonnumericBandMarkers"], {"-": 5319})
        self.assertEqual(self.report["stock"]["maxAbsoluteMsoaBandReconciliationDifference"], 30)
        self.assertEqual(len(self.report["stock"]["sampleLadPublishedTotalReconciliations"]), 5)


if __name__ == "__main__":
    unittest.main()
