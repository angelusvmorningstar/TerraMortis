---
title: 'Theme purge migration — remove legacy Cruac themes from disciplines map and close the inflow'
type: 'fix'
created: '2026-04-30'
status: review
recommended_model: 'sonnet — migration script + ingest cleanup + defence-in-depth filter, all bounded changes following existing migration script conventions'
context:
  - specs/epic-dtlt-dt2-live-form-triage.md
  - server/scripts/migrate-status-unification.js
  - server/scripts/ingest-excel.js
  - public/js/data/constants.js
  - public/js/tabs/downtime-form.js
---

## Intent

**Problem:** Legacy Cruac sub-discipline "Themes" (Creation, Destruction, Protection, Transmutation, Divination) appear on character sheets and as purchasable options in the XP Spend → Discipline dropdown. Themes were retired in code with `Fix.1: Cruac/Theban always out-of-clan; purge SORCERY_THEMES dead code` (`fc5af08`), but the *data* was never migrated. Theme keys persist in characters' `disciplines` maps in MongoDB.

User confirms (live-form review 2026-04-30): master sheets do **not** carry Theme CP — these are pure DB import artefacts from a previous schema. No CP reconciliation required; a straight `$unset` is the right tool.

The XP picker discipline list at `public/js/tabs/downtime-form.js:3380` merges `[...clanDiscs, ...CORE_DISCS, ...owned]` where `owned = Object.keys(c.disciplines)`. After migration, Themes vanish from `owned` automatically — Task #22 resolves with no further code change. A defence-in-depth filter against canonical discipline names is added to prevent future leaks.

The ingest script (`server/scripts/ingest-excel.js:61-62`) still has Theme rows in `DISC_ROWS`. Current master has zeros there so no new Theme writes occur, but the inflow is open — if the master ever gets corrupted again, Theme entries would re-enter the DB. Close the inflow as part of this story.

**Approach:** Three coordinated changes, in order:
1. Migration script: `$unset` the five Theme keys from `disciplines` on every character. Idempotent. User runs it (per `feedback_imports.md`).
2. Close the ingest inflow: remove Theme rows from `DISC_ROWS` in `ingest-excel.js`. The `SORCERY_THEMES` constant at line 425 stays — it's used to skip Theme entries in the powers parser (the comment says "themes are discipline dots", which is the legacy semantics; we want to continue skipping them, just not writing them as disciplines).
3. Defence-in-depth filter: in the XP picker discipline list construction (`downtime-form.js:3380`), filter the merged list against `[...CORE_DISCS, ...RITUAL_DISCS, ...bloodline-specific-discs]`. Survives any future data leak.

## Boundaries & Constraints

**Always:**
- Migration is idempotent — safe to re-run. Standard convention per `migrate-status-unification.js`.
- Migration logs per-character: which Theme keys were removed and the resulting `disciplines` key list. Counts at the end (chars touched, total keys removed).
- Migration uses `MONGODB_URI` from `server/.env` and respects `DB_NAME` env var (default `tm_suite`).
- The `$unset` is on the five exact keys: `disciplines.Creation`, `disciplines.Destruction`, `disciplines.Protection`, `disciplines.Transmutation`, `disciplines.Divination`. No wildcards.
- After migration, the canonical discipline set is `[...CORE_DISCS, ...RITUAL_DISCS]` plus any bloodline-specific discs declared in `BLOODLINE_DISCS` (per `public/js/data/constants.js`). Filter the XP picker list against this.

**Ask First:**
- **Confirm with user before running the migration:** "About to `$unset` Theme keys from N characters. No CP reconciliation per your earlier confirmation. Proceed?" — but only at run-time, after the dry-run output. The story does NOT require pre-approval beyond what's already in the diagnostic conversation.
- **Should the script also clean up `purchasable_powers`?** Theme entries in `purchasable_powers` would have been seeded from `disciplines_db.json` via `seed-purchasable-powers.js` (line 109: `const isRite = entry.ac === 'Ritual' && (entry.d === 'Cruac' || entry.d === 'Theban')`). Themes weren't rituals — they wouldn't have been seeded as rites. They might exist as `category: 'discipline'` entries with `parent: 'Cruac'` and a Theme name. **Default: yes, also clean these up if present** — same migration script can add a second cleanup pass on `purchasable_powers` collection. If not present, the pass is a no-op. Confirm during implementation by running a count first.

**Never:**
- Do not delete the `SORCERY_THEMES` constant at `ingest-excel.js:425`. It's used at line 437 to skip "Blood Sorcery | Theme N" entries in the powers parser (legacy data shape). Keeping it means future re-imports of legacy character data don't write Themes as powers. Comment: "Skip — themes were retired post-Fix.1 (commit fc5af08)."
- Do not touch the render filters at `editor/sheet.js:606-607` or `suite/sheet.js:407`. The data fix removes the need; adding a filter there is duplicative.
- Do not add Theme handling to the rules engine or any other system. Themes are gone — code paths should treat them as nonexistent.
- Do not modify the master Excel workbook or write a script that does. The master is canonical; if it ever has Theme CP, that's a manual error for the user to address.

## I/O & Edge-Case Matrix

| Scenario | Pre-migration | Post-migration | Notes |
|---|---|---|---|
| Character with `disciplines.Divination = { dots: 1, cp: 1 }` | Theme listed in sheet, listed in XP picker | Theme keys absent from disciplines map; not listed anywhere | Most common case |
| Character with all five Theme keys present | Five entries in disciplines map | All five `$unset` | Migration logs 5 keys removed |
| Character with no Theme keys | No change | No change | Idempotent — script reports "0 keys removed" |
| Migration re-run on same DB | Already cleaned | No change | Idempotent — script reports "0 keys removed across all chars" |
| Character has `disciplines.Cruac = { dots: 3 }` AND `disciplines.Divination = { dots: 1 }` | Cruac + Divination both shown | Cruac retained, Divination removed | Only Theme keys are touched |
| Excel ingest re-run after migration with master that has zero Theme CP | No change (current behaviour) | No change (Theme rows removed from DISC_ROWS) | Inflow closed |
| ST manually adds `disciplines.Creation` to a character via Mongo or admin tool | Theme in sheet + XP picker | Filter at XP picker hides it; sheet still shows it | Defence-in-depth filter catches the leak at the XP picker; sheet renderer still iterates `Object.entries` (filter at sheet site is out of scope per Boundaries) |
| Character with `disciplines.Vigour = { dots: 2 }` | Vigour listed | Vigour listed | Vigour is in `CORE_DISCS`, untouched |
| Bloodline-specific discipline (e.g. Coil of the Voivode for Bron) | Listed | Listed | Filter must include bloodline-specific discs per `BLOODLINE_DISCS` lookup |

## Code Map

**New file:**
- `server/scripts/migrate-purge-themes.js` (NEW). Mirror the convention of `server/scripts/migrate-status-unification.js`. Connects to Mongo, finds every character with any of the five Theme keys, `$unset`s them, logs per-character action, prints final counts.

**Modified files:**

`server/scripts/ingest-excel.js:55-63` currently:
```js
const DISC_ROWS = {
  Animalism: 164, Auspex: 165, Celerity: 166, Dominate: 167,
  Majesty: 168, Nightmare: 169, Obfuscate: 170, Protean: 171,
  Resilience: 172, Vigour: 173,
  Cruac: 183, Theban: 184,
  Creation: 186, Destruction: 187, Divination: 188,    // ← REMOVE THESE
  Protection: 189, Transmutation: 190,                  // ← REMOVE THIS
};
```

After:
```js
const DISC_ROWS = {
  Animalism: 164, Auspex: 165, Celerity: 166, Dominate: 167,
  Majesty: 168, Nightmare: 169, Obfuscate: 170, Protean: 171,
  Resilience: 172, Vigour: 173,
  Cruac: 183, Theban: 184,
  // Themes (rows 186-190) intentionally absent — retired post-Fix.1 (fc5af08).
};
```

`server/scripts/ingest-excel.js:425-438` — leave the `SORCERY_THEMES` constant and the parser-skip block intact. Update the comment to reference the retirement:
```js
const SORCERY_THEMES = ['Creation', 'Destruction', 'Divination', 'Protection', 'Transmutation'];
// (kept for the parser-skip below; themes themselves are retired post-Fix.1 (fc5af08))
```

`public/js/tabs/downtime-form.js:3375-3386` currently:
```js
case 'discipline': {
  // Character's current disciplines + all core clan discs they might learn
  const owned = Object.keys(c.disciplines || {});
  const clanDiscs = (c.bloodline && BLOODLINE_DISCS[c.bloodline])
    || (c.clan && CLAN_DISCS[c.clan]) || [];
  const all = [...new Set([...clanDiscs, ...CORE_DISCS, ...owned])].sort();
  return all.map(d => {
    ...
  });
}
```

After:
```js
case 'discipline': {
  // Character's current disciplines + all core clan discs they might learn.
  // Filter against canonical discipline names — defence-in-depth against legacy
  // data leaks (e.g. retired themes; see specs/stories/dtlt.3.*).
  const owned = Object.keys(c.disciplines || {});
  const clanDiscs = (c.bloodline && BLOODLINE_DISCS[c.bloodline])
    || (c.clan && CLAN_DISCS[c.clan]) || [];
  const bloodlineDiscs = (c.bloodline && BLOODLINE_DISCS[c.bloodline]) || [];
  const validDiscs = new Set([...CORE_DISCS, ...RITUAL_DISCS, ...bloodlineDiscs]);
  const all = [...new Set([...clanDiscs, ...CORE_DISCS, ...owned])]
    .filter(d => validDiscs.has(d))
    .sort();
  return all.map(d => {
    ...
  });
}
```

Note: `RITUAL_DISCS` (`['Cruac', 'Theban']`) is exported from `public/js/data/constants.js:121` — confirm it's already imported in `downtime-form.js`. If not, add the import.

**Other readers** (no change needed; data fix removes the symptom):
- `public/js/editor/sheet.js:606-607` — sheet rite drawer reads `Object.entries(c.disciplines)`. After migration, no Theme entries exist; nothing renders.
- `public/js/suite/sheet.js:407` — same.
- `public/js/editor/edit.js:694` — discipline editor; same.
- `public/js/editor/export-character.js:159` — character export; same.
- `public/js/data/loader.js:21` — loader; same.

## Tasks & Acceptance

**Execution:**

- [ ] Migration script — `server/scripts/migrate-purge-themes.js`. Use `migrate-status-unification.js` as the template:
  - Connect via `MONGODB_URI` (env), respect `DB_NAME` (default `tm_suite`).
  - Find: `db.characters.find({ $or: [{'disciplines.Creation': {$exists: true}}, ...one per Theme...]})`.
  - Update each: `$unset: {'disciplines.Creation': '', 'disciplines.Destruction': '', ...}`.
  - Log per-character: `{name}: removed [Creation, Divination] (kept [Cruac, Vigour, Auspex])`.
  - Counts at end: `Touched X / Y characters; total Z keys removed`.
  - **Optional second pass** (per Ask First): query `purchasable_powers` for any docs with `category: 'discipline'` and `name` in the Theme list; report count; ask whether to delete. Default to "ask before deleting" — don't auto-delete.
  - Idempotent: re-run produces "0 keys removed".
  - Dry-run flag: `--dry-run` (default: dry-run; `--apply` to write). Same convention as the rules-seed scripts.
- [ ] Close ingest inflow — Edit `server/scripts/ingest-excel.js:61-62`. Remove the five Theme entries from `DISC_ROWS`. Update the comment near `SORCERY_THEMES` (line 425) to note the retirement and that the constant is kept solely for the parser-skip path.
- [ ] Defence-in-depth filter — Edit `public/js/tabs/downtime-form.js` discipline branch in `getItemsForCategory` (line 3375-3386). Add `RITUAL_DISCS` to the existing import block (line 21 area, where `CORE_DISCS` and `BLOODLINE_DISCS` are imported from `'../data/constants.js'`). Filter the merged list against the canonical set as shown in Code Map.
- [ ] Manual smoke after migration: open a character previously known to have Themes; confirm sheet no longer shows them; confirm XP Spend → Discipline dropdown no longer offers them.

**Acceptance Criteria:**

- Given a character with `disciplines.Divination`, `disciplines.Creation`, and `disciplines.Cruac`, when the migration script runs with `--apply`, then Divination and Creation are removed and Cruac is retained.
- Given a character with no Theme keys, when the migration runs, then no fields change. Script reports "0 keys removed" for that character.
- Given the migration was previously run, when re-run, then it reports "0 keys removed across all characters".
- Given the master Excel has Theme rows with values, when `ingest-excel.js` is next run, then no Theme keys are written to MongoDB (because `DISC_ROWS` no longer includes them).
- Given a character has a "Blood Sorcery | Creation ●" entry in their powers blob (legacy power format), when `ingest-excel.js` parses powers, then that entry is still skipped (the `SORCERY_THEMES` constant + skip path at line 437 is preserved).
- Given the XP Spend → Discipline dropdown renders, when the merged list contains a non-canonical name (e.g. "Divination" leaked in via some unforeseen path), then the dropdown does NOT offer it.
- Given a character with bloodline `Bron`, when the XP picker discipline list renders, then bloodline-specific discs from `BLOODLINE_DISCS['Bron']` are still listed.
- Given a character with no disciplines at all, when the XP picker renders, then the discipline list shows clan disciplines (still subject to the canonical filter).

## Verification

**Commands:**

- `cd server && node scripts/migrate-purge-themes.js` — dry-run; reports affected characters and counts without writing.
- `cd server && node scripts/migrate-purge-themes.js --apply` — applies. User runs (per `feedback_imports.md`).
- `cd server && node scripts/migrate-purge-themes.js` — re-run after apply; should report "0 keys removed".

**Manual checks:**

1. Pick a character previously known to have Themes (per `public/data/chars_v3.json` — line 230-250 has a character with Creation/Divination/Protection). Confirm sheet shows Themes pre-migration.
2. Run migration in dry-run; confirm log lists that character and the keys to be removed.
3. Run migration with `--apply`; confirm log shows the same keys actually removed.
4. Reload the same character's sheet; confirm Themes are gone from the disciplines section.
5. Open XP Spend → Discipline dropdown for that character. Confirm Themes don't appear.
6. Re-run migration. Confirm "0 keys removed".
7. Manually insert a Theme entry into one test character via Mongo (`{$set: {'disciplines.Creation': {dots: 1}}}` on a sandbox char). Reload the XP picker. Confirm the canonical-name filter hides it (defence-in-depth). Remove the test entry afterwards.
8. Spot-check that `disciplines.Cruac`, `disciplines.Theban`, and bloodline-specific discs (e.g. for a Bron character) all still render and are still purchasable.

## Final consequence

Themes are gone from the live data. The XP Spend picker filter prevents any future leak. The Excel ingest path no longer writes Theme keys. Three downstream tasks are unblocked or auto-resolved:

- **Task #22** (Themes purchasable in XP Spend) — resolved by the data fix; defence-in-depth filter is the belt-and-braces.
- **Task #17** (Themes appearing in Disciplines section) — resolved by the data fix; render-time filter at sheet sites was considered and rejected per Boundaries (data fix is sufficient).
- **DTLT-4** (Effective rating + cap sweep) — runs against clean data; the discipline branch of the XP picker won't need to special-case Themes during the cap sweep.

Five fewer code paths reading legacy Theme data. The retirement that started in commit `fc5af08` is finally complete.
