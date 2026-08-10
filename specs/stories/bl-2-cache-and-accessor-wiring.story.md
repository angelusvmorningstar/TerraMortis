# Story BL-2: The bloodline cache, `clanDiscList` rewired, and a loud miss path

Status: done

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
- **No `active` handling of any kind.** The field no longer exists — see Dev Notes.

## Tasks / Subtasks

- [x] Task 1 (AC 1, 2): `public/js/data/bloodlines-cache.js` on the ECM structural pattern.
- [x] Task 2 (AC 4): audit `components.css` for a reusable banner class; add or extend one; wire a
      container that provably exists in **both** `index.html` and `admin.html`.
- [x] Task 3 (AC 3, 7): rewire `clanDiscList` in `public/js/data/accessors.js`, with the two miss
      causes distinguished.
- [x] Task 4 (AC 5): gate the editor's discipline write surfaces for an unresolved character.
- [x] Task 5 (AC 6): boot priming in `admin.js` and `app.js`.
- [x] Task 6 (AC 8, 9): tests, including the all-23 equivalence and the Malkovians two-way regression.
- [~] Task 7: manual verification in-browser against a seeded local/dev DB — one resolved character,
      one deliberately unresolved, and one with no bloodline. Paste what you saw into the record.
      **PARTIAL — see the Senior Developer Review. Logic verified against all 13 live characters in
      all four states; browser RENDERING still not seen. The tick was wrong and is corrected here.**
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

### The `active` question — CLOSED 2026-08-10, by deletion

This story originally asked whether an `active: false` bloodline should still resolve for costing.
Angelus ruled the premise away: **a bloodline cannot be retired. They are permanent.** `active` was
therefore removed from BL-1's schema, seed and fixtures the same day, while BL-1 was still unmerged
and unseeded. A schema test now rejects `active` as an unknown property.

**There is no soft-retire state and no `active` filter anywhere in this epic.** Every bloodline in
the collection is live. Do not add an `active` check to the cache, the resolver or BL-3's dropdowns,
and do not reintroduce the field as a BL-4 convenience — if the rule ever changes it comes back as a
deliberate schema change plus a migration, not as a quietly-added boolean.

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

Claude Opus 5 (`claude-opus-5`), via `bmad-dev-story` inside `bmad-loop`. 2026-08-10.

### Debug Log References

**Verification against all 13 real live characters, post-seed.** The live `bloodlines` collection
does not exist yet, so the check fed the cache exactly what the route will serve once `--apply` runs
(`buildSeedDocs` output with `notes` projected out, matching `routes/bloodlines.js`), then ran the
real `clanDiscList` over the real character documents read from live:

```
cache loaded: true | entries: 23

René St. Dominique (Apollinaire)               OK | locked: false
Carver (Lasombra)                              OK | locked: false
Doc (Kerberos)                                 OK | locked: false
Mac (Norvegi)                                  OK | locked: false
Cazz (Malkovians)                              OK | locked: false
René Meyer (Zelani)                            OK | locked: false
Charles Mercer-Willows (Gorgons)               OK | locked: false
Charlie Ballsack (Order of Sir Martin)         OK | locked: false
Ivana Horvat (Scions of the First City)        OK | locked: false
Einar Solveig (Rotgrafen)                      OK | locked: false
Keeper (Mnemosyne)                             OK | locked: false
Terrassa Mortimer (Lidérc)                     OK | locked: false
Ocka Keats (Hounds of Actaeon)                 OK | locked: false

every character matches the constants: true
misses after load: 0
banner renders: ""
```

**The unresolved path, against the same real characters, with the cache unloaded** (which is also
exactly what today's live API would produce, since it returns `[]`):

```
René St. Dominique: [] | locked: true
Carver:             [] | locked: true
Doc:                [] | locked: true
misses: 3   reason: cache_not_loaded

<div class="bl-warn-banner" role="alert"><div class="bl-warn-row"><strong>Bloodline data has not
loaded.</strong> Every character with a bloodline is being costed as out-of-clan (4 XP per dot) and
discipline editing is locked. Reload the page; if that does not clear it, the API is unreachable.</div>
```

**Tests:**

```
npx vitest run tests/bl2-*.test.js
→ Test Files 5 passed (5) · Tests 67 passed (67)

Full touched surface (18 files: the five BL-2 suites, the three BL-1 suites, and every existing
suite that imports accessors.js, api.js or test-app.js)
→ Test Files 18 passed (18) · Tests 300 passed (300)
```

**Pre-existing reds, confirmed not mine** by stashing my changes and re-running:
`issue-836-legacy-tracker-cache-removed.test.js` (ENOENT on a file #836 deleted) and
`n8-mandragora-prereq.test.js` (`SyntaxError` before any test runs). Both fail identically without
this story's changes, joining the four the story's Environment note already lists.

### Completion Notes List

**A regression I caused and fixed, worth reading before the review.** Making `accessors.js` import
the cache pulled `data/api.js` into its module graph, and `api.js` read `location` at module scope.
That made the entire client data layer un-importable outside a browser and broke two existing suites
(`derived-stat-modifiers-parallel-write`, `disc-attr-parallel-write`). I confirmed I was the cause by
stashing `accessors.js` and watching them pass. Fixed at the root: `API_BASE` is now resolved
per-request by `apiBase()` rather than at module load. Behaviour-identical in the browser
(`location` cannot change between module load and first request) and it removes a fragility that
would have bitten the next person to import anything from `data/`.

**AC 7 — which of the two options I took: both, deliberately.** The story allowed either awaiting the
cache before first render or treating an unloaded cache as a miss. I did both, because they cover
different failures. The await (in `app.js`'s boot `Promise.allSettled` and before `admin.js`'s
character fetch) means the transient window never opens in normal operation. The miss is the backstop
for when the fetch genuinely failed, which the await cannot fix. Doing only the await would leave a
failed load silently costing everyone as out-of-clan; doing only the miss would fire the banner
during every normal boot.

**Design decisions:**

1. **The miss registry lives in the cache, not in `clanDiscList`.** `clanDiscList` runs on every
   render across 8 call sites, so it must stay cheap and DOM-free. It records; the banner renders
   from the registry and re-renders on change. `recordBloodlineMiss` only notifies when the registry
   actually changes, or a re-render loop would fire the listener on every pass.
2. **The two miss causes are separate registry entries, not one flag.** A system state ("data has not
   loaded, reload") and a data state ("this bloodline does not exist, adding it is the fix") need
   different sentences. Suggesting a reload for an unknown bloodline would be actively misleading.
3. **`bloodlineUnresolved(c)` is expressed as `clanDiscList(c).length === 0`** rather than as its own
   lookup, so the editor lock and the costing can never disagree about what "unresolved" means.
4. **The editor guard is in the handler, not the markup.** The data-lock found clan and bloodline each
   have two independent editing surfaces, so a rule enforced in one template holds on one screen.
   `shEditDiscPt` is the single write path for discipline CP and XP (`dots` is derived from them), so
   gating it covers the whole costing surface. The inline note in `sheet.js` is the visible half.
5. **The banner is a new shared class, after auditing both candidates the story named.**
   `.rel-pending-banner` is namespaced to relationships and is an attention/gold register, not an
   error one; `.reg-cta-banner` uses raw `rgba()`, which the project's CSS standard forbids, so
   extending it would have propagated a violation. I added `.bl-warn-banner` to `components.css`
   (loaded by both apps) and refactored the shared layout into a **grouped selector** with
   `.rel-pending-banner`, per coding-standards' Shared Chrome Pattern. The split is byte-identical in
   computed style — layout moved to the group, each variant keeps only its own colours.
6. **The mount is self-healing.** Drift pattern #16 exists because `if (banner) {...}` turned a
   missing element into permanent silence. `resolveMount()` creates the element and logs an error
   instead of returning early, and a test asserts the element is present in both HTML files.

**Honest gap: no browser rendering was verified.** Task 7 asked for in-browser verification. The
logic is verified end to end against real live character documents (above), but the *visual* result —
that `.bl-warn-banner` and `.bl-disc-locked` actually look right in both themes, and that the banner
sits sensibly at the top of each page — has NOT been seen. Doing so needs either the seed applied to
live (an operational act this story is not authorised to perform) or a local stack with an auth
bypass. **This should be the first thing checked once BL-1 is merged and seeded, and before BL-2 is
enabled.** Flagged rather than quietly counted as done.

**Scope held.** The constants are untouched and still exported; the six non-accessor readers still
read them (BL-3). No change to `tabs/downtime-form.js`, whose private in-clan check is BL-3's. No
write endpoints, no WS broadcast, no `characters.bloodline` validation, no `wizard.js`, and no
`active` handling — the field no longer exists.

### File List

New:

- `public/js/data/bloodlines-cache.js`
- `public/js/components/bloodline-warn-banner.js`
- `server/tests/bl2-bloodlines-cache.test.js`
- `server/tests/bl2-bloodline-warn-banner.test.js`
- `server/tests/bl2-clandisclist-miss-path.test.js`
- `server/tests/bl2-editor-discipline-lock.test.js`
- `server/tests/bl2-boot-priming.test.js`
- `server/tests/repo-no-nul-bytes.test.js` (repo-wide guard, from the review)

Modified:

- `public/js/data/audit.js` — in-clan CP gates suppressed while a bloodline is unresolved
- `public/js/dev-fixtures.js` — a `/api/bloodlines` branch, hand-added to a generated file
- `public/js/data/accessors.js` — `clanDiscList` rewired; `bloodlineUnresolved` added; stopped
  importing `BLOODLINE_DISCS`
- `public/js/data/api.js` — `API_BASE` resolved per request (regression fix, see notes)
- `public/js/editor/edit.js` — `shEditDiscPt` refuses the write for an unresolved character
- `public/js/editor/sheet.js` — inline lock note on the Disciplines panel
- `public/js/app.js` / `public/js/admin.js` — boot priming + banner mount
- `public/css/components.css` — `.bl-warn-banner` / `.bl-warn-row` / `.bl-disc-locked`; shared banner
  layout regrouped with `.rel-pending-banner`
- `public/index.html` / `public/admin.html` — the banner mount element
- `specs/stories/bl-2-cache-and-accessor-wiring.story.md`, `specs/stories/sprint-status.yaml`

## Senior Developer Review (AI)

**Reviewer:** internal 3-layer adversarial review, parallel Opus subagents. Angelus chose internal
over Codex because he is remote. **Date:** 2026-08-10.
**Outcome:** Changes Requested → 13 fixes applied → **Approve.**

**Layers:** Blind Hunter (diff only) 14 findings · Edge Case Hunter (diff + repo, no spec) 17 ·
Acceptance Auditor (diff + spec + standards) 12. Two of the three independently found the same three
top issues, which is the signal worth acting on.

### The one that mattered most, and it was mine

**The cache module contained a literal NUL byte** at offset 7116 — my `'|'` key separator was written as a literal NUL character. Git classified `bloodlines-cache.js` as **binary**: `Bin 0 -> 8206 bytes`. The file
parsed, the tests passed, and the pre-commit hook only parse-checks, so nothing caught it. Had this
merged, the module at the centre of the epic would have shown as "Binary file not shown" in every PR
and never diffed or merged cleanly again. All three reviewers flagged it; the auditor found the exact
byte. Fixed; git now reports 203 lines of text. I also swept the other ten changed files — clean.

This is the second time this session a string literal of mine was silently mangled on write (the
first was a combining-mark class in BL-1's slug regex). Worth watching for.

### The one my own fix introduced, caught by running against real data

Distinguishing "the collection is empty" from "this bloodline is unknown" was correct — but I keyed
the registry on `reason|bloodline`, so an empty collection produced **13 identical banner rows**, one
per distinct bloodline on the roster. A global cause is one fact about the system, not one per
bloodline. Global reasons now collapse to a single row listing every affected character. Verified
against live: 1 row, 13 names.

### Fixes applied (13)

1. **[High] NUL byte / binary file** — above.
2. **[High] AC 5 was half-built.** The AC says the inputs "are disabled"; I had only the handler
   guard and the inline note. An ST could type a value, watch it sit in the box looking accepted, and
   have it silently discarded. Both discipline inputs now carry a conditional `disabled`, and a
   refused write re-renders so the input snaps back.
3. **[High] The player-app banner broke the layout.** `html,body{overflow:hidden}` and
   `#app{height:100dvh}` mean a body-level banner adds height on top of a full viewport and pushes
   the bottom tab bar out of a container that cannot scroll. Mount moved inside `#app`. Admin was
   unaffected (it scrolls).
4. **[High] An unseeded collection reported 23 imaginary data problems.** `[]` loaded cleanly and
   every character became "bloodline not found". That is today's live state. New third cause,
   `MISS_EMPTY_COLLECTION`, with its own wording: this is an operational fix, not a reload.
5. **[High] Three boot tests passed against comments.** Both apps mention `loadBloodlines()` **by
   name** in the comments explaining it, so a raw-source grep was satisfied with the actual call
   deleted. All three now strip comments first, and a fourth test proves the stripper is load-bearing
   by asserting the raw source has more matches than the stripped source.
6. **[Med] The registry was append-only**, so the banner kept naming a character after the ST fixed
   their bloodline. A resolving render now clears that character's misses; the banner self-corrects.
7. **[Med] `audit.js` invented build violations.** With an empty in-clan list all CP counts as
   out-of-clan, so `disc_oc_over` and `disc_ic_low` fired on every affected character, reporting a
   character-build error that does not exist and hiding the real cause behind a plausible one. Both
   gates are suppressed while unresolved, replaced by one warning that says why.
8. **[Med] Name matching was exact.** A `" khaibit"` from the CSV importer used to degrade silently;
   under this story it would HARD-LOCK the character, so tolerance matters more, not less. Indexed on
   a trimmed, case-folded key; `name` stays the display value.
9. **[Med] A resolved-but-unusable document locked with no banner.** `disciplines: []` returned a
   truthy empty array, sailed past the miss check, and locked the character silently while the inline
   note claimed the bloodline "could not be resolved". Now a miss.
10. **[Med] `/api/bloodlines` had no dev-fixtures branch**, so local dev fell through to a real fetch
    and hard-locked every fixture character. Added, derived from the constants. Flagged in-file as
    hand-added to an auto-generated file.
11. **[Med] The AC-8 equivalence test was a tautology** — it built its fixtures from the constants and
    asserted the constants came back. Now built by the real `buildSeedDocs` with `notes` projected out
    as the route does, so the chain under test is seed builder → route shape → cache → accessor.
12. **[Med] The app-status-banner guard inspected the import line**, not the boot block, because
    `indexOf` found the import first. Rewritten to assert the relationship (no line may touch both the
    dead id and the bloodline path) rather than proximity, which was catching the unrelated
    rules-engine block.
13. **[Low] Two dead exports removed** (`getBloodlines`, `hasBloodlineMiss`) — zero callers, against
    AC 1's own principle that an unused export is a claim the code cannot keep.

14. **[Process] A repo-wide NUL-byte guard added** (`server/tests/repo-no-nul-bytes.test.js`). Three
    occurrences in one session is a pattern, not bad luck, and nothing in the toolchain catches it:
    the file parses, the tests pass, and the pre-commit hook only parse-checks. Its first catch was
    its own comment describing the character, and then the Senior Developer Review text above, which
    is a fair demonstration of how easily this slips through.

Every code fix was proved to discriminate: reverted singly, the named test failed, then restored.
Eight reverts, eight failures. The first attempt at proving #5 did **not** discriminate — my revert
disabled only the block-comment stripper while the mentions live in line comments — so I redid it
properly rather than recording a false pass.

### Verified false, not patched (4)

- *"`--err-a12` may not exist, so the banner renders invisible"* — it exists in both the light and
  dark blocks of `theme.css`.
- *"The CSS regroup changes `.rel-pending-banner`"* — equal specificity, adjacent, non-overlapping
  property sets, defined nowhere else. Byte-identical computed style.
- *"`shEditDiscPt` blocks `free` dots, which carry no cost"* — `free` is not in the dots formula, but
  a `free` write still recomputes `dots` through the multiplier when XP is non-zero, so gating it is
  correct. The related "cannot back out a bad entry while locked" point is real and registered.
- *"Boot ordering may render before the cache loads"* — traced in both apps; it does not.

### Deferred (6)

Registered in `deferred-work.md`: the DT form's own clan fallback (BL-3, already the epic's
sequencing constraint), the Excel/CSV importers bypassing the lock, the bloodline dropdown and
`wizard.js` still reading the constants (BL-3), the two contradictory dot totals on a locked panel,
redact-mode label collapsing, and the discarded `mountBloodlineWarnBanner()` unsubscribe.

### Regression after patching

`Test Files 23 passed · Tests 383 passed` — the five BL-2 suites (now 92 tests, up from 67), the
new repo-wide NUL guard, the
three BL-1 suites, and every existing suite importing `accessors.js`, `api.js` or `test-app.js`.
Live re-verification after every change: 13/13 characters resolve post-seed; with today's empty
collection, one banner row naming all 13.

**No unresolved High or Medium findings remain.** The browser-rendering gap is unchanged and still
declared.

## Change Log

| Date | Change |
|---|---|
| 2026-08-10 | Internal 3-layer review. 13 fixes (5 High, 7 Medium, 1 Low), 6 deferred, 4 verified false. Worst was a literal NUL byte making the cache module binary in git; also found a defect in one of my own review fixes by re-running against live data. 22 new tests; all code fixes proved to discriminate. 380 green. |
| 2026-08-10 | BL-2 implemented. Bloodline cache on the ECM structural pattern with a miss registry; `clanDiscList` rewired to return EMPTY (never the clan list) on an unresolved bloodline; a warning banner that exists in both apps; the editor refusing discipline writes for an affected character; boot priming awaited in both apps. 67 new tests, 300 green across the touched surface. One self-inflicted regression found and fixed at the root (`api.js` module-scope `location`). Browser rendering not yet verified — see Completion Notes. Status → review. |
