# Terra Mortis — Character Sheet PDF Tool

Renders a VtR 2e character sheet from resolved JSON (the shape produced by
`public/js/editor/export-character.js::serialiseForPrint()`) into a PDF that
matches `specs/guidance/pdf-target/mammon-1.png` and `mammon-2.png`.

## Design goals

- **One shared render function** (`src/render.js`) that works in both Node and
  browser. It receives `PDFDocument`, font buffers, and image buffers as
  parameters — it does not import pdfkit itself, so there's no module-system
  mismatch between environments.
- **Node harness for verification** (`bin/render.js`, `bin/verify.js`) reads
  fonts/assets from disk, uses the Node build of pdfkit, writes PDFs to `out/`.
- **Browser integration** loads pdfkit's standalone bundle via script tag, fetches
  fonts/assets as ArrayBuffers, and calls the same `render(...)` function.
- **No server-side code.** The previous server attempt failed because `.cjs`
  files contained ESM syntax and imported the browser pdfkit build in Node. See
  `../specs/guidance/pdf-target/PRIOR-ART.md` for the full post-mortem.

## Layout

```
pdf_tool/
├── package.json         # pdfkit 0.18
├── README.md            # this file
├── src/
│   ├── render.js        # shared renderer — main export render(data, deps)
│   ├── helpers.js       # dot/square/field/skillRow primitives
│   ├── page1.js         # A4 landscape page 1 (disciplines, attributes, skills)
│   ├── page2.js         # A4 landscape page 2 (merits, powers)
│   ├── layout.js        # page geometry, colours, font names
│   └── iconmap.js       # clan/covenant name → asset filename lookup
├── fonts/               # Caslon, Goudy, Sorts Mill Goudy, Liberation Serif
├── assets/              # Mammon-extracted: background, logo, banner, diamonds
├── fixtures/            # Sample input JSONs derived from real chars
├── bin/
│   ├── render.js        # CLI: node bin/render.js <input.json> <out.pdf>
│   └── verify.js        # Batch-render Mammon + others, rasterise to PNG
└── out/                 # Generated PDFs + rasterised previews (gitignored)
```

## CLI usage

```bash
npm install
node bin/render.js fixtures/mammon.json out/mammon.pdf
node bin/verify.js   # renders all fixtures and rasterises for visual diff
```

## Acceptance

The generated `out/mammon.pdf`, rasterised at 200 DPI, must be
visually indistinguishable from `../specs/guidance/pdf-target/mammon-1.png` and
`mammon-2.png` for:

- All text positions and contents
- All dot/square rating counts
- Status diamond values
- Section header placement
- Masthead identity fields

Differences permitted:

- Printed date reflects render day
- Font hinting/anti-aliasing differences between extracted-PDF render and
  freshly-generated render (pdfkit is a different engine than whatever produced
  `Mammon.pdf`)

## Clan & covenant icon coverage

Currently only Nosferatu (`clan-nosferatu.png`) and Carthian Movement
(`covenant-carthian.png`) icons are present — because those are the only icons
embedded in `Mammon.pdf`. All other clan/covenant blocks fall back to text-only
rendering. Drop additional icon files into `assets/` following the naming
convention in `src/iconmap.js` and they'll light up automatically.
