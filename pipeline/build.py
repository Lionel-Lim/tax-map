"""Build a coherent immutable sample or England release, then update its local pointer."""

import json
import platform
import re
import shutil
import tempfile
from collections import Counter
from importlib.metadata import version
from pathlib import Path

from . import RELEASE_ID, RELEASE_IDS, SCHEMA_VERSION
from .archive import load_sources, preserve_sources
from .common import atomic_json, require, sha256, write_json


def inventory(directory: Path):
    return {str(p.relative_to(directory)): {"sha256": sha256(p), "bytes": p.stat().st_size}
            for p in sorted(directory.rglob("*")) if p.is_file()}


def activate_release(staging: Path, destination: Path, pointer: Path, manifest):
    """An existing version may be reproduced, never silently overwritten."""
    if destination.exists():
        require(inventory(staging) == inventory(destination),
                f"Release {destination.name} already exists with different bytes; use a new release id")
    else:
        destination.parent.mkdir(parents=True, exist_ok=True)
        staging.rename(destination)
    atomic_json(pointer, {"schemaVersion": SCHEMA_VERSION, "releaseId": manifest["releaseId"],
                          "manifestPath": f"{manifest['releaseId']}/manifest.json",
                          "manifestSha256": sha256(destination / "manifest.json"),
                          "publicReleaseReady": False})


def validate_area_geometry(areas, boundary_dir: Path, omitted_geometry=None):
    require(len({a["code"] for a in areas}) == len(areas), "Duplicate statistic keys")
    omissions = omitted_geometry or []
    omitted = {row["code"] for row in omissions}
    require(len(omitted) == len(omissions), "Duplicate geometry exclusions")
    by_code = {area["code"]: area for area in areas}
    require(omitted <= by_code.keys(), "Geometry exclusion is not in the statistical inventory")
    for code in omitted:
        require(by_code[code]["availability"] == "unavailable"
                and "boundary-invalid" in by_code[code]["unavailableReasons"],
                f"An omitted geometry must retain its explicit unavailable statistic: {code}")
    for geography, filename in (("MSOA", "msoa.geojson"), ("LAD", "lad.geojson")):
        features = json.loads((boundary_dir / filename).read_text())["features"]
        ids = [f["id"] for f in features]
        require(len(ids) == len(set(ids)), f"Duplicate {geography} feature IDs")
        expected = {a["code"] for a in areas if a["geography"] == geography}
        require(set(ids) == expected - omitted, f"Unmatched {geography} geometry/statistic IDs")
    for area in areas:
        require(area["availability"] in ("available", "unavailable"), "Invalid availability")
        if area["availability"] == "available":
            require(not area["unavailableReasons"], f"Available area has missing inputs: {area['code']}")
            require(isinstance(area["pricePence"], int) and area["pricePence"] > 0,
                    f"Invalid available price: {area['code']}")
            fraction = area["councilTaxExactPence"]
            require(fraction and fraction["denominator"] > 0 and fraction["numerator"] >= 0,
                    f"Invalid baseline: {area['code']}")
        else:
            require(area["unavailableReasons"], f"Missing unavailability reason: {area['code']}")


def apply_geography_review(areas, review_records):
    review = {item["msoaCode"] if isinstance(item, dict) else item for item in review_records}
    for area in areas:
        if area["code"] in review and area["geography"] == "MSOA":
            area["availability"] = "unavailable"
            area["councilTaxExactPence"] = None
            area["unavailableReasons"] = sorted(set(area["unavailableReasons"]) | {"geography-needs-review"})
            area["qualityFlags"] = sorted(set(area["qualityFlags"]) | {"postcode-geography-needs-review"})


def apply_geometry_exclusions(areas, omissions):
    """Retain invalid source boundaries as explicit unavailable statistics, without repair."""
    by_code = {area["code"]: area for area in areas}
    for omission in omissions:
        code = omission["code"]
        require(code in by_code, f"Geometry exclusion is not in the statistical inventory: {code}")
        require(isinstance(omission.get("reason"), str) and omission["reason"],
                f"Geometry exclusion needs a reason: {code}")
        area = by_code[code]
        area["availability"] = "unavailable"
        area["councilTaxExactPence"] = None
        area["unavailableReasons"] = sorted(set(area["unavailableReasons"]) | {"boundary-invalid"})
        area["qualityFlags"] = sorted(set(area["qualityFlags"]) | {"geometry-unavailable"})


def write_area_shards(staging: Path, areas, release_id):
    """Publish small initial council data and complete per-authority neighbourhood envelopes."""
    councils = sorted((area for area in areas if area["geography"] == "LAD"), key=lambda area: area["code"])
    write_json(staging / "councils.json", {"schemaVersion": SCHEMA_VERSION,
                                          "releaseId": release_id, "areas": councils})
    groups = {area["code"]: [] for area in councils}
    for area in areas:
        if area["geography"] == "MSOA":
            require(area["parentCode"] in groups, f"Missing shard parent: {area['code']}")
            groups[area["parentCode"]].append(area)
    shards = {}
    for parent, children in sorted(groups.items()):
        relative = f"areas/msoa/{parent}.json"
        path = staging / relative
        write_json(path, {"schemaVersion": SCHEMA_VERSION, "releaseId": release_id,
                          "parentCode": parent, "areas": sorted(children, key=lambda area: area["code"])})
        shards[parent] = {"path": relative, "records": len(children),
                          "bytes": path.stat().st_size, "sha256": sha256(path)}
    return shards


def usable_coverage(areas, postcode_report):
    """Count records, rounded stock and current postcodes, never model household savings."""
    dwelling_coverage = {}
    for geography in ("MSOA", "LAD"):
        rows = [area for area in areas if area["geography"] == geography]
        totals = {area["code"]: (area["sourceRefs"].get("stock") or {}).get("reportedTotal") for area in rows}
        valid = {code: total for code, total in totals.items() if isinstance(total, int)}
        available = {area["code"] for area in rows if area["availability"] == "available"}
        dwelling_coverage[geography] = {
            "basis": "published rounded VOA all_properties counts; missing current-vintage totals excluded",
            "totalReportedDwellings": sum(valid.values()),
            "reportedDwellingsInAvailableAreas": sum(total for code, total in valid.items() if code in available),
            "recordsWithReportedTotal": len(valid), "recordsMissingReportedTotal": sorted(totals.keys() - valid.keys())}
    current = postcode_report["sampleCurrentPostcodesByMsoa"]
    available = {area["code"] for area in areas if area["geography"] == "MSOA" and area["availability"] == "available"}
    english = next(row["records"] for row in postcode_report["countryStatus"]
                   if row["country"] == "E92000001" and row["status"] == "current")
    postcodes = {"currentEnglishPostcodes": english, "withAssignedMsoa": sum(current.values()),
                "withAvailableMsoa": sum(count for code, count in current.items() if code in available),
                "withoutMsoa": postcode_report["unresolvedCurrentEnglishGeography"].get("msoa-unavailable", 0),
                "referencePeriod": "2025-05"}
    return {"dwellingCoverage": dwelling_coverage, "postcodeCoverage": postcodes}


def coverage_summary(areas):
    result = {}
    for kind in ("MSOA", "LAD"):
        records = [area for area in areas if area["geography"] == kind]
        available = sum(area["availability"] == "available" for area in records)
        result[kind] = {"total": len(records), "available": available,
                        "unavailable": len(records) - available,
                        "unavailableReasons": dict(sorted(Counter(
                            reason for area in records for reason in area["unavailableReasons"]).items()))}
    return result


def build(root: Path, archive_root: Path, output_root: Path, release_id=None, *, scope="sample"):
    from .statistics import build_statistics
    from .boundaries import build_boundaries
    from .postcodes import build_postcodes

    require(scope in RELEASE_IDS, f"Unsupported geographic scope: {scope}")
    release_id = release_id or RELEASE_IDS[scope]
    require(re.fullmatch(r"[a-z0-9][a-z0-9-]{0,79}", release_id), "Invalid release id")
    require(scope != "england" or release_id != RELEASE_ID, "England expansion must use a new release id")
    require(not output_root.resolve().is_relative_to((root / "data/raw").resolve()),
            "Release output cannot live inside the disposable raw cache")
    require(not archive_root.resolve().is_relative_to(output_root.resolve()),
            "Source archive cannot be served inside browser output")
    sources = load_sources(root)
    archive_report = preserve_sources(root, archive_root, sources)
    print(f"Verified and archived {len(sources)} pinned sources", flush=True)
    areas, stats_report, context = build_statistics(root, sources, scope=scope)
    before_postcodes = coverage_summary(areas)
    staging_parent = output_root / ".staging"
    staging_parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=release_id + "-", dir=staging_parent))
    try:
        postcode_report = build_postcodes(
            root / sources["postcode-directory"]["localPath"], staging,
            context["sample_msoas"], context["sample_lads"], context["parent_lookup"])
        if scope == "england":
            index_path = staging / "postcodes/index.json"
            postcode_index = json.loads(index_path.read_text())
            postcode_index["coverageScope"] = "england"
            postcode_index["coverage"] = (
                "All source UK and Crown Dependency postcode records, including current and terminated records. "
                "The tax-area inventory contains every English LAD and MSOA, including explicitly unavailable estimates.")
            write_json(index_path, postcode_index)
        # Preserve the original statistical inputs; cross-authority evidence adds a
        # visible availability reason, never a council fallback or silent reassignment.
        apply_geography_review(areas, postcode_report["sampleGeographyNeedsReview"])
        after_postcodes = coverage_summary(areas)
        print("Postcode inventory and parent-authority checks complete", flush=True)
        boundary_options = {"parent_lookup": context["parent_lookup"], "allow_invalid_omission": True} if scope == "england" else {}
        boundary_report = build_boundaries(root, sources, context["sample_msoas"],
                                          context["sample_lads"], staging / "boundaries", **boundary_options)
        omissions = boundary_report.get("omittedGeometry", [])
        apply_geometry_exclusions(areas, omissions)
        validate_area_geometry(areas, staging / "boundaries", omissions)
        policy = json.loads((root / "data/policies/illustrative-ppt-v1.json").read_text())
        write_json(staging / "areas.json", {"schemaVersion": SCHEMA_VERSION,
                                            "releaseId": release_id, "areas": areas})
        area_shards = write_area_shards(staging, areas, release_id) if scope == "england" else None
        write_json(staging / "search.json", {"schemaVersion": SCHEMA_VERSION,
                    "areas": [{"code": a["code"], "name": a["name"], "geography": a["geography"],
                               "parentCode": a["parentCode"], "availability": a["availability"],
                               "terms": sorted({a["code"].casefold(), a["name"].casefold(),
                                                str((a["sourceRefs"].get("parentLookup") or {}).get("name", a["name"])).casefold()})}
                              for a in areas]})
        write_json(staging / "policy.json", policy)
        coverage = coverage_summary(areas)
        report = {"schemaVersion": SCHEMA_VERSION, "releaseId": release_id, "checksPassed": True,
                  "coverage": coverage, "sourceArchive": archive_report, "statistics": stats_report,
                  "boundaries": boundary_report, "postcodes": postcode_report,
                  "unmatchedGeometry": [], "duplicateAreaKeys": [],
                  "publicReleaseReady": False,
                  "limitations": [
                      "Sample preparation only; interactive application and comparison engine are later phases.",
                      "Unverified stock markers remain unavailable without a parent-area fallback.",
                      "Cross-authority postcode assignments withhold affected MSOA estimates pending review.",
                      "Northern Ireland postcode records are excluded from generated lookups.",
                      "Local archive survives raw-cache removal; off-machine backup is not configured.",
                      "Boundary rendering in MapLibre is a Phase 3 browser acceptance check."]}
        if scope == "england":
            report.update(scope="england", omittedGeometry=omissions,
                          coverageStages={"statisticsBeforePostcodeAndBoundaryReview": before_postcodes,
                                          "afterPostcodeGeographyReview": after_postcodes,
                                          "afterBoundaryReview": coverage},
                          **usable_coverage(areas, postcode_report))
            report["limitations"] = [
                "Complete England inventory is not complete usable coverage; unavailable estimates remain visible.",
                "Unverified stock markers remain unavailable without a parent-area fallback.",
                "Current Barnsley and Sheffield LAD stock totals are missing; older authority totals are not relabelled.",
                "Cross-authority and legacy postcode assignments withhold affected MSOA estimates pending review.",
                "Invalid source geometries are omitted without repair; their statistics remain explicitly unavailable.",
                "Northern Ireland postcode records are excluded from generated lookups.",
                "Internal validation only; hosting, usable-coverage publication review and sustained mobile performance checks remain.",
                "Local source archive is retained; off-machine backup is not configured."]
        write_json(staging / "validation.json", report)
        write_json(staging / "sources.json", {"sources": list(sources.values()),
                    "attribution": sorted({credit for s in sources.values() for credit in s.get("attribution", [])})})
        artifact_inventory = inventory(staging)
        forbidden = [p for p in artifact_inventory if p.endswith((".xlsx", ".ods", ".zip", ".csv"))]
        require(not forbidden, f"Raw source files in browser output: {forbidden}")
        manifest = {"schemaVersion": SCHEMA_VERSION, "releaseId": release_id,
                    "scope": "five-authority-sample" if scope == "sample" else "england", "publicReleaseReady": False,
                    "defaultComparison": "ongoing-owner", "propertyTypes": ["all"],
                    "methodologyVersion": policy["methodologyVersion"],
                    "policyVersions": [policy["id"] + ":" + policy["version"]], "sdltRuleVersion": None,
                    "geographyVintages": {"MSOA": "2021", "LAD": "May 2025"},
                    "coverage": coverage, "artifacts": artifact_inventory,
                    "sourceManifests": archive_report["manifests"],
                    "sources": [{k: s[k] for k in ("id", "sha256", "bytes", "downloadUrl", "referencePeriod")}
                                for s in sources.values()],
                    "toolchain": {"python": platform.python_version(),
                                  "packages": {p: version(p) for p in ("openpyxl", "et_xmlfile", "numpy", "shapely", "pyproj", "certifi")}},
                    "implementation": {str(p.relative_to(root)): sha256(p)
                                       for p in sorted((root / "pipeline").glob("*.py"))},
                    "configuration": {p: sha256(root / p) for p in (
                        "requirements-pipeline.txt", "data/fixtures/phase0-sample-areas.json",
                        "data/fixtures/phase0-worked-examples.json",
                        "data/fixtures/phase1-lad-worked-example.json",
                        "data/policies/illustrative-ppt-v1.json", "docs/methodology.md")}}
        if scope == "england":
            manifest.update(initialAreasPath="councils.json", areaShards=area_shards,
                            omittedGeometry=omissions, **usable_coverage(areas, postcode_report))
        write_json(staging / "manifest.json", manifest)
        activate_release(staging, output_root / release_id, output_root / "manifest.json", manifest)
        evidence_name = "phase1-validation.json" if scope == "sample" else "england-validation.json"
        write_json(root / "docs/evidence" / evidence_name, report)
        print(json.dumps({"releaseId": release_id, "coverage": coverage,
                          "artifactCount": len(artifact_inventory), "checksPassed": True}, indent=2))
        return manifest
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def verify_release(release_dir: Path):
    manifest = json.loads((release_dir / "manifest.json").read_text())
    actual = inventory(release_dir)
    actual.pop("manifest.json")
    require(actual == manifest["artifacts"], "Release artifact checksum/size/file inventory mismatch")
    return {"releaseId": manifest["releaseId"], "verifiedArtifacts": len(actual)}
