"""Reproduce Phase 0 evidence from pinned, local source files; no network calls.

This is a source audit and fixture generator, not the production data pipeline.
Run from any directory with Python 3.11+ and openpyxl 3.1.5.
"""

import csv
import hashlib
import json
from collections import Counter
from decimal import Decimal, ROUND_HALF_UP
from fractions import Fraction
from io import TextIOWrapper
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

import openpyxl

ROOT = Path(__file__).resolve().parents[2]
PERIOD = "Year ending Sep 2025"
BANDS = "abcdefgh"
NINTHS = (6, 7, 8, 9, 11, 13, 15, 18)
SAMPLES = {
    "E06000016": ("Leicester", "urban unitary", "E02002830"),
    "E09000032": ("Wandsworth", "London; high prices and low Council Tax", "E02000923"),
    "E07000117": ("Burnley", "lower prices; two-tier authority and local precepts", "E02005179"),
    "E06000063": ("Cumberland", "2023 reorganisation; rural and urban mix", "E02003967"),
    "E06000065": ("North Yorkshire", "rural; 2023 reorganisation and parish variation", "E02005742"),
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def dump(path, value):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def money(value):
    value = Fraction(value)
    return str((Decimal(value.numerator) / Decimal(value.denominator)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    ))


def prices(path, sheet, code_col, name_col):
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    result = {}
    rows = workbook[sheet].values
    next(rows)
    next(rows)
    headers = next(rows)
    period_col = headers.index(PERIOD)
    for row_number, row in enumerate(rows, 4):
        code = row[code_col]
        if not isinstance(code, str) or not code.startswith(("E0", "W0")):
            continue
        require(code not in result, f"Duplicate price code {code}")
        result[code] = {
            "code": code, "name": row[name_col], "value": row[period_col],
            "cell": f"{sheet}!{openpyxl.utils.get_column_letter(period_col + 1)}{row_number}",
            "row": row_number,
        }
        if sheet == "1a":
            result[code]["lad_code"] = row[0]
    workbook.close()
    return result


def stock(path):
    with ZipFile(path) as archive:
        member = "CTSOP1.1/CTSOP1_1_2025_03_31.csv"
        with archive.open(member) as stream:
            rows = list(csv.DictReader(TextIOWrapper(stream, encoding="utf-8-sig")))
    result, authorities = {}, {}
    parent = None
    for row_number, row in enumerate(rows, 2):
        if row["geography"] == "LAUA":
            parent = row["ecode"]
            authorities[parent] = {**row, "source_row": row_number}
        if row["geography"] == "MSOA":
            require(row["ecode"] not in result, f"Duplicate stock code {row['ecode']}")
            result[row["ecode"]] = {
                **row, "source_row": row_number, "observed_parent_group": parent
            }
    return result, authorities


def billing(path):
    ns = {
        "table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
        "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
    }
    table_ns, office_ns = "{" + ns["table"] + "}", "{" + ns["office"] + "}"
    with ZipFile(path) as archive:
        tree = ET.fromstring(archive.read("content.xml"))
    table = next(t for t in tree.findall(".//table:table", ns)
                 if t.get(table_ns + "name") == "Data_Billing")
    result, row_number = {}, 0
    for row in table.findall("table:table-row", ns):
        row_number += 1
        repetitions = int(row.get(table_ns + "number-rows-repeated", "1"))
        values = []
        for cell in row:
            value = (cell.get(office_ns + "value")
                     if cell.get(office_ns + "value-type") in ("float", "currency", "percentage")
                     else "".join(cell.itertext()))
            values.extend([value] * min(int(cell.get(table_ns + "number-columns-repeated", "1")), 110))
        if len(values) > 37 and isinstance(values[1], str) and values[1].startswith("E0"):
            code = values[1]
            require(repetitions == 1 and code not in result, f"Duplicate billing code {code}")
            result[code] = {
                "name": values[2], "row": row_number,
                "gss_cell": f"Data_Billing!B{row_number}",
                "band_d_cell": f"Data_Billing!AL{row_number}",
                "band_d_gbp": money(Fraction(values[37])),
                "raw_band_d_value": values[37],
                "components_gbp": {
                    "billing_including_local_precepts_Z": money(Fraction(values[25])),
                    "county_or_gla_AH": money(Fraction(values[33])),
                    "police_AI": money(Fraction(values[34])),
                    "fire_AJ": money(Fraction(values[35])),
                    "combined_authority_AK": money(Fraction(values[36])),
                },
            }
        row_number += repetitions - 1
    return result


def boundaries(path, field):
    data = json.loads(path.read_text())
    require(data.get("type") == "FeatureCollection", f"Invalid GeoJSON {path.name}")
    require(not data.get("exceededTransferLimit"), f"Truncated GeoJSON {path.name}")
    result = {}
    for feature in data["features"]:
        code = feature["properties"][field]
        require(code not in result, f"Duplicate boundary code {code}")
        require(feature.get("geometry") and feature["geometry"].get("coordinates"),
                f"Missing polygon {code}")
        result[code] = feature
    return result


def main():
    manifest = json.loads((ROOT / "data/source-manifest.json").read_text())
    sources = {s["id"]: s for s in manifest["sources"]}
    for source in sources.values():
        path = ROOT / source["localPath"]
        require(path.exists(), f"Missing pinned source {path}; use manifest downloadUrl")
        require(hashlib.sha256(path.read_bytes()).hexdigest() == source["sha256"],
                f"Source changed: {source['id']}; review and repin explicitly")
    source_path = lambda key: ROOT / sources[key]["localPath"]
    msoa_prices = prices(source_path("ons-msoa-prices"), "1a", 2, 3)
    lad_prices = prices(source_path("ons-lad-prices"), "2a", 2, 3)
    counts, authority_counts = stock(source_path("voa-stock-all"))
    charges = billing(source_path("council-tax"))
    with source_path("msoa-lad-lookup").open(encoding="utf-8-sig") as file:
        lookup_rows = list(csv.DictReader(file))
    lookup = {r["MSOA21CD"]: r for r in lookup_rows}
    require(len(lookup) == len(lookup_rows), "Duplicate official lookup codes")
    polygons = boundaries(source_path("msoa-boundaries"), "MSOA21CD")
    lad_polygons = boundaries(source_path("lad-boundaries"), "LAD25CD")
    require(set(msoa_prices) == set(counts) == set(lookup) == set(polygons),
            "Price, stock, lookup or MSOA boundary inventories differ")
    england = {c for c in lookup if c.startswith("E")}
    require(len(england) == 6856, "Pinned England MSOA inventory changed")
    require(set(charges) == {c for c in lad_polygons if c.startswith("E")},
            "Billing and England LAD boundary inventories differ")
    require(all(msoa_prices[c]["lad_code"] == lookup[c]["LAD25CD"] for c in lookup),
            "ONS prices and current official LAD lookup disagree")
    require(all(lookup[c]["LAD25CD"] in charges for c in england), "Missing charge join")

    disagreements = [
        {"msoa_code": c, "stock_parent_group": counts[c]["observed_parent_group"],
         "current_lad_code": lookup[c]["LAD25CD"]}
        for c in sorted(england)
        if counts[c]["observed_parent_group"] != lookup[c]["LAD25CD"]
    ]
    unknown = [c for c in sorted(england)
               if any(not counts[c]["band_" + b].isdigit() for b in BANDS)]
    nonnumeric = Counter(counts[c]["band_" + b] for c in england for b in BANDS
                         if not counts[c]["band_" + b].isdigit())
    numeric = england - set(unknown)
    differences = {
        c: sum(int(counts[c]["band_" + b]) for b in BANDS) - int(counts[c]["all_properties"])
        for c in numeric
    }
    require(all(abs(v) <= 45 for v in differences.values()), "Stock total exceeds rounding tolerance")

    policy = json.loads((ROOT / "data/policies/illustrative-ppt-v1.json").read_text())
    rate = Fraction(policy["annualRate"]["numerator"], policy["annualRate"]["denominator"])
    require(rate == Fraction(48, 10000), "Policy rate mismatch")
    samples, worked = [], []
    for lad, (name, reason, code) in SAMPLES.items():
        area_codes = sorted(c for c in england if lookup[c]["LAD25CD"] == lad)
        require(code in area_codes and code in numeric, f"Invalid sample {code}")
        require(lad in lad_prices and lad in authority_counts, f"Missing LAD sample inputs {lad}")
        samples.append({
            "lad_code": lad, "name": name, "selection_reason": reason,
            "msoa_codes": area_codes, "msoa_count": len(area_codes),
            "complete_band_count_msoas": len(set(area_codes) & numeric),
            "unknown_marker_msoas": len(set(area_codes) & set(unknown)),
            "worked_example_msoa": code,
            "lad_price": lad_prices[lad], "band_d_gbp": charges[lad]["band_d_gbp"],
        })
        row = counts[code]
        band_counts = [int(row["band_" + b]) for b in BANDS]
        total = sum(band_counts)
        ninth_sum = sum(n * weight for n, weight in zip(band_counts, NINTHS))
        band_d = Fraction(charges[lad]["band_d_gbp"])
        current = band_d * Fraction(ninth_sum, 9 * total)
        value = Fraction(str(msoa_prices[code]["value"]))
        scenario, change = value * rate, value * rate - current
        components = sum(Fraction(v) for v in charges[lad]["components_gbp"].values())
        require(abs(components - band_d) <= Fraction(5, 100), "Band D components do not reconcile")
        worked.append({
            "msoa_code": code, "msoa_name": msoa_prices[code]["name"],
            "statistical_name": lookup[code]["MSOA21NM"], "lad_code": lad,
            "property_type": "all", "comparison": "ongoing-owner",
            "policy_version": "illustrative-ppt:1.0.0",
            "price": {"source_id": "ons-msoa-prices", **msoa_prices[code]},
            "stock": {"source_id": "voa-stock-all", "member": "CTSOP1.1/CTSOP1_1_2025_03_31.csv",
                      "csv_row": row["source_row"], "counts_by_band": dict(zip(BANDS.upper(), band_counts)),
                      "reported_total": int(row["all_properties"]), "sum_of_bands": total,
                      "reconciliation_difference": total - int(row["all_properties"]),
                      "weighted_ninths_sum": ninth_sum},
            "charge": {"source_id": "council-tax", **charges[lad]},
            "baseline_exact_gbp": {"numerator": current.numerator, "denominator": current.denominator},
            "expected": {"baseline_gbp": money(current), "scenario_gbp": money(scenario),
                         "annual_change_gbp": money(change), "monthly_equivalent_gbp": money(change / 12)},
            "quality_flags": ["rounded-stock-counts", "authority-average-charge-proxy", "mixed-source-periods"],
        })

    selected_codes = {c for s in samples for c in s["msoa_codes"]}
    dump("data/fixtures/phase0-sample-boundaries.geojson", {
        "type": "FeatureCollection", "features": [polygons[c] for c in sorted(selected_codes)]
    })
    dump("data/fixtures/phase0-sample-areas.json", samples)
    dump("data/fixtures/phase0-worked-examples.json", worked)
    dump("docs/evidence/phase0-validation.json", {
        "as_of": "2026-09-06", "scope": "source contract audit; no production dataset built",
        "hashed_source_count": len(sources), "england_msoa_count": len(england),
        "england_lad_count": len(charges), "price_stock_lookup_boundary_code_sets_equal": True,
        "price_to_current_lad_disagreements": 0, "missing_current_billing_joins": 0,
        "stock_parent_group_disagreements": disagreements,
        "nonnumeric_band_markers": dict(nonnumeric), "msoas_with_unknown_band_markers": len(unknown),
        "msoas_with_numeric_band_counts": len(numeric),
        "max_abs_band_sum_minus_published_total": max(abs(v) for v in differences.values()),
        "rounding_tolerance_dwellings": 45,
        "sample_authorities": len(samples), "sample_msoas": len(selected_codes),
        "sample_complete_band_count_msoas": sum(s["complete_band_count_msoas"] for s in samples),
        "sample_unknown_marker_msoas": sum(s["unknown_marker_msoas"] for s in samples),
        "worked_example_count": len(worked), "checks_passed": True,
        "limitations": [
            "The CSV dash marker is undocumented in the inspected notes; retain unavailable, never coerce to zero.",
            "Complete band counts do not establish source accuracy or eliminate local charge variation.",
            "Stock parent groups are observed row grouping, not an authoritative geographic join.",
            "Non-nesting areas and changed authority boundaries require explicit treatment before England publication.",
            "Polygon presence and IDs are checked; detailed topology and postcode coverage are Phase 1 work."
        ]
    })
    print(json.dumps({"hashed_sources": len(sources), "english_msoas": len(england),
                      "english_lads": len(charges), "sample_msoas": len(selected_codes),
                      "sample_usable_before_other_quality_checks": sum(s["complete_band_count_msoas"] for s in samples),
                      "worked_examples": [w["expected"] for w in worked]}, indent=2))


if __name__ == "__main__":
    main()
