# PDF Sheet — Visual Target & Asset Catalogue

Source: `Mammon.pdf` (project root). This folder is the locked visual target the
new standalone PDF utility must reproduce.

## Target images

- `mammon-1.png` — page 1 @ 200 DPI (locked reference for acceptance)
- `mammon-2.png` — page 2 @ 200 DPI (locked reference for acceptance)

Page geometry: A4 landscape (842 × 595 pt), 2 pages.

## Raw extraction

`raw-assets/` contains every image stream pulled via `pdfimages -all` (27 entries,
including smasks). Do not consume directly — use `curated/`.

## Curated reusable assets

All in `curated/`. Sizes are as embedded in Mammon.pdf.

| File | Origin obj | Size | Usage |
|------|-----------|------|-------|
| `background.jpg` | obj 10 | 1483×961 | Full-page parchment + red border. Draw edge-to-edge on both pages. |
| `logo-vampire.jpg` | obj 49 | 436×256 | "Vampire: The Requiem Second Edition" masthead, top-right of page 1. |
| `banner-section.png` | obj 53 | 491×241 | Dark section header plate with scrollwork corners. Used for ATTRIBUTES, SKILLS, MERITS, POWERS. Stretched horizontally. |
| `diamond-city-status.png` | obj 73 | 220×177 | City Status diamond (masthead, right of covenant block). |
| `diamond-cov-status.png` | obj 77 | 206×177 | Covenant Status diamond. |
| `diamond-clan-status.png` | obj 81 | 207×181 | Clan Status diamond. |
| `diamond-size.png` | obj 93 | 147×172 | Size value diamond (bottom-left). |
| `diamond-speed.png` | obj 89 | 147×172 | Speed value diamond (bottom-left). |
| `diamond-defence.png` | obj 85 | 157×172 | Defence value diamond (bottom-left). |
| `clan-nosferatu.png` | obj 41 | 182×222 | Clan icon — **only Nosferatu present** because this is Mammon's sheet. |
| `covenant-carthian.png` | obj 45 | 221×209 | Covenant icon — **only Carthian Movement present** for the same reason. |

## Clan & covenant icon sets — RESOLVED

Source: `public/js/data/icons.js` in the web app already has the full bank as
base64-encoded SVG data URIs. `pdf_tool/bin/extract-site-icons.js` pulls them
out, tints every `fill="black"` / `fill="currentColor"` to the accent red
`#8b1a1a`, rasterises to PNG via sharp at 128×128 with alpha, and writes them
into `pdf_tool/assets/` using the names `pdf_tool/src/iconmap.js` expects.

Coverage:

- **Clans (5/5):** Daeva, Gangrel, Mekhet, Nosferatu, Ventrue
- **Covenants (4/5):** Carthian Movement, Circle of the Crone, Invictus,
  Lancea et Sanctum
- **Missing:** Ordo Dracul — not in the site's icon bank. Falls back to the
  text-only covenant block in `iconmap.js` until someone adds it to
  `public/js/data/icons.js`, at which point re-running the extraction picks it
  up with zero code change.

The icons are solid-silhouette SVGs — visually cleaner than Mammon.pdf's
painterly red-brown originals but semantically identical and in the same
accent colour. Good enough for v1. If a more painterly look is wanted later,
the style can be applied at rasterisation time (sharp has gradient/filter
support) or by re-rendering from a different source.

## Layout notes (from visual inspection of `mammon-1.png`)

### Page 1 zones (left to right)

1. **Disciplines column** (x ≈ 38–170): Animalism through Transmutation, each with
   5-dot rating. Then a sub-heading for covenant ritual tracks (Crúac, Theban,
   Creation, Destruction, Divination, Protection, Transmutation). Below:
   Blood Potency (10 dots), Vitae (squares), Health (squares), Willpower (squares).
   Bottom: Size / Speed / Defence diamonds side-by-side.

2. **Influence / Kindred Status / Domain / Standing column** (x ≈ 180–310): stacked
   labelled lists. Influence has squares above plus typed entries ("Allies: Finance
   2", etc.). Kindred Status lists each covenant by name with a dot or dash.
   Domain: Safe Place / Haven / Feeding Grounds / Herd. Standing: Mystery Cult
   Initiation, Professional Training plus footnote about downtime actions.

3. **Humanity + Mask/Dirge/Banes column** (x ≈ 320–460): Humanity ladder 10→1 with
   filled-dot indicator plus touchstone names written in the row of their rating.
   Below: Mask heading + effect text (1WP/All WP). Dirge heading + effect text.
   Banes & Curses heading with clan curse & any others.

4. **Masthead / attributes / skills** (x ≈ 470–805): Vampire logo top-right,
   character name, Terra Mortis, Player / Concept / XP (earned/total format) /
   Printed date, covenant block (icon + name) + 3 status diamonds, clan block
   (icon + name) + 3 status diamonds. Attributes section header banner, 3-col
   Mental / Physical / Social grid (no bonus column — just dots). Skills section
   header banner, 3-col grid with unskilled penalty subtitle, 8 rows each, with
   specialisation names printed in italics under the skill name.

### Page 2 zones

Two equal columns of flowing text:

- Column 1: **Merits** (name + inline dots, then one-line description) then
  **Powers** heading that continues into column 1.
- Column 2: continues **Powers**. Each power: "Discipline ••• | Power Name"
  heading, "Cost: … • Pool: … • Action • Duration" line in bold/italic, then
  effect description paragraph.

## Fonts in Mammon.pdf

Not extracted via `pdfimages`. Based on visual inspection:

- Small-caps serif for labels and skill names ("ACADEMICS", "CLAN STATUS") —
  matches Caslon Antique used in the old `vtr-pdf-gen` folder.
- Body: serif with old-style numerals — Sorts Mill Goudy or similar.
- "YUSUF 'MAMMON' KALUSICJ" header: Caslon Antique small-caps, larger size,
  faint red tint.
- "Vampire: The Requiem" masthead: image, not a font.

The old `json_to_pdf/vtr-pdf-gen/fonts/` set (Caslon Antique, Goudy Bold, Sorts
Mill Goudy regular + italic, Liberation Serif fallbacks) appears sufficient.
Copy those into the new tool's fonts folder verbatim.
