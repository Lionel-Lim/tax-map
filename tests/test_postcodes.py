import csv
import gzip
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from pipeline.postcodes import FIELDS, build_postcodes, normalise_postcode


class PostcodeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.parents = {"E02000001": "E06000001", "E02000002": "E06000002",
                        "E02000003": "E06000003", "W02000001": "W06000001"}

    def row(self, postcode="AA1 1AA", **values):
        return {"pcds": postcode, "doterm": "", "ctry": "E92000001",
                "msoa21": "E02000001", "oslaua": "E06000001", "lat": "51.123456",
                "long": "-1.123456", "osgrdind": "1", **values}

    def source(self, rows, name="input.csv"):
        path = self.root / name
        with path.open("w", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=self.row().keys())
            writer.writeheader()
            writer.writerows(rows)
        return path

    def build(self, rows, output="result"):
        return build_postcodes(self.source(rows), self.root / output, {"E02000001"},
                               {"E06000001"}, self.parents)

    def test_lookup_preserves_status_country_and_outside_sample(self):
        report = self.build([
            self.row(" aa1  1aa "),
            self.row("AA1 1AB", doterm="200011", osgrdind="8"),
            self.row("AA2 1AA", msoa21="E02000002", oslaua="E06000002"),
            self.row("CF1 1AA", ctry="W92000004", msoa21="W02000001", oslaua="W06000001"),
            self.row("BT1 1AA", ctry="N92000002", msoa21="", oslaua="N09000001"),
        ])
        self.assertEqual(report["records"], 5)
        self.assertEqual(report["counts"]["current"], 4)
        self.assertEqual(report["counts"]["terminated"], 1)
        self.assertEqual(report["sampleGeographyNeedsReview"], [])
        index = json.loads((self.root / "result/postcodes/index.json").read_text())
        self.assertEqual(index["fields"], FIELDS)
        self.assertEqual(set(index["shards"]), {"AA1", "AA2", "CF1", "BT1"})
        rows = json.loads((self.root / "result/postcodes/AA1.json").read_text())["rows"]
        self.assertEqual(rows[0], ["AA1 1AA", 51.123456, -1.123456, "E92000001",
                                   "E02000001", "E06000001", "current", None, "1"])
        self.assertEqual(rows[1][6:9], ["terminated", "200011", "8"])
        self.assertFalse(index["publicReleaseReady"])

    def test_missing_location_and_geography_are_null_without_losing_postcode(self):
        report = self.build([self.row(lat="99.999999", long="0.000000", osgrdind="9",
                                      msoa21="", oslaua="")])
        rows = json.loads((self.root / "result/postcodes/AA1.json").read_text())["rows"]
        self.assertEqual(rows[0][1:3], [None, None])
        self.assertEqual(rows[0][4:6], [None, None])
        self.assertEqual(report["unresolvedCurrentEnglishGeography"], {"msoa-unavailable": 1})
        self.assertEqual(report["sampleGeographyNeedsReview"],
                         [{"msoaCode": "E02000001", "reasons": ["no-current-postcodes"]}])

    def test_present_sample_msoa_missing_lad_is_withheld(self):
        report = self.build([self.row(oslaua="")])
        self.assertEqual(report["sampleGeographyNeedsReview"],
                         [{"msoaCode": "E02000001", "reasons": ["lad-unavailable"]}])

    def test_current_cross_authority_assignments_quarantine_but_terminated_do_not(self):
        report = self.build([self.row(), self.row("AA1 1AB", oslaua="E06000002"),
                             self.row("AA1 1AC", doterm="199912", oslaua="E06000003")])
        self.assertEqual(len(report["crossAuthorityMsoas"]), 1)
        conflict = report["parentConflicts"][0]
        self.assertEqual(conflict["officialParentLadCode"], "E06000001")
        self.assertEqual([row["ladCode"] for row in conflict["assignments"]], ["E06000001", "E06000002"])
        self.assertEqual(report["sampleGeographyNeedsReview"][0]["reasons"],
                         ["cross-authority-postcode-assignments", "postcode-lad-conflicts-with-official-parent"])

    def test_unknown_non_null_current_english_geography_is_fatal(self):
        for field, code in [("msoa21", "E02009999"), ("msoa21", "W02000001"),
                            ("oslaua", "E06009999"), ("oslaua", "W06000001")]:
            with self.subTest(field=field, code=code):
                with self.assertRaisesRegex(ValueError, "Unexplained current English"):
                    self.build([self.row(**{field: code})], output=field + code)

    def test_reviewed_legacy_authorities_preserve_source_codes_and_withhold(self):
        self.parents["E02000001"] = "E08000038"
        source = self.source([self.row(oslaua="E08000016")])
        report = build_postcodes(source, self.root / "legacy", {"E02000001"}, {"E08000038"}, self.parents)
        self.assertEqual(report["crossAuthorityMsoas"], [])
        self.assertEqual(report["parentConflicts"], [])
        self.assertEqual(report["legacyAuthorityAssignments"], [{
            "msoaCode": "E02000001", "sourceLadCode": "E08000016",
            "officialParentLadCode": "E08000038", "reason": "source-lad-precedes-current-boundary",
            "currentPostcodes": 1, "examples": ["AA1 1AA"]}])
        self.assertEqual(report["sampleGeographyNeedsReview"][0]["reasons"], ["source-lad-precedes-current-boundary"])
        rows = json.loads((self.root / "legacy/postcodes/AA1.json").read_text())["rows"]
        self.assertEqual(rows[0][5], "E08000016")
        self.assertEqual(FIELDS[5], "sourceLad")

    def test_legacy_code_with_unexplained_parent_is_fatal(self):
        with self.assertRaisesRegex(ValueError, "Unexplained legacy English LAD join"):
            self.build([self.row(oslaua="E08000016")])

    def test_duplicate_normalised_postcodes_are_fatal(self):
        with self.assertRaisesRegex(ValueError, "Duplicate postcode AA1 1AA"):
            self.build([self.row(), self.row("aa11aa")])

    def test_bad_status_location_country_or_source_schema_are_fatal(self):
        for i, values in enumerate([{"doterm": "202513"}, {"lat": "nan"},
                                    {"long": "999"}, {"ctry": "E92000002"}, {"osgrdind": "7"}]):
            with self.subTest(values=values):
                with self.assertRaises(ValueError):
                    self.build([self.row(**values)], output=f"invalid{i}")
        source = self.root / "missing.csv"
        source.write_text("pcds\nAA1 1AA\n")
        with self.assertRaisesRegex(ValueError, "Missing ONSPD columns"):
            build_postcodes(source, self.root / "missing", set(), set(), self.parents)

    def test_outputs_are_identical_after_reordering_source_rows(self):
        rows = [self.row("AA1 1AB"), self.row("AA1 1AA"), self.row("AA2 1AA")]
        first = self.build(rows, "first")
        second = self.build(list(reversed(rows)), "second")
        self.assertEqual(first, second)
        for path in (self.root / "first/postcodes").iterdir():
            self.assertEqual(path.read_bytes(), (self.root / "second/postcodes" / path.name).read_bytes())
        payload = (self.root / "first/postcodes/AA1.json").read_bytes()
        gzip_payload = (self.root / "first/postcodes/AA1.json.gz").read_bytes()
        self.assertEqual(gzip.decompress(gzip_payload), payload)
        self.assertEqual(gzip_payload[4:8], b"\0\0\0\0")
        index = json.loads((self.root / "first/postcodes/index.json").read_text())
        self.assertEqual(index["shards"]["AA1"]["sha256"], hashlib.sha256(payload).hexdigest())

    def test_archive_uses_only_multi_csv_and_checks_cross_member_duplicates(self):
        source = self.source([self.row()])
        archive = self.root / "directory.zip"
        with ZipFile(archive, "w") as zip_file:
            zip_file.writestr("Data/multi_csv/ONSPD_MAY_2025_UK_AA.csv", source.read_bytes())
            zip_file.writestr("Data/ONSPD_MAY_2025_UK.txt", "ignored duplicate representation")
        report = build_postcodes(archive, self.root / "zip", {"E02000001"}, {"E06000001"}, self.parents)
        self.assertEqual(report["records"], 1)
        with ZipFile(archive, "a") as zip_file:
            zip_file.writestr("Data/multi_csv/ONSPD_MAY_2025_UK_AB.csv", source.read_bytes())
        with self.assertRaisesRegex(ValueError, "Duplicate postcode"):
            build_postcodes(archive, self.root / "duplicatezip", set(), set(), self.parents)

    def test_normalisation_is_not_validity_detection(self):
        self.assertEqual(normalise_postcode("  sw1a1aa "), "SW1A 1AA")
        self.assertEqual(normalise_postcode("AA111AA"), "AA11 1AA")
        with self.assertRaises(ValueError):
            normalise_postcode("../bad")


if __name__ == "__main__":
    unittest.main()
