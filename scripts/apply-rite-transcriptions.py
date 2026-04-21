#!/usr/bin/env python3
"""
apply-rite-transcriptions.py
Apply PDF-extracted rite transcriptions to Rites DB.populated.csv.

- Updates existing rows by name match
- Adds new rows for rites not yet in CSV (csv_match: null)
- Preserves UTF-8 BOM (Excel-friendly)
- Verbatim from PDF: no streamlining, no rewording
"""
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent
SRC_CSV    = ROOT / "Rites DB.populated.csv"
DATA_JSON  = ROOT / "scripts" / "rites-transcriptions.json"

# Pool formulas are standard per tradition (stated in VtR 2e Core)
POOLS = {
    "Cruac":  {"attr": "Manipulation", "skill": "Occult",    "disc": "Cruac",  "cost": "1 V"},
    "Theban": {"attr": "Intelligence", "skill": "Academics", "disc": "Theban", "cost": "1 WP"},
}

def slugify(name):
    s = name.lower()
    s = re.sub(r"[’']", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return f"rite-{s}"

def main():
    # Read existing CSV
    with SRC_CSV.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))
    header, body = rows[0], rows[1:]
    IDX = {h: i for i, h in enumerate(header)}
    for req in ["target_successes", "book_source", "page_number", "description",
                "resistance", "name", "key", "parent", "rank", "category",
                "pool_attr", "pool_skill", "pool_disc", "cost", "action"]:
        if req not in IDX:
            raise SystemExit(f"missing column: {req}")

    # Index by lowercased name
    by_name = {r[IDX["name"]].lower(): r for r in body}

    # Load transcriptions
    with DATA_JSON.open(encoding="utf-8") as f:
        tx = json.load(f)

    stats = {"updated": 0, "added": 0, "skipped": 0}
    added_rows = []

    for e in tx:
        match_name = (e.get("csv_match") or "").lower().strip()
        # Upsert: if csv_match not set, fall back to name_pdf so re-runs don't duplicate
        if not match_name:
            fallback = e.get("name_pdf", "").lower().strip()
            if fallback in by_name:
                match_name = fallback
        if match_name and match_name in by_name:
            row = by_name[match_name]
            # Rename if PDF name differs (book is authoritative)
            if e["name_pdf"] != row[IDX["name"]]:
                row[IDX["name"]] = e["name_pdf"]
                row[IDX["key"]]  = slugify(e["name_pdf"])
            row[IDX["target_successes"]] = e.get("target_successes", "")
            row[IDX["description"]]      = e.get("description", "")
            row[IDX["book_source"]]      = e.get("book", "")
            row[IDX["page_number"]]      = str(e.get("page", ""))
            row[IDX["resistance"]]       = e.get("resistance", "")
            if e.get("sub_category"):
                row[IDX["sub_category"]] = e["sub_category"]
            # Pool/cost — apply tradition defaults if row is currently empty
            pool = POOLS.get(e.get("parent", ""), {})
            if pool and not row[IDX["pool_attr"]]:
                row[IDX["pool_attr"]]  = pool["attr"]
                row[IDX["pool_skill"]] = pool["skill"]
                row[IDX["pool_disc"]]  = pool["disc"]
            if pool and not row[IDX["cost"]]:
                row[IDX["cost"]] = pool["cost"]
            stats["updated"] += 1
        elif e.get("csv_match"):
            # Explicit match requested but not found — skip and warn
            print(f"  WARN: csv_match={e['csv_match']!r} not found for PDF rite {e['name_pdf']!r}")
            stats["skipped"] += 1
        else:
            # New row
            new = ["" for _ in header]
            new[IDX["key"]]      = slugify(e["name_pdf"])
            new[IDX["name"]]     = e["name_pdf"]
            new[IDX["category"]] = "rite"
            new[IDX["parent"]]   = e["parent"]
            new[IDX["rank"]]     = str(e["rank"])
            new[IDX["target_successes"]] = e.get("target_successes", "")
            pool = POOLS.get(e["parent"], {})
            new[IDX["pool_attr"]]  = pool.get("attr", "")
            new[IDX["pool_skill"]] = pool.get("skill", "")
            new[IDX["pool_disc"]]  = pool.get("disc", "")
            new[IDX["cost"]]       = pool.get("cost", "")
            new[IDX["action"]]     = "Ritual"
            new[IDX["resistance"]] = e.get("resistance", "")
            new[IDX["sub_category"]] = e.get("sub_category", "")
            new[IDX["description"]] = e.get("description", "")
            new[IDX["book_source"]] = e.get("book", "")
            new[IDX["page_number"]] = str(e.get("page", ""))
            added_rows.append(new)
            stats["added"] += 1

    # Merge and sort alphabetically by name
    merged = body + added_rows
    merged.sort(key=lambda r: r[IDX["name"]].lower())

    with SRC_CSV.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(merged)

    print(f"Applied {len(tx)} transcriptions: "
          f"{stats['updated']} updated, {stats['added']} added, "
          f"{stats['skipped']} skipped")
    print(f"Total rows in CSV: {len(merged)}")

if __name__ == "__main__":
    main()
