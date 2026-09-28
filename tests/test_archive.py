import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from pipeline.archive import load_sources, preserve_sources, verify_archive
from pipeline.build import activate_release, apply_geography_review, inventory, verify_release
from pipeline.common import write_json


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.cached = self.root / "data/raw/example.bin"
        self.cached.parent.mkdir(parents=True)
        self.cached.write_bytes(b"Original pinned bytes\x00\xff")
        self.source = {"id": "example", "localPath": "data/raw/example.bin",
                       "sha256": hashlib.sha256(self.cached.read_bytes()).hexdigest(),
                       "bytes": self.cached.stat().st_size}
        self.manifests = ("data/manifest.json",)
        write_json(self.root / self.manifests[0], {"sources": [self.source]})
        self.archive = self.root / "archive"

    def preserve(self):
        return preserve_sources(self.root, self.archive, {"example": self.source}, self.manifests)

    def test_archive_restores_removed_cache_without_upstream(self):
        original = self.cached.read_bytes()
        report = self.preserve()
        self.cached.unlink()
        self.assertEqual(report, self.preserve())
        self.assertEqual(self.cached.read_bytes(), original)
        self.assertEqual(verify_archive(self.archive)["verifiedSources"], 1)

    def test_cache_corruption_is_not_silently_overwritten(self):
        self.preserve()
        self.cached.write_bytes(b"Wrong version")
        with self.assertRaisesRegex(ValueError, "mismatch"):
            self.preserve()

    def test_archive_corruption_rejected_even_with_good_cache(self):
        self.preserve()
        (self.archive / "sha256" / self.source["sha256"]).write_bytes(b"Wrong version")
        with self.assertRaisesRegex(ValueError, "mismatch"):
            self.preserve()

    def test_duplicate_and_traversal_rejected(self):
        write_json(self.root / self.manifests[0], {"sources": [self.source, self.source]})
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            load_sources(self.root, self.manifests)
        self.source["localPath"] = "../outside"
        write_json(self.root / self.manifests[0], {"sources": [self.source]})
        with self.assertRaisesRegex(ValueError, "Unsafe"):
            load_sources(self.root, self.manifests)

    def test_archive_must_survive_raw_cache_deletion(self):
        self.archive = self.root / "data/raw/archive"
        with self.assertRaisesRegex(ValueError, "inside raw cache"):
            self.preserve()


class ReleaseTests(unittest.TestCase):
    def test_postcode_conflict_withholds_baseline_preserving_inputs_and_missing_reason(self):
        area = {"code": "E02000001", "geography": "MSOA", "availability": "unavailable",
                "councilTaxExactPence": {"numerator": 12345, "denominator": 2},
                "pricePence": 30000000, "sourceRefs": {"stock": {"A": "-"}},
                "unavailableReasons": ["stock-marker-unverified"], "qualityFlags": []}
        apply_geography_review([area], [{"msoaCode": area["code"], "reasons": ["conflict"]}])
        self.assertIsNone(area["councilTaxExactPence"])
        self.assertEqual(area["unavailableReasons"], ["geography-needs-review", "stock-marker-unverified"])
        self.assertEqual(area["sourceRefs"]["stock"]["A"], "-")
        self.assertEqual(area["pricePence"], 30000000)

    def test_immutable_release_and_checksum_verification(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            stage = root / "stage"
            write_json(stage / "areas.json", {"areas": []})
            manifest = {"releaseId": "sample-v1", "artifacts": inventory(stage)}
            write_json(stage / "manifest.json", manifest)
            dest = root / "sample-v1"
            pointer = root / "manifest.json"
            activate_release(stage, dest, pointer, manifest)
            self.assertEqual(verify_release(dest)["verifiedArtifacts"], 1)
            before = pointer.read_bytes()
            write_json(stage / "areas.json", {"changed": True})
            with self.assertRaisesRegex(ValueError, "different bytes"):
                activate_release(stage, dest, pointer, manifest)
            self.assertEqual(pointer.read_bytes(), before)
            (dest / "areas.json").write_text("corrupt")
            with self.assertRaisesRegex(ValueError, "mismatch"):
                verify_release(dest)


if __name__ == "__main__":
    unittest.main()
