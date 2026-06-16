# Free-Channel Contamination — Root Cause Investigation

**Issue:** [#808](https://github.com/angelusvmorningstar/TerraMortis/issues/808)
**Author:** Ma'at (QA)
**Dispatched by:** Khepri (SM)
**Branch:** `maat/investigation-808-free-channel-contamination` (worktree, isolated from Ptah)
**Base:** `origin/dev` @ `37b6fe0f`

---

## TL;DR

**Identified writer: `server/lib/normalize-character.js` lines 73-101 (`normalizeMerit`), called via `normalizeMeritsMiddleware` on every POST/PUT/wizard write.**

The function's helper `sumChannels` (lines 63-67) iterates the `MERIT_CHANNELS` array (`'cp', 'xp', 'free', free_<14 legacy slugs>`) but does **NOT** include `m.free_grants` map values. After N-1 introduced the `free_grants` map (PR #672) and N-2 backfilled production data into it (PR #695), every merit whose only allocation lives in the map looks like `sum === 0` to the server normalizer. The `sum === 0 && rating > 0` branch then backfills `merit.free` (or `merit.free_<slug>` via `granted_by`), creating the contamination pattern Khepri's audit found.

Hypothesis ranking after investigation: **H3 confirmed; H1/H2/H4/H5/H6 negative.**

Issue #790's Necropolis-target categorical exclusion at `domain.js:234-243` is a band-aid for one symptom of this same bug — the comment explicitly says "of unknown origin (no current main code path writes m.free positive on these rows, but the cleanup script was one-shot)." This investigation identifies that unknown origin.

---

## Hypothesis-by-hypothesis findings

### H1 — Evaluator parallel-write to `m.free` — RULED OUT

`grep -rn "\.free\s*=" public/js/editor/rule_engine/` returns exactly two matches:

```
rule_engine/style-retainer-evaluator.js:28:
  if (m.name === 'Retainer' && m.granted_by === styleName) { m.free = 0; m.free_pet = 0; }

rule_engine/bloodline-evaluator.js:23:
  if (m.granted_by === 'Bloodline') { m.free = 0; m.free_bloodline = 0; }
```

Both are `= 0` resets on granted-by paths. No evaluator writes a positive value to `m.free` as a side-effect. Cleanly negative.

### H2 — Save serializer (`charsForSave` / `buildSaveBody`) — RULED OUT

`charsForSave` at `public/js/editor/export.js:50-76` clones, strips overlay, removes `derived` merits and `_`-prefixed merit-level fields. Touches nothing else.

`buildSaveBody` at `public/js/admin.js:919-944` is the actual API save serializer (Ma'at: `charsForSave` is the localStorage path, not the API path — this distinction matters for the trace). It strips `_id`, ephemeral `_*` fields, legacy v2 fields, and merit-level `_*` keys. Preserves `m.rating` and all `free_*` channels verbatim.

Neither writer touches `m.free` or any `free_*` field directly. Cleanly negative.

### H3 — Server-side normalization on PUT — CONFIRMED

The writer is `server/lib/normalize-character.js:73-101`:

```js
export function normalizeMerit(merit) {
  if (!merit || typeof merit !== 'object') return { changed: false };
  const sum = sumChannels(merit);
  const rating = merit.rating || 0;

  if (sum === 0 && rating > 0) {
    const channel = backfillChannel(merit);
    merit[channel] = (merit[channel] || 0) + rating;
    return { changed: true, reason: 'backfilled', ... };
  }

  if (sum !== rating) {
    merit.rating = sum;
    return { changed: true, reason: 'synced', ... };
  }

  return { changed: false };
}
```

The `sumChannels` helper at lines 63-67 iterates the **`MERIT_CHANNELS`** constant at lines 25-30:

```js
const MERIT_CHANNELS = [
  'cp', 'xp', 'free',
  'free_mci', 'free_vm', 'free_lk', 'free_ohm', 'free_inv',
  'free_pt', 'free_mdb', 'free_sw', 'free_bloodline', 'free_pet',
  'free_attache', 'free_carthian',
];
```

`free_grants` is absent. The same file's `_effectiveMeritRating` at lines 242-255 (used by the White Ants validator) **does** sum `m.free_grants` + the 14 legacy slugs correctly — proof that the maintainers know the canonical formula. The normalizer hasn't been updated to match.

Middleware wiring (`server/routes/characters.js`):

| Route | Line | Middleware chain |
|-------|------|------------------|
| `POST /wizard` | 412 | `...validateCharacter, normalizeMeritsMiddleware, validateWhiteAntsTerritories..., ...` |
| `POST /` | 439 | `...validateCharacter, normalizeMeritsMiddleware, ...` |
| `PUT /:id` | 451 | `...validateCharacterPartial, normalizeMeritsMiddleware, ...` |

Plus two direct calls inside the Carthian Pull push/strip endpoint at characters.js:658 + 719 — same broken normalizer, same corruption surface.

**Every character write goes through this normalizer.**

### H4 — Downtime resolution — RULED OUT

`grep -n "\.free\s*=" server/routes/downtime.js` returns zero matches. The downtime resolution path mutates merit ratings (e.g. influence pushes) but does NOT write `m.free` directly. Cleanly negative.

### H5 — N-2 backfill script side-effect — RULED OUT

`server/scripts/backfill-free-grants.js`:
- Sets `m.free_grants[slug]` (the target map).
- `$unset`s legacy `free_<slug>` fields after migration.
- Never writes `m.free` (the unprefixed channel).
- Idempotent — re-running matches zero docs.

Backfill is correct. The post-backfill state (data in map, legacy slugs unset) is exactly what defeats `sumChannels`. The backfill is the trigger condition for the H3 writer, not the writer itself.

### H6 — Historical writers — RULED OUT (with one note)

```
git log -S 'm.free =' --oneline -- public/js/editor
```

Recent matches in editor code:

```
27604929 feat(rde-9): K-9 + Falconry migration — style-retainer evaluator
aeb4e20a feat(rde-7): bloodline grants migration — DB-backed evaluator
ac971f37 feat(rde-0): remove in-render legacy migration cruft
7ac43a41 Fix.14: Remove generic free dot bucket from all stat types
9331c283 Fix.14 Task 11 (early): Convert K-9/Falconry Retainer grant to free_retainer
3fc17ca2 Fix.15: Bloodline grant refactor — free_bloodline, lowercase qualifier, spec exemption
3fc17ca2 Fix.19: Remove erroneous free dot grant from Fucking Thief
```

All client-side `m.free =` writers were removed during the Fix.14 / Fix.15 era (months before N-1/N-2). Editor side has been clean for a long time. The only remaining client-side `m.free = …` writes are the two `= 0` resets in the evaluators above (H1). No lingering writer leaking data through the editor flow.

The five `m.free = ` writes still in the tree are:

| File | Line | Context | Active? |
|------|------|---------|---------|
| `public/js/editor/merits.js:111, 129` | merit-shape ensure helpers | `if (m.free === undefined) m.free = 0` — initialiser, no contamination | active, safe |
| `public/js/editor/rule_engine/{style-retainer,bloodline}-evaluator.js` | granted-by reset | `m.free = 0` | active, safe (H1) |
| `server/lib/normalize-character.js:80` | `merit[channel] = (merit[channel] \|\| 0) + rating` where `channel === 'free'` for unknown granted_by | **THE WRITER** | active, broken |
| `server/scripts/archive/migrate-*.js` | one-shot migrations | archived | inactive |

---

## Reproducer walk-through (Xavier + Catacombs NECRO stepper)

| Step | What happens | State of Catacombs merit |
|------|--------------|--------------------------|
| 1 | ST opens Xavier in admin editor | GET `/api/characters/:id`. Initial state from cleanup: `{cp:0, xp:0, free:0, free_grants:{necro:1}, rating:1}` |
| 2 | Sheet renders | Client `meritFreeSum` (Necropolis carve-out at `domain.js:241`) returns `free_grants.necro = 1`. Displayed: 1 dot. ✓ correct |
| 3 | ST adjusts NECRO stepper (or any other edit) | Client handler mutates merit, then calls `ensureMeritSync` / `syncMeritRating` (e.g. `mci.js:166`, `edit.js:1051/1061`). Result: `m.rating = cp + xp + meritFreeSum(m) = 0 + 0 + 1 = 1` |
| 4 | ST clicks Save | `saveCharToApi` (admin.js:946) calls `buildSaveBody(c)` → preserves merit object including `{rating:1, free_grants:{necro:1}, ...}`. Wire body: `apiPut('/api/characters/' + _id, body)` |
| 5 | Server PUT `/api/characters/:id` | `normalizeMeritsMiddleware` runs (characters.js:451). `normalizeMerit` iterates merits. For Catacombs: `sumChannels = cp + xp + free + free_<14 slugs> = 0`. `rating = 1`. **Triggers `sum===0 && rating>0` → backfill.** `backfillChannel(merit)` returns `'free'` (no recognized `granted_by` on Catacombs). Writes: `merit.free = 0 + 1 = 1`. |
| 6 | Persisted state | `{cp:0, xp:0, free:1, free_grants:{necro:1}, rating:1}` ← **CONTAMINATED** |
| 7 | Next render | Necropolis carve-out at `domain.js:241` ignores `m.free` — visible dots stay correct at 1 for this name. But `_audit-free-contamination.js` flags `m.free > 0 && free_grants.necro > 0` as Pattern A. The carve-out hides the symptom on Necropolis names; for non-Necropolis merits (Allies + Lorekeeper, Mentor + MCI, etc.) there is no carve-out and the visible total doubles. |

**Why the cleanup zeroed Yusuf but Xavier came back contaminated**: the cleanup script (one-shot) zeroed `m.free` in DB. The next PUT on Xavier re-ran the normalizer; sumChannels still returned 0 for `free_grants`-only merits; backfill re-wrote `m.free = rating`. Cleanup is purely cosmetic without fixing the writer.

### Generalised pattern table

| Merit `granted_by` | `backfillChannel(m)` returns | Result if `free_grants.<slug>` populated | Audit pattern |
|---------------------|------------------------------|-------------------------------------------|---------------|
| absent / unknown | `'free'` | `m.free` = rating, `free_grants.X` stays | **Pattern A** (49 cases) |
| `'Lorekeeper'` | `'free_lk'` | `m.free_lk` = rating, `free_grants.lk` stays | **Pattern B** (subset of 10) |
| `'Invested'` | `'free_inv'` | `m.free_inv` = rating, `free_grants.inv` stays | **Pattern B** (subset of 10) |
| `'VM'` | `'free_vm'` | `m.free_vm` = rating, `free_grants.vm` stays | **Pattern B** (subset of 10) |
| `'MCI'` | `'free_mci'` | `m.free_mci` = rating, `free_grants.mci` stays | **Pattern B** (subset of 10) |
| `'OHM'` / `'PT'` / `'Safe Word'` / `'K-9'` / `'Falconry'` / `'MDB'` / `'Bloodline'` / `'Carthian Pull'` | `'free_<...>'` per `GRANTED_BY_CHANNEL` | Same shape | **Pattern B** (remainder) |

Pattern A (49) = unknown / no `granted_by` (e.g. Necropolis targets — the Collective Compound source doesn't tag granted_by; user-purchased merits with free_grants allocations from rules).

Pattern B (10) = recognized `granted_by` tag. The smaller count reflects how many merits in production have a granted-by tag AND a `free_grants`-only allocation.

49 + 10 = 59. Khepri reported 60 total — within one of perfect-match (likely a single double-counted merit or a Pattern-B merit that also has Pattern-A residue from a prior cleanup state).

---

## Risk assessment

### Display correctness (current state)

**Necropolis-target merits** (Catacombs, Caldarium, Garbage Pit, Labyrinth Guardians, Dark Temple, White Ants) — DISPLAY CORRECT due to Issue #790 carve-out at `domain.js:241-243`. But the contamination is persisted on disk; any future code path that bypasses `meritFreeSum` on these names (e.g. server-side derived computations, CSV export, print sheet) will see the doubled value.

**All other contaminated merits** — DISPLAY DOUBLED. `meritFreeSum` at `domain.js:251` returns `(m.free || 0) + _meritFreeSumHelper(m)`. The helper sums map + legacy. Adding `m.free` on top is the double-count.

Concretely, for Pattern A on a non-Necropolis merit with `m.free = 1` and `m.free_grants.necro` (or any other slug) `= 1`:
- `meritFreeSum` returns `1 + 1 = 2`
- `meritEffectiveRating = cp + xp + 2 = 2` (when canonical is 1)
- Display shows 2 dots
- Rating-vs-sum invariant warning at `sheet.js:191` fires (red merit-rating-mismatch badge) — `m.rating = 1` from persistence, `syncMeritRating(m) = 2`, divergence flagged

For Pattern B on a non-Necropolis merit with `m.free_<slug> = 1` and `m.free_grants.<slug> = 1`:
- `_meritFreeSumHelper` sums map (1) + legacy (1) = 2
- `meritFreeSum` = `m.free (0) + 2 = 2`
- Same doubling
- Same rating-mismatch warning

### Per-character impact

The audit baseline (`_audit-free-contamination.js`) is the load-bearing list. I do not have direct DB read access to run it from this worktree, so I rely on Khepri's reported count: 60 instances across ~13 characters (essentially every active player).

Affected merits by character class (inferred from the audit shapes Khepri quoted):
- Necropolis owners (e.g. Xavier, Yusuf) — Catacombs / Caldarium / Garbage Pit / Labyrinth Guardians / White Ants. **Display correct** (carve-out); **persistence wrong**.
- Lorekeeper holders — Allies / Mentor / Resources / Retainer with `free_grants.lk`. **Display doubled.**
- Invested holders — Herd / Mentor / Resources / Retainer with `free_grants.inv`. **Display doubled.**
- VM holders — Allies / Mentor with `free_grants.vm`. **Display doubled.**
- MCI users — anything with `free_grants.mci`. **Display doubled.**

The "essentially every active player" framing matches: any character with a Lorekeeper / Invested / VM / MCI allocation is affected. That's most of the roster.

### Blast radius going forward

- Every PUT/POST re-applies the corruption. Cleanup scripts are purely cosmetic without fixing the writer first.
- Carthian Pull endpoint (characters.js:658, 719) calls `normalizeCharacterMerits` directly twice — once on the stripped base, once on the augmented body. Same corruption surface, applied twice in one request.
- The N-2 backfill is the trigger condition — pre-N-2 data lived in legacy slugs, so `sumChannels` saw it correctly. Post-N-2 production data, the trigger condition is permanent until the writer is fixed.
- Rating-vs-sum warnings (`sheet.js:191`) are firing on every contaminated merit. They're informational, not blocking, but they're noise that obscures real drift.

---

## Recommended fix shape

### Phase 1 — Stop the writer (one-line semantic fix, plus the data structure that supports it)

**Edit `server/lib/normalize-character.js`** — make `sumChannels` aware of `free_grants`:

```js
function sumChannels(merit) {
  let s = 0;
  for (const ch of MERIT_CHANNELS) s += (merit[ch] || 0);
  // Sum free_grants map values — this is where post-N-1 data lives.
  if (merit.free_grants && typeof merit.free_grants === 'object') {
    for (const v of Object.values(merit.free_grants)) s += (v || 0);
  }
  return s;
}
```

Single function, single behaviour change. Aligns `sumChannels` with the same file's `_effectiveMeritRating` (lines 242-255) and the client's `syncMeritRating`. After this lands, `sumChannels` returns 1 for a Catacombs with `free_grants.necro = 1` → the `sum === 0 && rating > 0` branch no longer fires → no contamination on save.

The second branch (`sum !== rating → rating = sum`) becomes correct too: a client with `rating = 1` and `free_grants.necro = 1` will hit `sum === 1, rating === 1`, no-op.

### Phase 2 — Re-run the cleanup script, once normaliser is fixed

The cleanup script that zeroed Yusuf needs to run again across all characters. With Phase 1 deployed, the cleanup is durable (no PUT will re-contaminate).

The exact script Khepri ran is not in this worktree — I assume it lives in `server/scripts/cleanup-free-contamination.js` or similar (or was an inline mongosh run). Re-run shape:

- For each character merit where `m.free > 0` AND `meritFreeSum(m) > 0` without `m.free`: subtract `m.free` from rating; zero `m.free`. (Pattern A.)
- For each character merit where `m.free_<slug> > 0` AND `m.free_grants.<slug> > 0`: zero the legacy `m.free_<slug>`. (Pattern B — the legacy value is the duplicate; map value is canonical because that's where N-2 backfill landed.)
- Necropolis-target merits: same Pattern A treatment, but the visible display was already correct so this is purely persistence hygiene.

Recommend committing this cleanup script (currently inline / one-shot) into `server/scripts/` so re-runs are reproducible. After Phase 1 it should be idempotent.

### Phase 3 — Remove the Issue #790 band-aid (optional, low priority)

After Phase 1 + 2, the Necropolis-target categorical exclusion at `domain.js:228-243` becomes dead code — `meritFreeSum` will correctly return `free_grants.necro` because `m.free` and the legacy slugs will all be 0 on those merits. Keeping it does no harm (categorical filter still works), but the dead-comment-on-bug-of-unknown-origin should be updated or removed to reflect that the writer is identified and fixed.

Phase 3 is housekeeping; don't bundle with Phase 1 dispatch.

### Phase 4 — Defence-in-depth (recommended, separate story)

Consolidate the channel enumeration. The same 14-slug list appears in:
- `public/js/data/rules-helpers.js:71-74` — `LEGACY_FREE_SLUGS`
- `server/lib/normalize-character.js:25-30` — `MERIT_CHANNELS` (overlaps; includes `free` + `cp` + `xp`)
- `server/lib/normalize-character.js:242-255` — `_effectiveMeritRating`'s hardcoded sum
- `server/scripts/backfill-free-grants.js:65-68` — re-imports `LEGACY_FREE_SLUGS`

The drift between `MERIT_CHANNELS` and `LEGACY_FREE_SLUGS` (the former excludes `free_grants`, the latter doesn't know about it) is exactly the failure mode that caused #808. Single source of truth — server pulls from `rules-helpers.js`, plus an explicit `MAP_CHANNEL = 'free_grants'` constant. Eliminates the entire class.

---

## Coordination notes

- **Dispatch shape**: Phase 1 is a single-file 3-line change. Phase 2 is a script re-run. Phase 3/4 are follow-ups. Recommend one story for Phase 1+2 bundled (the fix is meaningless without the cleanup; the cleanup is unsafe without the fix); Phases 3+4 as separate housekeeping stories.

- **#790 carve-out**: stays in place during Phase 1+2 — it's still a backstop if any new write path bypasses the normalizer. Remove only after Phase 3 (intentional).

- **Yusuf / Xavier divergence**: not a regression from the cleanup. It's evidence that the writer is post-cleanup (every PUT re-contaminates). The cleanup itself was correct; it just runs against a corruption stream.

- **CLAUDE.md "Derived stats never stored" rule**: this normalizer is technically writing-on-save — but the writes target *base channels* (cp/xp/free/free_*) and the rating field, not derived stats. So the rule isn't being violated by the existence of the normalizer; it's being violated by the normalizer's wrong arithmetic. The fix preserves the normalizer's intent (catch sync drift at the persistence boundary) and fixes the math.

- **Memory entry candidate**: this is a perfect example of two places in the same file holding two views of the same arithmetic (`sumChannels` vs `_effectiveMeritRating`) and drifting. Worth a `feedback_*` entry if Khepri agrees — pattern is the same shape as `feedback_canonical_first_state_pattern` (read sites should consult the canonical helper, not hand-roll).

- **Branch hygiene**: this investigation produced one file (`specs/investigations/2026-06-16-free-channel-contamination.md`) in worktree `/tmp/tm-maat/free-channel-contamination`. No leak onto Ptah's working tree. PR opened against `dev`.

---

## Cross-references

- **#790** — Necropolis-target categorical exclusion (the band-aid). Resolved by Phase 3.
- **#695 (N-2 backfill)** — the trigger event. Correctly designed; correctly run.
- **#672 (N-1)** — introduced `free_grants` map. The server normalizer was not updated when this landed.
- **ADR-005 Rev 2 D1** — defined `free_grants` map + the union-sum guard on the client. Server normalizer should have been brought into the same contract.
- **`feedback_canonical_first_state_pattern`** — same shape (canonical helper + read sites that hand-roll the arithmetic and drift).
- **CLAUDE.md "Derived stats never stored"** — not violated; the normalizer writes base channels, not derived stats. The bug is arithmetic, not architecture.
