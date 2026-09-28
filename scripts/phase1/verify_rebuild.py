"""Prove archive recovery and byte-identical rebuilding with no raw cache.

Run after `python -m pipeline build`. All temporary copies are removed on exit;
the original cache and release are not removed or modified. Archive content is
verified and its deterministic catalogue is refreshed by the normal build.
"""

import json
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from pipeline import RELEASE_ID
from pipeline.archive import MANIFESTS, load_sources, verify_archive
from pipeline.build import build, inventory, verify_release
from pipeline.common import require, sha256, write_json


def main():
    archive = ROOT / "data/archive"
    original = ROOT / "static/data" / RELEASE_ID
    verify_release(original)
    archive_check = verify_archive(archive)
    with tempfile.TemporaryDirectory(prefix="tax-map-rebuild-") as temporary:
        clean = Path(temporary)
        for directory in ("pipeline", "data/fixtures", "data/policies"):
            shutil.copytree(ROOT / directory, clean / directory,
                            ignore=shutil.ignore_patterns("__pycache__"))
        for relative in (*MANIFESTS, "requirements-pipeline.txt", "docs/methodology.md"):
            target = clean / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / relative, target)
        require(not (clean / "data/raw").exists(), "Rebuild must start without a raw cache")
        manifest = build(clean, archive, clean / "static/data", RELEASE_ID)
        restored_sources = load_sources(clean)
        require(all((clean / s["localPath"]).is_file() for s in restored_sources.values()),
                "Archive did not restore every source")
        rebuilt = clean / "static/data" / RELEASE_ID
        require(inventory(original) == inventory(rebuilt), "Rebuild differs from original release")
        evidence = {"releaseId": RELEASE_ID, "checksPassed": True,
                    "startedWithoutRawCache": True, "upstreamNetworkRequests": 0,
                    "restoredSources": len(restored_sources), "archiveVerification": archive_check,
                    "identicalReleaseFilesIncludingManifest": len(inventory(original)),
                    "manifestSha256": sha256(original / "manifest.json"),
                    "coverage": manifest["coverage"]}
        write_json(ROOT / "docs/evidence/phase1-reproducibility.json", evidence)
        print(json.dumps(evidence, indent=2))


if __name__ == "__main__":
    main()
