"""Stream the pinned ONSPD into minimal lookups excluding Northern Ireland.

The intermediate SQLite database is temporary and is never a browser artifact.
No postcode validity, country or geography is inferred from postcode syntax.
"""

from __future__ import annotations

import csv
import gzip
import hashlib
import io
import itertools
import json
import math
import re
import sqlite3
import tempfile
from collections import Counter, defaultdict
from contextlib import contextmanager
from pathlib import Path
from zipfile import ZipFile

FIELDS = ["postcode", "latitude", "longitude", "country", "msoa21", "sourceLad",
          "status", "terminationMonth", "positionQuality"]
REQUIRED_FIELDS = {"pcds", "doterm", "ctry", "msoa21", "oslaua", "lat", "long", "osgrdind"}
ENGLAND = "E92000001"
NORTHERN_IRELAND = "N92000002"
# Reviewed source-vintage exceptions in the Phase 0 methodology. Keep original
# codes; they cannot establish the geography of the replacement LAD boundaries.
LEGACY_LADS = {"E08000016": "Barnsley", "E08000019": "Sheffield"}
REORG_PARENTS = {"E08000038", "E08000039"}
COUNTRIES = {
    "E92000001": "England", "W92000004": "Wales", "S92000003": "Scotland",
    "N92000002": "Northern Ireland", "L93000001": "Channel Islands",
    "M83000003": "Isle of Man",
}


def normalise_postcode(value: str) -> str:
    """Canonical key, not a claim that a postcode exists or belongs to the UK."""
    compact = re.sub(r"\s+", "", value).upper()
    if not re.fullmatch(r"[A-Z0-9]{5,7}", compact):
        raise ValueError(f"Malformed source postcode: {value!r}")
    return compact[:-3] + " " + compact[-3:]


def _code(value: str) -> str | None:
    value = value.strip()
    if not value or value.endswith("99999999"):
        return None
    if not re.fullmatch(r"[A-Z][0-9]{8}", value):
        raise ValueError(f"Unrecognised source geography code: {value!r}")
    return value


def _coordinates(row: dict[str, str]) -> tuple[float | None, float | None]:
    """ONSPD's 99.999999/0.000000 sentinel pair is an unavailable location."""
    if not row["lat"].strip() or not row["long"].strip() or row["osgrdind"] == "9":
        return None, None
    latitude, longitude = float(row["lat"]), float(row["long"])
    if latitude == 99.999999:
        return None, None
    if not (math.isfinite(latitude) and math.isfinite(longitude)
            and -90 <= latitude <= 90 and -180 <= longitude <= 180):
        raise ValueError(f"Invalid source location for {row['pcds']}: {latitude}, {longitude}")
    return latitude, longitude


@contextmanager
def _source_tables(source_path: Path):
    """Read only multi-CSV members (never the duplicate national TXT version)."""
    if source_path.suffix.lower() == ".zip":
        with ZipFile(source_path) as archive:
            members = sorted(n for n in archive.namelist()
                             if n.startswith("Data/multi_csv/") and n.lower().endswith(".csv"))
            if not members:
                raise ValueError("ONSPD archive has no Data/multi_csv members")

            def tables():
                for member in members:
                    with archive.open(member) as raw:
                        with io.TextIOWrapper(raw, encoding="utf-8-sig", newline="") as text:
                            yield member, csv.DictReader(text)
            yield tables()
    else:
        with source_path.open(encoding="utf-8-sig", newline="") as text:
            yield iter([(source_path.name, csv.DictReader(text))])


def _write_json(path: Path, value: object) -> bytes:
    payload = (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"),
                          allow_nan=False) + "\n").encode()
    path.write_bytes(payload)
    return payload


def _digest(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def build_postcodes(source_path: Path, output_dir: Path, sample_msoas: set[str],
                    sample_lads: set[str], parent_lookup: dict[str, str]) -> dict:
    """Write postcodes/index.json and JSON/gzip shards; return validation evidence.

    Unavailable tax geography is decided by the caller from
    ``sampleGeographyNeedsReview``. All current English assignments contribute to
    that evidence; terminated postcodes never establish a present-day conflict.
    """
    destination = output_dir / "postcodes"
    destination.mkdir(parents=True, exist_ok=True)
    if any(destination.iterdir()):
        raise ValueError(f"Postcode output must be empty: {destination}")
    counts: Counter = Counter()
    countries: Counter = Counter()
    country_status: Counter = Counter()
    quality: Counter = Counter()
    current_lads: dict[str, Counter] = defaultdict(Counter)
    examples: dict[tuple[str, str], list[str]] = defaultdict(list)
    unresolved: Counter = Counter()
    unresolved_examples: dict[str, list[dict]] = defaultdict(list)
    legacy_assignments: Counter = Counter()
    legacy_examples: dict[tuple, list[str]] = defaultdict(list)
    sample_reasons: dict[str, set[str]] = defaultdict(set)
    sample_seen: Counter = Counter()
    source_members = []
    shards = {}
    excluded_northern_ireland = 0
    english_msoas = {code for code in parent_lookup if code.startswith("E")}
    english_lads = {parent_lookup[code] for code in english_msoas}
    with tempfile.TemporaryDirectory(prefix="tax-map-postcodes-") as temp:
        db = sqlite3.connect(str(Path(temp) / "lookup.sqlite"))
        try:
            db.execute("PRAGMA journal_mode=OFF")
            db.execute("PRAGMA synchronous=OFF")
            db.execute("CREATE TABLE postcode (postcode TEXT PRIMARY KEY, outward TEXT NOT NULL, row_json TEXT NOT NULL)")
            with _source_tables(source_path) as tables:
                for member, reader in tables:
                    if not REQUIRED_FIELDS.issubset(reader.fieldnames or []):
                        raise ValueError(f"Missing ONSPD columns in {member}: {sorted(REQUIRED_FIELDS - set(reader.fieldnames or []))}")
                    member_count = 0
                    for source_row, row in enumerate(reader, 2):
                        postcode = normalise_postcode(row["pcds"])
                        outward = postcode.split(" ")[0]
                        member_count += 1
                        # Publication policy, not postcode validity inference:
                        # exclude either NI marker before retaining any record.
                        if outward.startswith("BT") or row["ctry"].strip() == NORTHERN_IRELAND:
                            excluded_northern_ireland += 1
                            continue
                        termination = row["doterm"].strip() or None
                        if termination and not re.fullmatch(r"[0-9]{4}(0[1-9]|1[0-2])", termination):
                            raise ValueError(f"Invalid termination month: {postcode} {termination}")
                        status = "terminated" if termination else "current"
                        country = _code(row["ctry"])
                        if country and country not in COUNTRIES:
                            raise ValueError(f"Unrecognised ONSPD country code: {country}")
                        msoa, lad = _code(row["msoa21"]), _code(row["oslaua"])
                        latitude, longitude = _coordinates(row)
                        position_quality = row["osgrdind"].strip() or None
                        if position_quality not in {None, "1", "2", "3", "4", "5", "6", "8", "9"}:
                            raise ValueError(f"Unrecognised position quality: {postcode} {position_quality}")
                        record = [postcode, latitude, longitude, country, msoa, lad,
                                  status, termination, position_quality]
                        try:
                            db.execute("INSERT INTO postcode VALUES (?, ?, ?)",
                                       (postcode, outward, json.dumps(record, separators=(",", ":"), allow_nan=False)))
                        except sqlite3.IntegrityError as error:
                            raise ValueError(f"Duplicate postcode {postcode} at {member}:{source_row}") from error
                        counts[status] += 1
                        countries[country or "unknown"] += 1
                        country_status[(country or "unknown", status)] += 1
                        quality[position_quality or "unknown"] += 1
                        if latitude is None:
                            counts["locationUnavailable"] += 1
                        if country is None:
                            counts["countryUnavailable"] += 1
                        if country == ENGLAND and msoa in sample_msoas:
                            counts["sample" + status.title()] += 1
                        if status != "current" or country != ENGLAND:
                            continue
                        if msoa is not None and msoa not in english_msoas:
                            raise ValueError(f"Unexplained current English MSOA join: {postcode} source msoa21={msoa}; absent from English official parent lookup at {member}:{source_row}")
                        legacy_key = None
                        if lad in LEGACY_LADS:
                            if msoa is not None and parent_lookup[msoa] not in REORG_PARENTS:
                                raise ValueError(f"Unexplained legacy English LAD join: {postcode} source oslaua={lad}, msoa21={msoa}, official parent={parent_lookup[msoa]}")
                            legacy_key = (msoa, lad, parent_lookup.get(msoa))
                            legacy_assignments[legacy_key] += 1
                            legacy_examples[legacy_key] = sorted(legacy_examples[legacy_key] + [postcode])[:3]
                            if msoa in sample_msoas:
                                sample_reasons[msoa].add("source-lad-precedes-current-boundary")
                        elif lad is not None and lad not in english_lads:
                            raise ValueError(f"Unexplained current English LAD join: {postcode} source oslaua={lad}; absent from English official parent lookup values at {member}:{source_row}")
                        if msoa in sample_msoas:
                            sample_seen[msoa] += 1
                        reason = None
                        if msoa is None:
                            reason = "msoa-unavailable"
                        elif lad is None:
                            reason = "lad-unavailable"
                        if reason:
                            unresolved[reason] += 1
                            if len(unresolved_examples[reason]) < 10:
                                unresolved_examples[reason].append({"postcode": postcode, "msoaCode": msoa,
                                    "sourceLadCode": lad, "member": member, "row": source_row})
                            if msoa in sample_msoas:
                                sample_reasons[msoa].add(reason)
                        if msoa is not None and lad is not None and legacy_key is None:
                            current_lads[msoa][lad] += 1
                            key = (msoa, lad)
                            # Bounded, source-order-independent audit witnesses.
                            examples[key] = sorted(examples[key] + [postcode])[:3]
                    source_members.append({"member": member, "rows": member_count})
                    db.commit()

            cross_authority, conflicts = [], []
            for msoa, assignments in sorted(current_lads.items()):
                official_parent = parent_lookup.get(msoa)
                detail = {"msoaCode": msoa, "officialParentLadCode": official_parent,
                          "assignments": [{"ladCode": lad, "currentPostcodes": count,
                                           "examples": examples[(msoa, lad)]}
                                          for lad, count in sorted(assignments.items())]}
                if len(assignments) > 1:
                    cross_authority.append(detail)
                    if msoa in sample_msoas:
                        sample_reasons[msoa].add("cross-authority-postcode-assignments")
                if official_parent and any(lad != official_parent for lad in assignments):
                    conflicts.append(detail)
                    if msoa in sample_msoas:
                        sample_reasons[msoa].add("postcode-lad-conflicts-with-official-parent")
            for msoa in sorted(sample_msoas):
                if not sample_seen[msoa]:
                    sample_reasons[msoa].add("no-current-postcodes")
                if parent_lookup.get(msoa) not in sample_lads:
                    sample_reasons[msoa].add("sample-msoa-parent-outside-sample-authorities")

            rows = db.execute("SELECT outward, row_json FROM postcode ORDER BY outward, postcode")
            for outward, group in itertools.groupby(rows, key=lambda r: r[0]):
                records = [json.loads(row[1]) for row in group]
                path = destination / f"{outward}.json"
                payload = _write_json(path, {"schemaVersion": 1, "outward": outward, "rows": records})
                compressed = io.BytesIO()
                with gzip.GzipFile(filename="", fileobj=compressed, mode="wb", compresslevel=9, mtime=0) as gz:
                    gz.write(payload)
                gzip_payload = compressed.getvalue()
                path.with_suffix(".json.gz").write_bytes(gzip_payload)
                shards[outward] = {"path": f"postcodes/{outward}.json", "records": len(records),
                                    "bytes": len(payload), "sha256": _digest(payload),
                                    "gzipPath": f"postcodes/{outward}.json.gz",
                                    "gzipBytes": len(gzip_payload), "gzipSha256": _digest(gzip_payload)}
        finally:
            db.close()

    report = {
        "schemaVersion": 1, "sourceId": "postcode-directory", "sourceMembers": source_members,
        "records": counts["current"] + counts["terminated"], "counts": dict(sorted(counts.items())),
        "countries": dict(sorted(countries.items())),
        "countryStatus": [{"country": c, "status": s, "records": count}
                          for (c, s), count in sorted(country_status.items())],
        "positionQuality": dict(sorted(quality.items())), "shards": len(shards),
        "duplicatePostcodes": 0,
        "crossAuthorityMsoas": cross_authority, "parentConflicts": conflicts,
        "unresolvedCurrentEnglishGeography": dict(sorted(unresolved.items())),
        "unresolvedCurrentEnglishGeographyExamples": dict(sorted(unresolved_examples.items())),
        "legacyAuthorityAssignments": [
            {"msoaCode": msoa, "sourceLadCode": lad, "officialParentLadCode": parent,
             "reason": "source-lad-precedes-current-boundary", "currentPostcodes": count,
             "examples": legacy_examples[(msoa, lad, parent)]}
            for (msoa, lad, parent), count in sorted(legacy_assignments.items(), key=lambda item: str(item[0]))],
        "sampleGeographyNeedsReview": [{"msoaCode": msoa, "reasons": sorted(reasons)}
                                       for msoa, reasons in sorted(sample_reasons.items())],
        "sampleCurrentPostcodesByMsoa": dict(sorted(sample_seen.items())),
        "publicReleaseReady": False,
        "publicationRestriction": "Northern Ireland records are excluded; coverage and other release readiness checks still apply.",
        "publicationFilter": {"excludedCountry": NORTHERN_IRELAND,
                              "excludedRecords": excluded_northern_ireland},
    }
    index = {
        "schemaVersion": 1, "sourceId": "postcode-directory", "referencePeriod": "2025-05",
        "coverage": "Pinned postcode directory excluding all Northern Ireland records. BT postcodes are outside this lookup.",
        "fields": FIELDS, "countries": {code: label for code, label in COUNTRIES.items() if code != NORTHERN_IRELAND},
        "sampleMsoas": sorted(sample_msoas), "sampleLads": sorted(sample_lads),
        "records": report["records"], "shards": shards,
        "publicReleaseReady": False, "publicationRestriction": report["publicationRestriction"],
    }
    _write_json(destination / "index.json", index)
    return report
