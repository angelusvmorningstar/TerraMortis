# Story BL-2: The bloodline cache, `clanDiscList` rewired, and a loud miss path

Status: ready-for-dev

> **Epic BL** — issue **#1008**. Second of five stories, and **the only one in the epic that can
> silently produce a wrong XP cost.** BL-1 (`6c0d2abd`, `e05cfaa7`, on `bl/bl-1-bloodline-collection`)
> built the collection, the schema, the seed and the read-only API, all inert. This story is where
> something starts reading it.
>
> **Data-lock complete 2026-08-10.** Every shape below was verified against real code or live data,
> not memory. Findings and the miss-path ruling live in `D:\Terra Mortis\data-map.md` — drift
> pattern **#15** (updated + ruled), the new drift pattern **#16**, the corrected **Bloodlines**
> entry and the new **`bloodlines` (collection)** entry. **Do not re-derive them; do re-verify any
> line number before editing.**
>
> **Deploy:** branch from `main`, PR direct to `main`, never through `dev`. No push or merge without
> Angelus's explicit word in his current message.
>
> **Timing:** Epic BL is agreed for **after Game 7 (Sat 2026-08-15)**. Unlike BL-1 this story is
> NOT low-risk: it changes how every character's disciplines are costed. Do not land it in the days
> before a game.
>
> **PRECONDITION — hard.** BL-1 must be merged to `main` AND the seed applied to live
> (`node scripts/seed-bloodlines.js --apply`, run from `server/`) before this story is enabled in
> production. The live `bloodlines` collection does not exist today; `GET /api/bloodlines` returns
> `[]`. Shipping BL-2 against an empty collection makes **every** bloodline character unresolved at
> once. Verified 2026-08-10: 41 collections live, no `bloodlines`.

## Story

As the Storyteller,
I want `clanDiscList` to read bloodline disciplines from the `bloodlines` collection instead of the
static constant, with a miss that is impossible to overlook,
so that adding a bloodline stops requiring a deploy for it to cost correctly, and so that the class
of defect that opened this epic — a wrong discipline cost that nobody can see — cannot recur.

## Why this story is the dangerous one

`clanDiscList` (`public/js/data/accessors.js:15`) is one line:

```js
return BLOODLINE_DISCS[c?.bloodline] || CLAN_DISCS[c?.clan] || [];
```

Its miss path returns the character's **clan** list — well-formed, plausible, and wrong. It feeds
the XP cost multiplier at `editor/edit.js:654` (`isInClanDisc(c, disc) ? 3 : 4`). That is how Ocka
Keats' disciplines cost 4 per dot instead of 3 for two weeks with nobody noticing.

**The data-lock found this is worse than the map previously recorded.** A bloodline's list is *not*
reliably the clan's three plus one. Measured against the real constants, **7 of 23 bloodlines drop a
clan discipline**:

| Bloodline | Clan | Loses | Gains |
|---|---|---|---|
| Icelus | Ventrue | Animalism | Auspex, Obfuscate |
| Malkovians | Ventrue | Animalism | Auspex, Obfuscate |
| Vardyvle | Ventrue | Animalism | Obfuscate, Protean |
| Lygos | Mekhet | Celerity | Nightmare, Vigour |
| Scions of the First City | Gangrel | Protean | Auspex, Obfuscate |
| Vilseduire | Nosferatu | Vigour | Majesty, Resilience |
| Nosoi | Nosferatu | Nightmare, Vigour | Dominate, Protean, Resilience |

So the current fallback is wrong in **both** directions for 30% of bloodlines: it grants in-clan cost
to a discipline the bloodline does not have, *and* charges out-of-clan for one it does. Two live
characters sit on affected bloodlines — **Cazz** (Malkovians) and **Ivana Horvat** (Scions of the
First City). Any design that keeps the clan list as the miss path is not graceful degradation.

Moving to an async source adds a **second** cause of a miss that does not exist today: *the cache
has not loaded yet, or failed to load.* That one hits every bloodline character at once, is
invisible, and self-heals on reload, so it would never be reported.

## The ruling (Angelus, 2026-08-10) — implement exactly this

**An unresolved bloodline returns an empty list, never the clan list.**

- Nothing is silently in-clan. Every discipline costs 4/dot — wrong **high**, which somebody
  notices and complains about, rather than wrong **low**, which nobody ever does.
- A **visible banner** names the character and the unresolved bloodline.
- The **editor refuses discipline-dot changes** for that character, so a wrong cost cannot be
  committed to the document.
- Read surfaces still render. A character sheet does not go blank because of this.

This is now the standing answer for the whole failure class, recorded in drift pattern #15: *when a
lookup miss would be indistinguishable from a legitimate answer, return nothing and say so loudly —
never the neighbouring value.*

**A character with no bloodline at all is not a miss.** `c.bloodline` null/empty is the normal case
for most characters and must keep returning `CLAN_DISCS[c.clan]` exactly as it does today. The miss
is specifically: a non-empty `c.bloodline` that the cache cannot resolve.

## Acceptance Criteria

1. **Cache module** at `public/js/data/bloodlines-cache.js`, following
   `public/js/data/equipment-catalogue-cache.js` (the ECM precedent): module-level store, an
   idempotent `loadBloodlines()` sharing one in-flight promise, `isLoaded()`, and a lookup by name.
   **Structural precedent only — the failure semantics differ, see AC 3.** No WS refetch: there is
   no write path until BL-4, and an unused listener is a claim the code cannot keep.
2. **Three derived reads, never stored.** The cache exposes the equivalents of all three constants,
   derived from the one collection: disciplines-by-name, names-by-clan, and the sorted approved-name
   list. Storing them separately would re-import the exact drift this epic deletes. (`BLOODLINE_CLANS`
   and `APPROVED_BLOODLINES` are consumed by BL-3, not here — but the cache must already expose them
   so BL-3 is a rewiring job and not a redesign.)
3. **The miss path, per the ruling.** `clanDiscList(c)`:
   - no `c.bloodline` → `CLAN_DISCS[c.clan] || []`, unchanged from today;
   - `c.bloodline` resolves in the cache → the cache's list;
   - `c.bloodline` present and unresolved → **`[]`**, plus a registered miss (see AC 4).
   Distinguish the two miss causes in what gets reported: **cache not loaded / load failed** (a
   system state, every character) versus **unknown bloodline** (a data state, one character). They
   read as the same empty result to the caller and must not read the same to a human.
4. **A banner that actually exists.** Drift pattern **#16**, found by this data-lock: the existing
   `app-status-banner` block at `app.js:728` and `admin.js:1286` is **dead code** — there is no
   element with that id in any HTML file and no CSS for `app-status-banner--error`. The `if (banner)`
   guard swallows it, so the rules-engine degraded-state warning has never been shown to anyone.
   **Do not reuse it.** Render into a container that provably exists.
   - Both apps load `public/css/components.css`, so the banner class belongs there.
   - **Reuse an existing component class before inventing one** (project-context.md §1.2). Audit
     `.rel-pending-banner` (`components.css:656`) and `.reg-cta-banner`
     (`admin-layout.css:6997`) first; extend rather than fork if either fits.
   - Tokens only. No bare hex, no `rgba()`, no inline `style=`.
   - The banner must name the character (by `displayName`) and the unresolved bloodline verbatim.
5. **Editor lock.** In the admin editor, an unresolved character's discipline dot/CP/XP inputs are
   disabled, with the reason stated inline. Everything else on the sheet stays editable — this is a
   discipline-costing lock, not a read-only mode. `shEditDiscPt` (`editor/sheet.js:660`) and the
   `edit.js:654` path are the write surfaces to gate.
6. **Boot priming at both entry points**, following the ECM precedent exactly:
   `admin.js` (alongside `loadEquipmentCatalogue()` at `:1300`) and `app.js` (in the
   `Promise.allSettled` at `:719`). `tabs/downtime-form.js` free-rides on `app.js`'s priming rather
   than priming its own (documented at `downtime-form.js:36`) — keep that arrangement.
   **Unlike ECM, a failed load is not console-only.** It raises the AC-4 banner.
7. **No character is costed before the cache is ready.** The transient miss is the dangerous one.
   Either boot awaits the cache before the first sheet render, or an unloaded cache is itself an
   AC-3 miss for every bloodline character. Pick one and say which in the Dev Agent Record; do not
   leave a window where a bloodline character renders against an unloaded cache and looks fine.
8. **Behaviour is identical for the 23 seeded bloodlines.** With the collection seeded, every
   character's in-clan set and every XP cost must be byte-identical to what the constants produce
   today. A test proves this over all 23, not a sample — the cache's disciplines-by-name must equal
   `BLOODLINE_DISCS` exactly while both exist.
9. **Tests** (targeted vitest; the full suite is NOT a gate — see Dev Notes):
   - cache module: load, idempotent concurrent load, load failure, lookup hit and miss;
   - `clanDiscList` matrix: no bloodline (clan list), resolved bloodline (cache list), unresolved
     bloodline (**empty**, miss registered), cache not loaded (**empty**, distinct miss reason);
   - the AC-8 equivalence test across all 23;
   - a regression test pinning the two-way error: for **Malkovians**, assert `Animalism` is NOT
     in-clan and `Auspex`/`Obfuscate` ARE — the exact case the old fallback got wrong both ways;
   - the editor lock: an unresolved character's discipline inputs are disabled and a dot change
     does not mutate the document.

## What this story is NOT

- **No retirement of the constants.** `BLOODLINE_DISCS` / `BLOODLINE_CLANS` / `APPROVED_BLOODLINES`
  stay exactly where they are, and the six non-accessor readers keep reading them — **BL-3**.
- **No rewiring of the DT form's own in-clan check** (`tabs/downtime-form.js:4112`, plus `:4174/:4176`).
  It is a second implementation of the same rule and it does not call `isInClanDisc`, so this story
  does not reach it. **BL-3.** See the sequencing constraint in Dev Notes — it is load-bearing.
- **No admin CRUD, no write endpoints, no WS broadcast** — **BL-4**.
- **No validation of `characters.bloodline`** — **BL-5**.
- **No `wizard.js` work.** Dead, zero importers; belongs to #1095.
- **No fix to the dead `app-status-banner`** in the rules-engine path. Registered as a finding; this
  story adds its own working surface rather than repairing an unrelated feature's.
- **No `active` filtering decision.** See the open question in Dev Notes.

## Tasks / Subtasks

- [ ] Task 1 (AC 1, 2): `public/js/data/bloodlines-cache.js` on the ECM structural pattern.
- [ ] Task 2 (AC 4): audit `components.css` for a reusable banner class; add or extend one; wire a
      container that provably exists in **both** `index.html` and `admin.html`.
- [ ] Task 3 (AC 3, 7): rewire `clanDiscList` in `public/js/data/accessors.js`, with the two miss
      causes distinguished.
- [ ] Task 4 (AC 5): gate the editor's discipline write surfaces for an unresolved character.
- [ ] Task 5 (AC 6): boot priming in `admin.js` and `app.js`.
- [ ] Task 6 (AC 8, 9): tests, including the all-23 equivalence and the Malkovians two-way regression.
- [ ] Task 7: manual verification in-browser against a seeded local/dev DB — one resolved character,
      one deliberately unresolved, and one with no bloodline. Paste what you saw into the record.
- [ ] Task 8: PR to `main` (Angelus's word). *(GATED.)*

## Dev Notes

### Verified state (data-lock, 2026-08-10 — re-verify line numbers before editing)

| Fact | Evidence |
|---|---|
| `clanDiscList` unchanged, miss silent | `public/js/data/accessors.js:15` |
| XP multiplier | `public/js/editor/edit.js:654`, `isInClanDisc(c, disc) ? 3 : 4` |
| `isInClanDisc` call sites: **8 in 4 files** (map previously said nine) | `data/audit.js:106`; `editor/edit.js:638/645/654`; `editor/export-character.js:174`; `editor/sheet.js:668/671/675` |
| Constants readers: 7 client files | `accessors.js:15`, `edit.js:103/654`, `identity.js:19`, `sheet.js:2692`, `downtime-form.js:4112/4174/4176`, `wizard.js:118` (dead) |
| **No server-side in-clan logic exists** | grep over `server/`; `ranking_ballots.js:138`'s `inClan` is clan *ranking*, unrelated. BL-2 is client-only |
| ECM cache + priming precedent | `data/equipment-catalogue-cache.js`; `admin.js:1300`, `app.js:719`, both non-fatal, console-only |
| `app-status-banner` is dead code | no element in any `public/*.html`, no CSS for the class. Drift pattern #16 |
| Both apps load `components.css` | `index.html:21`, `admin.html:12` |
| Admin has no toast helper | `toast()` exists in `suite/toast.js` and is used by `app.js` only. A banner, not a toast — and this warning is persistent, not transient |
| Live: no `bloodlines` collection | 41 collections, 2026-08-10 |
| Live holders | 13 characters, 13 distinct values, 13/13 resolve against the 23 |
| A vitest mock pins the constants module | `server/tests/dt-form-territory-fresh-fetch.test.js:77-78` mocks `CLAN_DISCS: {}` and `BLOODLINE_DISCS: {}`. Check it still passes |

### The sequencing constraint — BL-4 must not ship before BL-3

After BL-2 there are **two live sources of in-clan truth**: the collection (via `clanDiscList`, used
by the sheet, editor, audit and export) and the constant (via the DT form's own check at
`downtime-form.js:4112`). While the collection is seeded *from* the constants they agree, so the
window is safe.

It stops being safe the moment a bloodline exists in Mongo that is not in the constants — which is
exactly what **BL-4** delivers. A Mongo-only bloodline would then cost correctly on the sheet and
wrongly in the DT form's pools, silently. **BL-3 must land before BL-4 is enabled**, or the epic's
own promise half-works. Record this on BL-4's sprint-status line when BL-3 is specced.

### Environment and hard rules

- **The full test suite is not a gate** — 4 permanent reds (#1116, #1115), a collection error
  (#1125), and with mongod absent **1074 tests silently skip** while the run reports success
  (#1117). Also newly confirmed red: `tests/issue-837-xp-totals-deprecation.test.js` fails to parse
  (`SyntaxError`) before running a test — pre-existing, unrelated, do not chase it. Run only your
  own specs plus any you touch: `cd server && npx vitest run <files>`. Never pipe through `tail`.
- **Normalised CSS is mandatory.** Tokens from `public/css/theme.css`, reuse a component class,
  never a bare hex or inline `style=`. `specs/architecture/coding-standards.md` → CSS Standards.
- British English, no em-dashes in any string the app prints.
- Branch from `main`; PR to `main`; no push or merge without Angelus's explicit word.

### Open question for Angelus — answer before Task 3, it changes AC 3

**Should an `active: false` bloodline resolve?** The schema has `active` so a bloodline can be
retired without breaking historical characters, but `GET /api/bloodlines` applies no filter and
`active` is not in `required` (so a document omitting it is indistinguishable from an active one).
Two defensible readings:

- **Resolve it** — a retired bloodline still costs its holders' disciplines correctly; `active`
  only controls whether it appears in the *creation picker* (BL-3's dropdowns). Recommended: it
  keeps existing characters working, which is the stated reason the field exists.
- **Treat it as a miss** — retiring a bloodline should force the ST to deal with its holders.

The recommendation is the first. If it stands, the cache resolves regardless of `active`, and
`active` becomes purely a BL-3 dropdown filter — say so in the Dev Agent Record.

### References

- Issue **#1008**; epic registered in `specs/stories/sprint-status.yaml` under `epic-bl`
- **BL-1 story** `specs/stories/bl-1-bloodline-collection-and-seed.story.md` — its Senior Developer
  Review is the closest prior art for this epic's failure modes
- `D:\Terra Mortis\data-map.md` — drift pattern **#15** (updated + the ruling), drift pattern **#16**
  (the dead banner), the **Bloodlines** entry, the **`bloodlines` (collection)** entry
- `specs/stories/deferred-work.md` — BL-1's seven deferrals, several of which BL-2 or BL-4 inherit
- Precedents: `public/js/data/equipment-catalogue-cache.js`, `public/js/admin.js:1292-1303`,
  `public/js/app.js:710-740`

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
