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
    # ── SotC Cruac (Secrets of the Covenants) ───────────────────
    # Style column (sub_category): Transmutation / Destruction / Divination / Creation
    {
        "name_pdf": "The Mantle of Amorous Fire",
        "csv_match": "Mantle of Amorous Fire",
        "parent": "Cruac", "rank": 1,
        "sub_category": "Transmutation 1",
        "book": "Secrets of the Covenants", "page": "184",
        "target_successes": "5", "resistance": "",
        "text_file": "SotC Cruac.txt", "lines": [278, 286],
    },
    {
        "name_pdf": "The Pool of Forbidden Truths",
        "csv_match": "The Pool of Forbidden Truths",
        "parent": "Cruac", "rank": 1,
        "sub_category": "Divination 1",
        "book": "Secrets of the Covenants", "page": "184",
        "target_successes": "5", "resistance": "",
        "text_file": "SotC Cruac.txt", "lines": [287, 298],
    },
    {
        "name_pdf": "Donning the Beast's Flesh",
        "csv_match": None,
        "parent": "Cruac", "rank": 3,
        "sub_category": "Transmutation 3",
        "book": "Secrets of the Covenants", "page": "184",
        "target_successes": "7", "resistance": "",
        "text_file": "SotC Cruac.txt", "lines": [299, 308],
    },
    {
        "name_pdf": "Mantle of the Beast's Breath",
        "csv_match": None,
        "parent": "Cruac", "rank": 2,
        "sub_category": "Transmutation 2",
        "book": "Secrets of the Covenants", "page": "184",
        "target_successes": "5", "resistance": "",
        "text_file": "SotC Cruac.txt", "lines": [309, 319],
    },
    {
        "name_pdf": "Shed the Virulent Bowels",
        "csv_match": "Shed the Virulent Bowels",
        "parent": "Cruac", "rank": 2,
        "sub_category": "Destruction 2",
        "book": "Secrets of the Covenants", "page": "185",
        "target_successes": "6", "resistance": "Contested by: Stamina + Blood Potency",
        "text_file": "SotC Cruac.txt", "lines": [320, 335],
    },
    {
        "name_pdf": "Curse of Aphrodite's Favor",
        "csv_match": "Curse of Aphrodite",
        "parent": "Cruac", "rank": 3,
        "sub_category": "Transmutation 3",
        "book": "Secrets of the Covenants", "page": "185",
        "target_successes": "6", "resistance": "Contested by: Composure + Blood Potency",
        "text_file": "SotC Cruac.txt", "lines": [336, 348],
    },
    {
        "name_pdf": "Curse of the Beloved Toy",
        "csv_match": None,
        "parent": "Cruac", "rank": 3,
        "sub_category": "Divination 3",
        "book": "Secrets of the Covenants", "page": "185",
        "target_successes": "6", "resistance": "",
        "text_file": "SotC Cruac.txt", "lines": [349, 363],
    },
    {
        "name_pdf": "Gorgon's Gaze",
        "csv_match": "Gorgon's Gaze",
        "parent": "Cruac", "rank": 4,
        "sub_category": "Transmutation 4",
        "book": "Secrets of the Covenants", "page": "185",
        "target_successes": "7", "resistance": "",
        "text_file": "SotC Cruac.txt", "lines": [364, 379],
    },
    {
        "name_pdf": "Mantle of the Glorious Revival",
        "csv_match": None,
        "parent": "Cruac", "rank": 3,
        "sub_category": "Transmutation 3",
        "book": "Secrets of the Covenants", "page": "185",
        "target_successes": "5", "resistance": "",
        "text_file": "SotC Cruac.txt", "lines": [380, 389],
    },
    {
        "name_pdf": "Bounty of the Storm",
        "csv_match": None,
        "parent": "Cruac", "rank": 4,
        "sub_category": "Transmutation 4",
        "book": "Secrets of the Covenants", "page": "185",
        "target_successes": "10", "resistance": "",
        "text_file": "SotC Cruac.txt", "lines": [390, 412],
    },
    {
        "name_pdf": "Denying Hades",
        "csv_match": None,
        "parent": "Cruac", "rank": 5,
        "sub_category": "Transmutation 5",
        "book": "Secrets of the Covenants", "page": "186",
        "target_successes": "8", "resistance": "",
        "text_file": "SotC Cruac.txt", "lines": [413, 426],
    },
    {
        "name_pdf": "Mantle of the Predator's Grandeur",
        "csv_match": None,
        "parent": "Cruac", "rank": 4,
        "sub_category": "Transmutation 4",
        "book": "Secrets of the Covenants", "page": "186",
        "target_successes": "8", "resistance": "",
        "text_file": "SotC Cruac.txt", "lines": [427, 440],
    },
    {
        "name_pdf": "Birthing the God",
        "csv_match": "Birthing the God",
        "parent": "Cruac", "rank": 5,
        "sub_category": "Creation 5",
        "book": "Secrets of the Covenants", "page": "186",
        "target_successes": "15", "resistance": "",
        "text_file": "SotC Cruac.txt", "lines": [441, 483],
    },
    {
        "name_pdf": "Mantle of the Crone",
        "csv_match": None,
        "parent": "Cruac", "rank": 5,
        "sub_category": "Creation 5",
        "book": "Secrets of the Covenants", "page": "186",
        "target_successes": "10", "resistance": "",
        "text_file": "SotC Cruac.txt", "lines": [484, 504],
    },
    # ── SotC Theban (Secrets of the Covenants) ──────────────────
    # Style column (sub_category): Creation / Destruction / Divination / Protection / Transmutation
    {
        "name_pdf": "Apple of Eden",
        "csv_match": None,
        "parent": "Theban", "rank": 1,
        "sub_category": "Divination 1",
        "book": "Secrets of the Covenants", "page": "194",
        "target_successes": "5", "resistance": "",
        "text_file": "SotC - Theban.txt", "lines": [34, 64],
    },
    {
        "name_pdf": "Marian Apparition",
        "csv_match": "Marian Apparition",
        "parent": "Theban", "rank": 1,
        "sub_category": "Divination 1",
        "book": "Secrets of the Covenants", "page": "194",
        "target_successes": "5", "resistance": "Contested by: Humanity",
        "text_file": "SotC - Theban.txt", "lines": [65, 84],
    },
    {
        "name_pdf": "Revelatory Shroud",
        "csv_match": "Revelatory Shroud",
        "parent": "Theban", "rank": 1,
        "sub_category": "Divination 1",
        "book": "Secrets of the Covenants", "page": "194",
        "target_successes": "5", "resistance": "",
        "text_file": "SotC - Theban.txt", "lines": [85, 90],
    },
    {
        "name_pdf": "Apparition of the Host",
        "csv_match": "Apparition of the Host",
        "parent": "Theban", "rank": 2,
        "sub_category": "Divination 2",
        "book": "Secrets of the Covenants", "page": "194",
        "target_successes": "6", "resistance": "Contested by: Resolve + Blood Potency",
        "text_file": "SotC - Theban.txt", "lines": [91, 106],
    },
    {
        "name_pdf": "Bloody Icon",
        "csv_match": "Bloody Icon",
        "parent": "Theban", "rank": 2,
        "sub_category": "Transmutation 2",
        "book": "Secrets of the Covenants", "page": "195",
        "target_successes": "6", "resistance": "",
        "text_file": "SotC - Theban.txt", "lines": [107, 125],
    },
    {
        "name_pdf": "The Walls of Jericho",
        "csv_match": "The Walls of Jericho",
        "parent": "Theban", "rank": 2,
        "sub_category": "Destruction 2",
        "book": "Secrets of the Covenants", "page": "195",
        "target_successes": "6", "resistance": "",
        "text_file": "SotC - Theban.txt", "lines": [126, 140],
    },
    {
        "name_pdf": "Aaron's Rod",
        "csv_match": "Aaron's Rod",
        "parent": "Theban", "rank": 3,
        "sub_category": "Transmutation 3",
        "book": "Secrets of the Covenants", "page": "195",
        "target_successes": "8", "resistance": "",
        "text_file": "SotC - Theban.txt", "lines": [141, 152],
    },
    {
        "name_pdf": "Blessing the Legion",
        "csv_match": "Blessing the Legion",
        "parent": "Theban", "rank": 3,
        "sub_category": "Transmutation 2",
        "book": "Secrets of the Covenants", "page": "195",
        "target_successes": "6", "resistance": "",
        "text_file": "SotC - Theban.txt", "lines": [153, 173],
    },
    {
        "name_pdf": "Miracle of the Dead Sun",
        "csv_match": "Miracle of the Dead Sun",
        "parent": "Theban", "rank": 3,
        "sub_category": "Protection 3",
        "book": "Secrets of the Covenants", "page": "196",
        "target_successes": "6", "resistance": "",
        "text_file": "SotC - Theban.txt", "lines": [176, 190],
    },
    {
        "name_pdf": "Pledge to the Worthless One",
        "csv_match": None,
        "parent": "Theban", "rank": 3,
        "sub_category": "Transmutation 3",
        "book": "Secrets of the Covenants", "page": "196",
        "target_successes": "8", "resistance": "",
        "text_file": "SotC - Theban.txt", "lines": [191, 219],
    },
    {
        "name_pdf": "Great Prophecy",
        "csv_match": None,
        "parent": "Theban", "rank": 4,
        "sub_category": "Divination 4",
        "book": "Secrets of the Covenants", "page": "196",
        "target_successes": "8", "resistance": "",
        "text_file": "SotC - Theban.txt", "lines": [220, 258],
    },
    {
        "name_pdf": "The Guiding Star",
        "csv_match": None,
        "parent": "Theban", "rank": 3,
        "sub_category": "Protection 3",
        "book": "Secrets of the Covenants", "page": "196",
        "target_successes": "8", "resistance": "",
        "text_file": "SotC - Theban.txt", "lines": [259, 279],
    },
    {
        "name_pdf": "Apocalypse",
        "csv_match": None,
        "parent": "Theban", "rank": 5,
        "sub_category": "Transmutation 5",
        "book": "Secrets of the Covenants", "page": "197",
        "target_successes": "Special", "resistance": "",
        "text_file": "SotC - Theban.txt", "lines": [280, 295],
    },
    {
        "name_pdf": "The Judgment Fast",
        "csv_match": None,
        "parent": "Theban", "rank": 5,
        "sub_category": "Transmutation 5",
        "book": "Secrets of the Covenants", "page": "197",
        "target_successes": "15", "resistance": "",
        "text_file": "SotC - Theban.txt", "lines": [296, 305],
    },
    # ── Circle of the Crone (1e covenant book) — Crúac ──────────
    # OCR'd from image-only PDF; text is noisy but structurally correct.
    # Ranks: CSV-derived where already set; otherwise "" (to assign later).
    {
        "name_pdf": "Confidence in Adversity",
        "csv_match": None,
        "parent": "Cruac", "rank": None,
        "book": "Circle of the Crone", "page": "204",
        "target_successes": "", "resistance": "",
        "text_file": "Circle of Crone Cruac.txt", "lines": [30, 46],
    },
    {
        "name_pdf": "Drops of Destiny",
        "csv_match": "Drops of Destiny",
        "parent": "Cruac", "rank": 1,
        "book": "Circle of the Crone", "page": "204",
        "target_successes": "", "resistance": "",
        "text_file": "Circle of Crone Cruac.txt", "lines": [47, 62],
    },
    {
        "name_pdf": "Fires of Inspiration",
        "csv_match": "Fires of Inspiration",
        "parent": "Cruac", "rank": 1,
        "book": "Circle of the Crone", "page": "204",
        "target_successes": "", "resistance": "Contested by: Composure (counterpart cast on others)",
        "text_file": "Circle of Crone Cruac.txt", "lines": [111, 136],
    },
    {
        "name_pdf": "Taste of Knowledge",
        "csv_match": "Taste of Knowledge",
        "parent": "Cruac", "rank": 1,
        "book": "Circle of the Crone", "page": "204",
        "target_successes": "", "resistance": "Contested by: Resolve",
        "text_file": "Circle of Crone Cruac.txt", "lines": [137, 155],
    },
    {
        "name_pdf": "Visage of the Crone",
        "csv_match": None,
        "parent": "Cruac", "rank": None,
        "book": "Circle of the Crone", "page": "204",
        "target_successes": "", "resistance": "Contested by: Stamina",
        "text_file": "Circle of Crone Cruac.txt", "lines": [156, 198],
    },
    {
        "name_pdf": "Maiden Skin",
        "csv_match": None,
        "parent": "Cruac", "rank": None,
        "book": "Circle of the Crone", "page": "205",
        "target_successes": "", "resistance": "",
        "text_file": "Circle of Crone Cruac.txt", "lines": [199, 219],
    },
    {
        "name_pdf": "Path of Thorns",
        "csv_match": "Path of Thorns",
        "parent": "Cruac", "rank": 2,
        "book": "Circle of the Crone", "page": "205",
        "target_successes": "", "resistance": "",
        "text_file": "Circle of Crone Cruac.txt", "lines": [220, 299],
    },
    {
        "name_pdf": "Soul's Work",
        "csv_match": None,
        "parent": "Cruac", "rank": None,
        "book": "Circle of the Crone", "page": "206",
        "target_successes": "", "resistance": "",
        "text_file": "Circle of Crone Cruac.txt", "lines": [303, 341],
    },
    {
        "name_pdf": "Succulent Buboes",
        "csv_match": None,
        "parent": "Cruac", "rank": None,
        "book": "Circle of the Crone", "page": "206",
        "target_successes": "", "resistance": "",
        "text_file": "Circle of Crone Cruac.txt", "lines": [342, 378],
    },
    {
        "name_pdf": "Wisdom of the Soul",
        "csv_match": "Wisdom of the Soul",
        "parent": "Cruac", "rank": 2,
        "book": "Circle of the Crone", "page": "206",
        "target_successes": "", "resistance": "",
        "text_file": "Circle of Crone Cruac.txt", "lines": [379, 421],
    },
    {
        "name_pdf": "Beloved Deodand",
        "csv_match": None,
        "parent": "Cruac", "rank": None,
        "book": "Circle of the Crone", "page": "206",
        "target_successes": "", "resistance": "",
        "text_file": "Circle of Crone Cruac.txt", "lines": [422, 468],
    },
    {
        "name_pdf": "Final Service of the Slave",
        "csv_match": None,
        "parent": "Cruac", "rank": None,
        "book": "Circle of the Crone", "page": "206",
        "target_successes": "", "resistance": "Contested by: higher of Stamina or Resolve",
        "text_file": "Circle of Crone Cruac.txt", "lines": [469, 524],
    },
    {
        "name_pdf": "Rain",
        "csv_match": None,
        "parent": "Cruac", "rank": None,
        "book": "Circle of the Crone", "page": "207",
        "target_successes": "", "resistance": "",
        "text_file": "Circle of Crone Cruac.txt", "lines": [525, 548],
    },
    {
        "name_pdf": "Taste of Destiny",
        "csv_match": None,
        "parent": "Cruac", "rank": None,
        "book": "Circle of the Crone", "page": "207",
        "target_successes": "", "resistance": "",
        "text_file": "Circle of Crone Cruac.txt", "lines": [549, 602],
    },
    {
        "name_pdf": "Ti'amat's Offspring",
        "csv_match": None,
        "parent": "Cruac", "rank": None,
        "book": "Circle of the Crone", "page": "207",
        "target_successes": "", "resistance": "",
        "text_file": "Circle of Crone Cruac.txt", "lines": [603, 711],
    },
    {
        "name_pdf": "Eye of the Norn",
        "csv_match": None,
        "parent": "Cruac", "rank": None,
        "book": "Circle of the Crone", "page": "208",
        "target_successes": "", "resistance": "",
        "text_file": "Circle of Crone Cruac.txt", "lines": [729, 776],
    },
    {
        "name_pdf": "Fang of Wisdom",
        "csv_match": None,
        "parent": "Cruac", "rank": None,
        "book": "Circle of the Crone", "page": "208",
        "target_successes": "", "resistance": "Contested by: Resolve",
        "text_file": "Circle of Crone Cruac.txt", "lines": [777, 816],
    },
    {
        "name_pdf": "Mask of Blood",
        "csv_match": "Mask of Blood",
        "parent": "Cruac", "rank": 2,
        "book": "Circle of the Crone", "page": "209",
        "target_successes": "", "resistance": "Contested by: Composure",
        "text_file": "Circle of Crone Cruac.txt", "lines": [817, 863],
    },
    {
        "name_pdf": "Sacrifice of Odin",
        "csv_match": None,
        "parent": "Cruac", "rank": None,
        "book": "Circle of the Crone", "page": "209",
        "target_successes": "", "resistance": "",
        "text_file": "Circle of Crone Cruac.txt", "lines": [864, 896],
    },
    {
        "name_pdf": "A Child From the Stones",
        "csv_match": None,
        "parent": "Cruac", "rank": None,
        "book": "Circle of the Crone", "page": "209",
        "target_successes": "", "resistance": "",
        "text_file": "Circle of Crone Cruac.txt", "lines": [897, 952],
    },
    {
        "name_pdf": "As One",
        "csv_match": None,
        "parent": "Cruac", "rank": None,
        "book": "Circle of the Crone", "page": "209",
        "target_successes": "", "resistance": "",
        "text_file": "Circle of Crone Cruac.txt", "lines": [953, 1211],
    },
    {
        "name_pdf": "Crone's Renewal",
        "csv_match": None,
        "parent": "Cruac", "rank": None,
        "book": "Circle of the Crone", "page": "211",
        "target_successes": "", "resistance": "",
        "text_file": "Circle of Crone Cruac.txt", "lines": [1212, 1246],
    },
    {
        "name_pdf": "Roving Hut",
        "csv_match": None,
        "parent": "Cruac", "rank": None,
        "book": "Circle of the Crone", "page": "211",
        "target_successes": "", "resistance": "",
        "text_file": "Circle of Crone Cruac.txt", "lines": [1247, 1342],
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
            "sub_category": item.get("sub_category", ""),
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
