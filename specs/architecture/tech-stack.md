# Tech Stack

## Existing Technology Stack

| Category | Technology | Version | Usage | Notes |
|---|---|---|---|---|
| Markup | HTML5 | -- | App shell, structure | Semantic elements required (NFR11) |
| Styling | CSS3 | -- | All visual styling | Custom properties on `:root`; no preprocessor |
| Scripting | Vanilla JavaScript | ES2020+ | All application logic | No framework; ES modules via `type="module"` |
| Fonts | Google Fonts CDN | -- | Cinzel, Cinzel Decorative, Lora | Loaded from CDN; no local fallback needed |
| Data format | JSON | -- | Character data, reference DBs | Draft 2020-12 schema at `data/chars_v2.schema.json` |
| Persistence | Web localStorage | -- | Character save state, tracker data | Keys: `tm_chars_db`, `tm_tracker_<name>` |
| Hosting | GitHub Pages | -- | Static site deployment | Serves `public/` directory |
| CI/CD | GitHub Actions | -- | Deploy on push to `main` | Workflow: `.github/workflows/deploy.yml` |
| Version control | Git / GitHub | -- | Source control, issue tracking | Primary branch: `main` |

## New Technology Additions

No new technologies are required for Epic 1. All restructuring uses the existing stack.

### Phase 2 Additions (future, not Epic 1)

| Technology | Purpose | Rationale |
|---|---|---|
| GitHub REST API | Editor saves changes back to repo JSON | Eliminates manual export/import; client-side only, no server needed |

### Phase 3 Additions (future, not Epic 1)

| Technology | Purpose | Rationale |
|---|---|---|
| Discord OAuth2 | Player portal authentication | Only viable auth for a Discord-organised LARP community |
| Edge function (Cloudflare Worker or similar) | Discord OAuth2 token exchange | Client secret cannot live in browser JS; single-endpoint shim only |

## Design Rationale

**Why no framework?**
- Existing codebase is pure vanilla JS. Introducing a framework for a restructure adds learning cost with no feature gain.
- The app is deliberately simple to deploy and maintain for a volunteer-run organisation. Framework toolchains add fragility.
- Performance target (near-instant interactions) is trivially met with vanilla JS on this scale.

**Why no build step?**
- Core constraint from `CLAUDE.md` and PRD. Edit file, refresh browser. No webpack, bundler, or transpilation.
- ES modules (`<script type="module">`) work natively in all target browsers (Chrome, Safari, Firefox).
- A build step would require setting up and maintaining toolchain configuration -- not appropriate for a learning-developer project.

**Why ES modules over global script?**
- Enables file-level separation without global namespace pollution.
- Allows clean `import`/`export` between module files.
- Supported natively in all target browsers without a build step.

**Why localStorage over a backend?**
- The constraint is intentional. No server maintenance, no account management, no privacy liability.
- The ST owns the device; localStorage is sufficient for the single-device-at-game use case.
- The GitHub-hosted JSON is the canonical source; localStorage is a cache of the last loaded state.

## Browser Support

Modern browsers only. No legacy support.

| Browser | Minimum Version | Primary Use Case |
|---|---|---|
| Safari | 14+ | iPad (ST live game), iPhone (Rules ST) |
| Chrome | 90+ | Desktop (ST between games), Android |
| Firefox | 90+ | Desktop development |

No Internet Explorer. No polyfills required.
