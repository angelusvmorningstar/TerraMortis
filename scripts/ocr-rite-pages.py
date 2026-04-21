#!/usr/bin/env python3
"""
ocr-rite-pages.py
OCR the page renders of an image-only rite PDF into a text dump.

Usage:
    python scripts/ocr-rite-pages.py "Circle of Crone Cruac"

Reads docs/rites/_pages/<Book>_pN.png (1-indexed), writes
docs/rites/_text/<Book>.txt with PAGE markers between pages.

Idempotent: overwrites the target txt file. The text lands on disk
only — nothing is echoed to stdout.
"""
import sys
import os
from pathlib import Path

os.environ.setdefault("PYTHONIOENCODING", "utf-8")

ROOT = Path(__file__).parent.parent
PAGES = ROOT / "docs" / "rites" / "_pages"
TEXT  = ROOT / "docs" / "rites" / "_text"

def main():
    if len(sys.argv) != 2:
        print("Usage: ocr-rite-pages.py \"Book Name\"")
        sys.exit(1)
    book = sys.argv[1]

    # Collect page renders
    pngs = sorted(PAGES.glob(f"{book}_p*.png"),
                  key=lambda p: int(p.stem.rsplit("_p", 1)[1]))
    if not pngs:
        print(f"No pages found for {book!r}")
        sys.exit(1)

    import easyocr
    reader = easyocr.Reader(['en'], gpu=False, verbose=False)

    out_path = TEXT / f"{book}.txt"
    with out_path.open("w", encoding="utf-8") as f:
        for i, png in enumerate(pngs, 1):
            print(f"  OCRing p{i} ({png.name})...")
            f.write(f"\n===== PAGE {i} =====\n")
            # Split page into left/right halves and OCR each column separately,
            # so two-column layouts read top-down-per-column rather than
            # interleaving across columns.
            from PIL import Image
            img = Image.open(png)
            w, h = img.size
            left  = img.crop((0, 0, w // 2 + 20, h))
            right = img.crop((w // 2 - 20, 0, w, h))

            for side_img in (left, right):
                tmp = PAGES / "_tmp_col.png"
                side_img.save(tmp)
                results = reader.readtext(str(tmp), paragraph=False)
                def ykey(r):
                    ys = [p[1] for p in r[0]]
                    return sum(ys) / 4
                for bbox, text, conf in sorted(results, key=ykey):
                    f.write(text + "\n")
                tmp.unlink()

    print(f"Wrote {out_path} ({out_path.stat().st_size} bytes)")

if __name__ == "__main__":
    main()
