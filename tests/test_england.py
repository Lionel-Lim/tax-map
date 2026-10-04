"""National-profile checks preserve missing inputs and immutable sample behavior."""

import copy
import json
import tempfile
import unittest
from pathlib import Path

from pipeline import ENGLAND_RELEASE_ID, RELEASE_ID, RELEASE_IDS
from pipeline.build import (apply_geography_review, apply_geometry_exclusions, coverage_summary,
                            validate_area_geometry, write_area_shards)
from pipeline.common import sha256
from pipeline.statistics import build_statistics, reconcile_lad_stock, select_geographies

ROOT = Path(__file__).resolve().parents[1]


def tiny_area(code="E02000001", geography="MSOA", parent="E06000001"):
    return {"code": code, "name": code, "geography": geography, "parentCode": parent,
            "availability": "available", "unavailableReasons": [], "qualityFlags": [],
            "pricePence": 10000000, "councilTaxExactPence": {"numerator": 100, "denominator": 1}}


class EnglandProfileUnitTests(unittest.TestCase):
    def test_release_defaults_do_not_repurpose_the_sample_identity(self):
        self.assertEqual(RELEASE_IDS["sample"], RELEASE_ID)
        self.assertEqual(RELEASE_IDS["england"], ENGLAND_RELEASE_ID)
        self.assertNotEqual(ENGLAND_RELEASE_ID, RELEASE_ID)

    def test_national_selection_includes_every_parent_and_neighbourhood(self):
        lookup = {"E02000001": {"parentCode": "E06000001"},
                  "E02000002": {"parentCode": "E06000002"}}
        selected = select_geographies(ROOT, set(lookup), {"E06000001", "E06000002"}, lookup, "england")
        self.assertEqual(selected, [
            {"lad_code": "E06000001", "msoa_codes": ["E02000001"], "msoa_count": 1},
            {"lad_code": "E06000002", "msoa_codes": ["E02000002"], "msoa_count": 1}])
        with self.assertRaisesRegex(ValueError, "Unsupported geographic scope"):
            select_geographies(ROOT, set(), set(), {}, "unknown")

    def test_old_stock_is_not_mapped_onto_current_barnsley_sheffield_totals(self):
        selected = [{"lad_code": "E08000038", "msoa_codes": ["E02001509"]}]
        stock = {"E02001509": {"rawReportedTotal": "100", "observedParentGroup": "E08000016"}}
        older = {"E08000016": {"rawReportedTotal": "100"}}
        reconciled, non_nesting, excluded = reconcile_lad_stock(selected, stock, older, "england")
        self.assertEqual(reconciled, [])
        self.assertEqual(non_nesting, [])
        self.assertEqual(excluded, [{"code": "E08000038", "reason": "current-lad-stock-vintage-unavailable"}])

    def test_unknown_national_total_mismatch_is_still_a_failure(self):
        selected = [{"lad_code": "E06000001", "msoa_codes": ["E02000001"]}]
        with self.assertRaisesRegex(ValueError, "total reconciliation failed"):
            reconcile_lad_stock(selected, {"E02000001": {"rawReportedTotal": "1000"}},
                                {"E06000001": {"rawReportedTotal": "500"}}, "england")

    def test_reviewed_best_fit_mismatch_requires_exact_known_msoa_and_native_reconciliation(self):
        selected = [{"lad_code": "E07000081", "msoa_codes": ["E02000001", "E02004651"]}]
        stock = {"E02000001": {"rawReportedTotal": "100", "observedParentGroup": "E07000081"},
                 "E02004651": {"rawReportedTotal": "5000", "observedParentGroup": "E07000082"}}
        lads = {"E07000081": {"rawReportedTotal": "100"}}
        reconciled, reviewed, excluded = reconcile_lad_stock(selected, stock, lads, "england")
        self.assertEqual(reconciled, [])
        self.assertEqual(excluded, [])
        self.assertEqual(reviewed[0]["difference"], 5000)
        self.assertEqual(reviewed[0]["stockGroupedDifference"], 0)
        stock["E02004651"]["observedParentGroup"] = "E07000081"
        with self.assertRaisesRegex(ValueError, "Unexplained non-nesting"):
            reconcile_lad_stock(selected, stock, lads, "england")

    def test_geometry_exclusion_preserves_the_statistic_and_requires_explicit_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            msoa = tiny_area()
            lad = tiny_area("E06000001", "LAD", None)
            areas = [msoa, lad]
            (path / "msoa.geojson").write_text(json.dumps({"features": []}))
            (path / "lad.geojson").write_text(json.dumps({"features": [{"id": lad["code"]}]}))
            with self.assertRaisesRegex(ValueError, "Unmatched MSOA"):
                validate_area_geometry(areas, path)
            omissions = [{"code": msoa["code"], "reason": "invalid-source-boundary"}]
            with self.assertRaisesRegex(ValueError, "explicit unavailable"):
                validate_area_geometry(areas, path, omissions)
            apply_geometry_exclusions(areas, omissions)
            validate_area_geometry(areas, path, omissions)
            self.assertEqual(len(areas), 2)
            self.assertEqual(msoa["availability"], "unavailable")
            self.assertIn("boundary-invalid", msoa["unavailableReasons"])
            self.assertIn("geometry-unavailable", msoa["qualityFlags"])
            self.assertIsNone(msoa["councilTaxExactPence"])

    def test_district_shards_retain_unavailable_children_and_match_manifest_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            available = tiny_area()
            missing = tiny_area("E02000002")
            apply_geometry_exclusions([missing], [{"code": missing["code"], "reason": "source-invalid"}])
            areas = [available, missing, tiny_area("E06000001", "LAD", None)]
            shards = write_area_shards(path, areas, ENGLAND_RELEASE_ID)
            entry = shards["E06000001"]
            self.assertEqual(entry["path"], "areas/msoa/E06000001.json")
            self.assertEqual(entry["records"], 2)
            self.assertEqual(entry["bytes"], (path / entry["path"]).stat().st_size)
            self.assertEqual(entry["sha256"], sha256(path / entry["path"]))
            data = json.loads((path / entry["path"]).read_text())
            self.assertEqual(data["parentCode"], "E06000001")
            self.assertEqual(data["releaseId"], ENGLAND_RELEASE_ID)
            self.assertEqual([row["availability"] for row in data["areas"]], ["available", "unavailable"])
            self.assertEqual(len(json.loads((path / "councils.json").read_text())["areas"]), 1)


class EnglandPublishedSourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        sources = {row["id"]: row for row in json.loads((ROOT / "data/source-manifest.json").read_text())["sources"]}
        if not (ROOT / sources["ons-msoa-prices"]["localPath"]).exists():
            raise unittest.SkipTest("Restore the pinned source archive for national source integration checks")
        cls.areas, cls.report, cls.context = build_statistics(ROOT, sources, scope="england")
        cls.by_code = {area["code"]: area for area in cls.areas}

    def test_every_expected_area_is_accounted_for_with_explicit_missing_stock(self):
        self.assertEqual(len(self.areas), 7152)
        self.assertEqual(len(self.context["sample_msoas"]), 6856)
        self.assertEqual(len(self.context["sample_lads"]), 296)
        for code in ("E08000038", "E08000039"):
            area = self.by_code[code]
            self.assertEqual(area["unavailableReasons"], ["stock-unavailable"])
            self.assertIsNone(area["sourceRefs"]["stock"])
            self.assertIsNone(area["councilTaxExactPence"])
        self.assertEqual(self.by_code["E09000001"]["unavailableReasons"], ["stock-marker-unverified"])
        self.assertEqual(self.report["coverage"]["LAD"], {"total": 296, "available": 293, "unavailable": 3})

    def test_existing_sample_statistics_are_identical_before_additional_national_reviews(self):
        published = json.loads((ROOT / "static/data" / RELEASE_ID / "areas.json").read_text())["areas"]
        self.assertEqual([self.by_code[area["code"]] for area in published], published)

    def test_national_reconciliation_keeps_known_nonnesting_evidence_and_rejects_other_differences(self):
        stock = self.report["stock"]
        self.assertEqual(len(stock["nationalLadPublishedTotalReconciliations"]), 292)
        reviewed = stock["reviewedNonNestingReconciliations"]
        self.assertEqual([(row["code"], row["difference"]) for row in reviewed],
                         [("E07000081", 5040), ("E07000082", -5060)])
        self.assertTrue(all(abs(row["stockGroupedDifference"]) <= row["stockGroupedTolerance"] for row in reviewed))
        self.assertEqual(len(stock["ladReconciliationExclusions"]), 2)

    def test_postcode_conflicts_and_invalid_boundaries_withhold_without_dropping_area_rows(self):
        areas = copy.deepcopy(self.areas)
        postcode = json.loads((ROOT / "docs/evidence/phase1-validation.json").read_text())["postcodes"]
        review = {row["msoaCode"] for key in ("parentConflicts", "crossAuthorityMsoas", "legacyAuthorityAssignments")
                  for row in postcode[key] if row["msoaCode"] is not None}
        self.assertEqual(len(review), 140)
        apply_geography_review(areas, review)
        self.assertEqual(coverage_summary(areas)["MSOA"]["available"], 2966)
        omitted = ["E02000291", "E02000292", "E02001686", "E02004039", "E02004043", "E02004524"]
        apply_geometry_exclusions(areas, [{"code": code, "reason": "reviewed-invalid-source-geometry"} for code in omitted])
        final = coverage_summary(areas)
        self.assertEqual(final["MSOA"]["available"], 2961)
        self.assertEqual(final["MSOA"]["unavailable"], 3895)
        self.assertEqual(final["MSOA"]["unavailableReasons"],
                         {"boundary-invalid": 6, "geography-needs-review": 140, "stock-marker-unverified": 3843})
        self.assertEqual(len(areas), 7152)


if __name__ == "__main__":
    unittest.main()
