# Prior art — server-side PDF attempt (failed on Render)

Files reviewed on `origin/main` (commit `849f0a7`):

- `server/lib/pdf-gen/generate.cjs` (778 lines)
- `server/routes/pdf.js` (37 lines)
- `server/lib/pdf-gen/assets/` + `fonts/` (same pack as `json_to_pdf/vtr-pdf-gen`)

## Why it failed on Render — three independent bugs

### 1. `.cjs` file containing ESM syntax (load-time SyntaxError)

`server/lib/pdf-gen/generate.cjs` has the `.cjs` extension, which forces Node to
parse it as CommonJS. The **file contents are pure ESM**:

```js
import PDFDocument from 'pdfkit/js/pdfkit.es.js';   // line 8
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);  // line 12
// …
export { generate, generateToStream };              // line 778
```

`routes/pdf.js` tries to load it via `createRequire`:

```js
const require = createRequire(import.meta.url);
const { generateToStream } = require('../lib/pdf-gen/generate.cjs');  // line 4
```

`require()` of a `.cjs` file that contains `import …` syntax throws
`SyntaxError: Cannot use import statement outside a module` at **module load
time**, before the route handler ever runs. The route's try/catch only wraps
the handler body, so it cannot see a load-time throw in a top-level require.

Symptom on Render: the POST route appears to 404 or the server crashes during
boot, with the traceback only visible in Render's raw startup log — which is
what "invisible errors" almost always means on Render.

**Fix for new tool:** don't mix module systems. The shared renderer exports a
pure function. The Node CLI harness uses the Node build of pdfkit (`require
('pdfkit')`). The browser call site uses the standalone bundle
(`pdfkit/js/pdfkit.standalone.js`) via a script tag. The renderer receives
`PDFDocument` as a parameter — it doesn't import pdfkit itself. That keeps one
render function working in both environments with no module-system games.

### 2. Wrong pdfkit build imported for Node

Even if the file had been named `.js` or `.mjs`, line 8 imports
`pdfkit/js/pdfkit.es.js`. That path is the **browser standalone build** — it
assumes a `window`/DOM-ish environment and its font/image loading paths differ
from the Node build. Running it in Node silently mis-handles font registration
(fonts register but glyph lookup can fail at render time), and the errors
surface as "Error: font not found: undefined" or similar opaque messages.

**Fix:** Node harness imports `pdfkit` (the Node build). Browser imports
`pdfkit.standalone.js`. Never mix.

### 3. Four-page portrait layout, not Mammon's two-page landscape

Completely different design from the target in `Mammon.pdf`:

- `PAGE_W = 595.28, PAGE_H = 841.89` — A4 **portrait**
- `_renderPages()` calls `renderPage1 … renderPage4` — four pages
- `renderPage4` has a `VISUALS` section with `COTERIE CHART` and
  `CHARACTER SKETCH` sub-headers — not in Mammon at all

This isn't a fix, it's a rewrite. The page layout is dead. Only the primitive
helpers are salvageable.

## Salvage list

Reusable from `generate.cjs` (copy into new tool's helpers module):

- `dots(doc, x, y, filled, max)` — filled/outlined circle rating row
- `squares(doc, x, y, filled, max)` — square rating row (vitae/health/WP)
- `field(doc, x, y, label, value, totalW, opts)` — labelled underline field
- `skillRow(doc, x, y, name, filled, w, specs)` — skill name + dots + spec
- `traitRow(doc, x, y, name, filled, max, w)` — generic trait name + dots
- `ALL_SKILLS` constant (Mental/Physical/Social canonical lists)
- `ATTR_GRID` constant (3×3 attribute layout with power/finesse/resistance rows)
- Colour constants: `INK`, `GREY`, `FAINT`, `BANNER_C`
- Font keys: `Caslon`, `GoudyBold`, `Body`, `BodyIt`, `Bold`, `Regular`, `Italic`

Discard:

- Everything in `renderPage1 … renderPage4` — wrong layout
- `banner()` — hard-coded dark-ink rect header; Mammon uses a PNG section plate
- `subHeader()` — small-caps centred text; still useful shape but trivial to redo
- The entire page-geometry block (portrait A4)

## Leave existing server-side files alone for now

Per decision: don't delete `server/lib/pdf-gen/` or `server/routes/pdf.js` yet.
The new tool is client-side so those files become dead code but ripping them
out is cleanup for a later story — not this one. Flag them in the BMAD story
as follow-up.
