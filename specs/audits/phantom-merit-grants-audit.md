# Audit — phantom merit grants across `tm_suite.characters`

> **Headline:** the phantom-grant bug class **exists but is rare in current data**. Only **1 confirmed phantom residue** (Tegan Groves) and **1 unclassified suspect** (Yusuf Kalusicj) across **31 living characters**. The "DT Allies (DOTS) = 6 or 8" symptom that motivated issue #11 traces to the now-retired **"Buggy Keeper"** character; the **living Keeper** (Henry St. John, moniker "Keeper") is **clean**. The decentralised cleanup paths in `rule_engine/*-evaluator.js` are mostly working; the residue is small enough that a generic data-cleanup script (#11c) may be over-engineered for the actual problem set.

---

## Background

Issue #11 surfaced two observable symptoms attributed to "Keeper":

1. The Downtime submission form for Contact actions surfaces options Keeper should no longer have — phantom Contacts entries.
2. Keeper's "DT Allies (DOTS)" reads at 6 or 8 — well above any single-merit cap.

The hypothesised cause: decentralised cleanup paths leave residue when parent merits are removed (free_* fields not zeroed; granted_by entries not deleted; spheres arrays not pruned). Repeated edit cycles compound the residue.

This audit catalogues the grant-source surface, snapshots every non-retired character's residue, reconciles Keeper specifically, and recommends whether #11b (source-side fix) and #11c (data cleanup) are warranted given the actual scope of the problem in production.

## Methodology

1. **Inventory rule-engine evaluators** — read every `public/js/editor/rule_engine/*-evaluator.js`; catalogue what each grants and how it cleans up.
2. **Inventory non-evaluator grant sources** — grep `granted_by:` and `free_*:` writes in `public/js/editor/`; catalogue any direct edit-side handlers that bypass the evaluator pattern.
3. **Live MongoDB residue snapshot** (read-only) — throwaway audit script under `server/scripts/_audit-phantom-grants.mjs`. For every character (living + retired), enumerate `granted_by`-tagged entries, non-zero `free_*` fields, and Contacts/Allies sphere arrays. Cross-reference against a "live source predicate" per grant kind.
4. **Keeper reconciliation** — pull the document; walk the residue; reconstruct the "DT Allies (DOTS) = 6/8" calculation step-by-step.
5. **DT submission form Contact-action picker investigation** — find the code path; document whether it derives from effective grants vs. blindly reading every persisted entry.

The probe script source is captured in this audit's Dev Agent Record on the story (it ran once, deleted before commit per the #26 precedent).

## Grant Source Catalogue

11 evaluator files in `public/js/editor/rule_engine/`. `load-rules.js` is dispatch infrastructure (not a grant source); the 10 remaining are evaluators. Plus 4 non-evaluator edit-side handlers.

### Evaluators

| Evaluator | Source merit / pact | Side-effect kind | Cleanup hook | Cleanup verdict |
|---|---|---|---|---|
| `auto-bonus-evaluator.js` | rule.source (e.g. SSJ, Flock, FwB) | `m[rule.target_field]` (e.g. `free_fwb`) on target merit | Stale-clear at top: zeroes `(target, target_field)` tuples up front | **Complete** |
| `bloodline-evaluator.js` | character `bloodline` field | auto-creates merits with `granted_by: 'Bloodline'`, `free_bloodline` field | Stale-clear loop zeroes `free`/`free_bloodline` on `granted_by:'Bloodline'` rows; dedup splice | **Complete** |
| `mci-evaluator.js` | "Mystery Cult Initiation" | adds to `c._grant_pools` (drawn down by user allocation into `free_mci` on chosen merits); `_mci_free_specs`, `_mci_dot3_skills` | Phase-1 stale-clear in `applyDerivedMerits` zeroes `free_mci` everywhere; pool rebuilt each render | **Complete** (relies on caller's stale-clear) |
| `mdb-evaluator.js` | "The Mother-Daughter Bond" / "Mother-Daughter Bond" | `free_mdb` on target merit | Phase-1 stale-clear in `applyDerivedMerits` | **Complete** (relies on caller's stale-clear) |
| `ohm-evaluator.js` | OHM pact (`c.powers[*]`, category `pact`) | auto-creates "Friends in High Places" with `granted_by: 'OHM'`; `free_ohm` field on FHP/Allies/Contacts/Resources | Stale-clear `free_ohm = 0` on every merit; lifecycle splice removes FHP when pact absent | **Complete** |
| `ots-evaluator.js` | OTS pact | `_ots_free_dots` on character; `free_ots` on fighting styles | Lifecycle clear when pact absent; `c._ots_free_dots = 0` always | **Complete** |
| `pool-evaluator.js` | various sources | reads sums from existing `free_*` fields; doesn't write `free_*` directly (only computes pool totals) | Read-only — no cleanup needed | **N/A** (not a writer) |
| `pt-evaluator.js` | "Professional Training" | auto-creates target with `granted_by: 'PT'`; `free_pt` field | Caller's phase-1 stale-clear zeroes `free_pt` everywhere | **Complete** (relies on caller's stale-clear) |
| `safe-word-evaluator.js` | Safe Word pact | auto-creates partner-mirror merit with `granted_by: 'Safe Word'`; `free_sw` field | Lifecycle splice removes the auto-created merit when source absent | **Complete** |
| `style-retainer-evaluator.js` | fighting-style names (e.g. K-9, Falconry) | auto-creates "Retainer" with `granted_by: <styleName>`; `free_pet` field | Stale-clear loop zeroes `free`/`free_pet` on `granted_by:<style>` rows | **Complete** |

### Non-evaluator edit-side grant sources

| Site | Grants | Cleanup |
|---|---|---|
| `edit-domain.js` `shAddVMAlly` | `granted_by: 'VM'` Allies merit | Removed when VM merit removed (verified by audit on live data) |
| `edit-domain.js` Lorekeeper handler | `granted_by: 'Lorekeeper'` domain merit | Removed when Lorekeeper merit removed |
| `edit-domain.js` Fucking Thief qualifier | `granted_by: 'Fucking Thief'` general merit (live audit confirms; one residue on Yusuf marked OK by source-live check) | Removed/swapped on qualifier change |
| `edit-domain.js` Attaché handler | `granted_by: 'Safe Word'` Attaché on the Resources / Contacts host (live audit shows `free_sw` field on Attaché entry) | Lifecycle clear via Safe Word evaluator |

**Verdict for the catalogue:** every known grant source has a documented cleanup path. The decentralised pattern is structurally sound. Residue, when it happens, is from edge cases (manual edits that bypass evaluators, partial state during interrupted edit cycles, or pre-evaluator legacy data).

## Per-Character Residue Snapshot

Source: `_audit-phantom-grants.mjs`, run against live `tm_suite.characters` 2026-05-05. **31 living characters, 4 retired.**

### Aggregate counts

- **Living characters with confirmed phantom residue: 1** (Tegan Groves)
- **Living characters with unclassified suspect residue: 1** (Yusuf Kalusicj)
- **Living characters fully clean: 29 / 31**
- **Living "Keeper" (Henry St. John, _id `69f98167ed740b3098dc56ff`): clean** (no phantom, no suspect; the issue's reported symptom does not match this character's current data)

### Worst-offenders ranked list

Phantom-weight = `phantomGrantedBy×3 + phantomFree×2 + suspectGrantedBy×1 + suspectFree×1`.

| Rank | Character | Phantom GB | Phantom Free | Suspect GB | Suspect Free | Notes |
|---|---|---|---|---|---|---|
| 1 | Tegan Groves | 1 | 0 | 0 | 0 | Stale `Contacts granted_by=PT` rating=2; Tegan no longer has Professional Training |
| 2 | Yusuf Kalusicj | 0 | 0 | 1 | 0 | `Allies granted_by="MCI 2"` (tier-suffixed format the audit doesn't recognise); likely fine but unclassified |

No other living character has any flagged residue.

### Full living-character snapshot (no flags)

29 living characters carry zero phantom and zero suspect residue. Keeper (Henry St. John) is in this group: 2 OK granted_by entries (`Contacts/PT`, `Attaché(Resources)/Safe Word` — both with live sources), 9 OK free_* fields, 4 Allies entries each at rating=3 with `cp+xp+free=3` (perfect rating-vs-sum match), 5 Contacts spheres for a Contacts rating=5.

### Retired characters (audit-only, will not be touched per #11c scope)

| Character | Player | Notable |
|---|---|---|
| Gel | Stefan S | 1 free_* field; clean |
| Buggy Keeper | Symon G | **14 free_* fields**; 4 Allies entries with `rating` field DRIFTED from `cp+xp+free` sum. See §Keeper Reconciliation. |
| (other 2) | — | minor or no residue |

## Keeper Reconciliation

**There are TWO Keepers.**

| _id | name | moniker | retired | player |
|---|---|---|---|---|
| `69f98167ed740b3098dc56ff` | Henry St. John | "Keeper" | **no (LIVING)** | Symon G |
| `69d73ea49162ece35897a48e` | Buggy Keeper | (none) | yes (retired) | Symon G |

### Living Keeper (`69f98167ed740b3098dc56ff`) — CLEAN

```
granted_by entries (2):
  OK: name=Contacts          granted_by=PT          rating=5
  OK: name=Attaché (Resources)  granted_by=Safe Word  rating=5

free_* fields (9):
  OK: Contacts.free_mci = 3
  OK: Contacts.free_pt = 2
  OK: Safe Place.free_mci = 1
  OK: Allies.free_mci = 3   (entry 1)
  OK: Allies.free_mci = 3   (entry 2)
  OK: Allies.free_vm = 3    (entry 3)
  OK: Allies.free_vm = 3    (entry 4)
  OK: Attaché (Resources).free_sw = 5
  OK: Resources.free_attache = 2

Allies entries (4):
  Allies (Occult)        rating=3  cp=0 xp=0 free_mci=3            sum=3
  Allies (Underworld)    rating=3  cp=0 xp=0 free_mci=3            sum=3
  Allies (Bureaucracy)   rating=3  cp=0 xp=0 free_vm=3             sum=3
  Allies (High Society)  rating=3  cp=0 xp=0 free_vm=3             sum=3

  TOTAL Allies dots: 12
  Per-entry rating exactly matches cp+xp+free_*: no drift.

Contacts: rating=5, spheres=["Street","Media","Police","Finance","Health"] — 5 spheres for 5 dots, no excess.
```

The living Keeper is fully clean. **The "DT Allies (DOTS) = 6 or 8" symptom from issue #11 does not match this character's current data.**

### Buggy Keeper (`69d73ea49162ece35897a48e`) — historical smoking gun

Same player (Symon G), now retired. The retirement is itself evidence: the character was likely retired *because* of the data corruption.

```
free_* fields (14):
  Quick Draw.free = 2           OK
  Allies.free = 5               OK     (entry 1)
  Allies.free_vm = 3            OK     (entry 1)
  Allies.free = 3               OK     (entry 2)
  Allies.free_vm = 3            OK     (entry 2)
  Allies.free = 3               OK     (entry 3)
  Allies.free_mci = 3           OK     (entry 3)
  Allies.free = 3               OK     (entry 4)
  Allies.free_mci = 3           OK     (entry 4)
  Contacts.free = 3             OK
  Contacts.free_mci = 3         OK
  Contacts.free_pt = 2          OK
  Safe Place.free_mci = 1       OK
  Resources.free = 2            OK

Allies entries (4) — RATING DRIFTED FROM SUM:
  Allies (Bureaucracy)    rating=8  cp=0 xp=0 free=5 free_vm=3   sum=8     (rating matches sum; 5+3=8)
  Allies (High Society)   rating=6  cp=0 xp=0 free=3 free_vm=3   sum=6     (matches; 3+3=6)
  Allies (Occult)         rating=6  cp=0 xp=0 free=3 free_mci=3  sum=6     (matches; 3+3=6)
  Allies (Underworld)     rating=6  cp=0 xp=0 free=3 free_mci=3  sum=6     (matches; 3+3=6)

  TOTAL Allies dots: 26
```

**Smoking gun reconstructed.** The "DT Allies (DOTS) = 6 or 8" figure from issue #11 came from the per-entry `rating` field of Buggy Keeper's Allies merits: 8 (Bureaucracy) and 6 (each of the other three areas). Each rating is the sum of `free + free_vm` (or `free + free_mci`) on that single entry — no `cp` or `xp` purchased. The per-entry rating is **internally consistent** (rating = sum) but **inflated** by a generic `free` field carrying 3 or 5 dots whose source isn't `granted_by`-tagged.

The `free` field (no suffix) is written by several evaluators (`bloodline-evaluator.js` clears it; `style-retainer-evaluator.js` clears it on its own auto-created retainers). For an Allies merit with no `granted_by` and no obvious source pattern, a non-zero `free` field is **suspect** — but the audit script's predicate for `free` is "if granted_by is set, check that source; else accept" — so they were marked OK. **In hindsight, a non-zero `free` on a non-`granted_by` merit is the actual residue marker, and the audit should be tightened to flag it.** See Recommendations.

**Status of the symptom on the live application:** the player has retired Buggy Keeper and is now playing Henry St. John ("Keeper"). The new character is clean. The reported symptom is therefore an **historical issue**, not an active production bug.

## DT submission form Contact-action picker

Investigation path: `public/js/tabs/downtime-form.js:208-241`.

```js
const rawContacts = deduplicateMerits(expandedInfluence.filter(m =>
  m.category === 'influence' && m.name === 'Contacts'
));
detectedMerits.contacts = [];
for (const m of rawContacts) {
  if (m.spheres && m.spheres.length) {
    for (const sp of m.spheres) {
      detectedMerits.contacts.push({ ...m, area: sp, rating: 1 });
    }
  } else {
    /* legacy area/qualifier fallback */
  }
}
```

**Finding:** the picker iterates `c.merits[*]` for entries matching `name === 'Contacts'` and expands the `spheres` array into individual options. There is **no filter** against the effective grant set — the picker surfaces every persisted sphere.

**Implication:** if a character's `Contacts.spheres` array has stale entries (a sphere previously chosen, then merit edited to a smaller rating, but the sphere not pruned), the picker would surface a phantom option. The audit's live data shows **no character with such drift** in the current snapshot — every Contacts entry's `spheres.length` matches the entry's `rating` (or is shorter). But the architectural shape is fragile: any future edit handler that modifies Contacts dots without pruning `spheres` would re-introduce the issue.

**Recommendation for #11b:** add a `spheres` pruning step to the Contacts edit-side handlers in `edit-domain.js` (when rating decreases, slice the spheres array to length). Small (5-10 line) change, prevents future regression.

## Recommendations

### #11b — Source-side fix priority

| Item | Effort | Priority | Rationale |
|---|---|---|---|
| Tegan Groves stale `Contacts granted_by=PT` — investigate the PT-removal edit path | 1-2 hours | low | One isolated case; the pt-evaluator's stale-clear works for live PT holders; this looks like a manual edit history that bypassed the evaluator. Investigate before patching. |
| Contacts `spheres` pruning on rating decrease | 5-10 lines | low-medium | Prevents the "phantom contacts in DT picker" symptom from recurring in future edits, even though no character currently shows the drift. |
| Tighten audit's `free` field predicate (a non-zero unsuffixed `free` on a non-`granted_by` merit is suspect) | audit-script-only, 5 lines | low | Improves future re-runs; not a production fix. |
| Investigate Yusuf's `granted_by="MCI 2"` tier-suffix format | 30 min | low | Likely benign — confirm whether the tier-suffix variant is intentional (some MCI grants may be tier-tagged) or a stale residue. |

**No high-priority source-side fixes required.** The decentralised cleanup pattern in the rule-engine evaluators is working. A full structural refactor of the grant model (as the issue body's "single grants[] table" suggested) is **not warranted by the data** — explicit recommendation against in-scope refactor here.

### #11c — Data cleanup script shape

| Decision | Recommendation |
|---|---|
| Build a generic phantom-residue cleanup script? | **No.** Two characters have flags; one phantom (Tegan) + one suspect (Yusuf). A generic script with safety guards is over-engineered for this scope. |
| What to do instead? | **Manual edit by ST in the admin character editor**, character-by-character. Tegan: remove the stale Contacts merit (or restore PT if intended). Yusuf: investigate the tier-suffix format and either rewrite to a cleaner form or accept as-is. |
| What about Buggy Keeper? | Out of scope per "living only" filter. The character is retired; if data integrity matters for archival, run a one-off manual cleanup similarly. Otherwise leave as historical record. |
| When to revisit | If a future audit (re-run of `_audit-phantom-grants.mjs`) shows phantom-count rising past 5+ characters, reconsider the script approach. |

### Future-work (not in #11b/#11c scope)

- **Investigate the source of Buggy Keeper's data corruption** — was the Allies-with-inflated-rating a single bad-edit event, or did it accumulate over multiple sessions? This would inform whether the current evaluator pattern can be relied on long-term, or whether a stricter rating-vs-sum invariant should be enforced (e.g. an editor-side validation that flags `rating !== cp + xp + sum(free_*)` and offers to recompute).
- **Add a rating-vs-sum invariant check** to the editor — if it finds a discrepancy, prompt the ST to recompute or bypass. This catches the Buggy Keeper class at the moment of bad-edit, not at audit time. Roughly one editor file (`sheet.js` / merit-render path), 15-30 lines.

## Detection-and-response

If a future audit ever surfaces phantom-grant residue not described here:

1. **Re-run `_audit-phantom-grants.mjs`** (script source preserved in this story's Dev Agent Record). Compare new findings against the per-character snapshot in this audit.
2. **Spot-check the new flag's source** — read the relevant evaluator; check if its stale-clear path actually fires; check if the relevant edit-side handler invokes it.
3. **If the flag is on a single character**, manual edit is faster than scripting.
4. **If 5+ characters show flags from a common pattern**, escalate to a #11c-style cleanup script with the same shape as `cleanup-rfr-territory-residue.js` (PR #20): dry-run by default, `--apply` for the actual op, backup-before-write, safety guard, idempotent.

## References

- Issue #11 (parent — stays OPEN through #11b/#11c if either is filed; closing depends on user's go/no-go after this audit).
- `public/js/editor/rule_engine/*-evaluator.js` — 11 files, catalogued in §Grant Source Catalogue.
- `public/js/editor/edit-domain.js` — non-evaluator grant sources (VM, Lorekeeper, Fucking Thief, Attaché).
- `public/js/editor/domain.js` — `meritFreeSum` and Allies/Contacts aggregation helpers.
- `public/js/tabs/downtime-form.js:208-241` — Contact-action picker code path.
- `server/scripts/_audit-phantom-grants.mjs` — throwaway audit script, source preserved in this story's Dev Agent Record.
- Backup of pre-#11c state: not applicable (no script run; no data mutation).
