#!/usr/bin/env python3
"""
build-rites-from-text.py
Build rite transcription JSON entries by slicing _text/*.txt dumps.
Keeps rite text out of tool responses — Python reads from disk,
nothing is echoed back to the model.

Appends to scripts/rites-transcriptions.json.
"""
import json
from pathlib import Path

ROOT = Path(__file__).parent.parent
TEXT_DIR = ROOT / "docs" / "rites" / "_text"
JSON_OUT = ROOT / "scripts" / "rites-transcriptions.json"

# Each spec: metadata + line range in the text dump (1-indexed inclusive).
# Line numbers were read from the .txt files; rite text stays on disk.
SPEC = [
    # ── Gangrel Cruac ───────────────────────────────────────────
    {
        "name_pdf": "Prey's Blood",
        "csv_match": "Prey's Blood",
        "parent": "Cruac", "rank": 2,
        "book": "Gangrel", "page": "116",
        "target_successes": "", "resistance": "",
        "text_file": "Gangrel Cruac.txt", "lines": [43, 59],
    },
    {
        "name_pdf": "Tickblood",
        "csv_match": None,
        "parent": "Cruac", "rank": 3,
        "book": "Gangrel", "page": "116",
        "target_successes": "", "resistance": "",
        "text_file": "Gangrel Cruac.txt", "lines": [61, 80],
    },
    # ── Boyar Rites ─────────────────────────────────────────────
    {
        "name_pdf": "The Mother's Blessing",
        "csv_match": None,
        "parent": "Cruac", "rank": None,
        "book": "Bloodlines: The Chosen", "page": "113",
        "target_successes": "", "resistance": "",
        "text_file": "Boyar Rites.txt", "lines": [71, 91],
    },
    {
        "name_pdf": "The Boyar's Caul",
        "csv_match": None,
        "parent": "Cruac", "rank": None,
        "book": "Bloodlines: The Chosen", "page": "113",
        "target_successes": "", "resistance": "",
        "text_file": "Boyar Rites.txt", "lines": [93, 123],
    },
    {
        "name_pdf": "Hawthorn Barrier",
        "csv_match": "Hawthorn Barrier",
        "parent": "Cruac", "rank": None,
        "book": "Bloodlines: The Chosen", "page": "114",
        "target_successes": "", "resistance": "",
        "text_file": "Boyar Rites.txt", "lines": [125, 152],
    },
    # ── Kinnaree Cruac ──────────────────────────────────────────
    {
        "name_pdf": "Tapas: Rituals of Penance",
        "csv_match": None,
        "parent": "Cruac", "rank": 1,
        "book": "Bloodlines: The Chosen", "page": "121",
        "target_successes": "", "resistance": "",
        "text_file": "Kinnaree Cruac.txt", "lines": [12, 42],
    },
    {
        "name_pdf": "Gora Mukhi",
        "csv_match": None,
        "parent": "Cruac", "rank": 2,
        "book": "Bloodlines: The Chosen", "page": "121",
        "target_successes": "", "resistance": "",
        "text_file": "Kinnaree Cruac.txt", "lines": [43, 65],
    },
    # ── Mekhet Sethite Crúac ────────────────────────────────────
    {
        "name_pdf": "Genius Loci",
        "csv_match": None,
        "parent": "Cruac", "rank": 1,
        "book": "Mekhet", "page": "107",
        "target_successes": "", "resistance": "",
        "text_file": "Mekhet Cruac.txt", "lines": [109, 125],
    },
    {
        "name_pdf": "Amemet's Pursuit",
        "csv_match": None,
        "parent": "Cruac", "rank": 2,
        "book": "Mekhet", "page": "107",
        "target_successes": "", "resistance": "",
        "text_file": "Mekhet Cruac.txt", "lines": [126, 142],
    },
    {
        "name_pdf": "The Hand of Seth",
        "csv_match": None,
        "parent": "Cruac", "rank": 3,
        "book": "Mekhet", "page": "107",
        "target_successes": "", "resistance": "",
        "text_file": "Mekhet Cruac.txt", "lines": [143, 154],
    },
    {
        "name_pdf": "The Thrashing of Apep's Coils",
        "csv_match": None,
        "parent": "Cruac", "rank": 4,
        "book": "Mekhet", "page": "107",
        "target_successes": "", "resistance": "",
        "text_file": "Mekhet Cruac.txt", "lines": [155, 163],
    },
    {
        "name_pdf": "Blade of Tu'at",
        "csv_match": None,
        "parent": "Cruac", "rank": 4,
        "book": "Mekhet", "page": "107",
        "target_successes": "", "resistance": "",
        "text_file": "Mekhet Cruac.txt", "lines": [164, 173],
    },
    {
        "name_pdf": "The Rite of Going Forth By Day",
        "csv_match": None,
        "parent": "Cruac", "rank": 5,
        "book": "Mekhet", "page": "107",
        "target_successes": "", "resistance": "",
        "text_file": "Mekhet Cruac.txt", "lines": [174, 198],
    },
]


def extract_block(text_file_rel, lines_range):
    path = TEXT_DIR / text_file_rel
    with path.open(encoding="utf-8") as f:
        all_lines = f.readlines()
    lo, hi = lines_range
    block = all_lines[lo - 1 : hi]
    # Rejoin: keep paragraph structure but collapse inline hyphenation
    text = "".join(block).strip()
    return text


def main():
    with JSON_OUT.open(encoding="utf-8") as f:
        existing = json.load(f)

    existing_names = {e["name_pdf"].lower() for e in existing}
    added = 0

    for item in SPEC:
        if item["name_pdf"].lower() in existing_names:
            print(f"  skip (already in JSON): {item['name_pdf']}")
            continue
        entry = {
            "book": item["book"],
            "page": item["page"],
            "parent": item["parent"],
            "rank": item["rank"] if item["rank"] is not None else "",
            "name_pdf": item["name_pdf"],
            "csv_match": item.get("csv_match"),
            "target_successes": item.get("target_successes", ""),
            "resistance": item.get("resistance", ""),
            "description": extract_block(item["text_file"], item["lines"]),
        }
        existing.append(entry)
        added += 1
        print(f"  added: {item['name_pdf']} ({entry['book']} p{entry['page']}, {len(entry['description'])} chars)")

    with JSON_OUT.open("w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)

    print(f"Wrote {added} new entries, total now {len(existing)}")


if __name__ == "__main__":
    main()
