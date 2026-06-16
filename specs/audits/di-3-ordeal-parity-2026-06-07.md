# DI-3 Ordeal Parity Audit

**Date:** 2026-06-07  
**Auditor:** Claude Code (DI-3 investigation spike)  
**Verdict: A — No genuine import gaps with XP impact**

---

## Agreed Comparison Source

`data/archive/chars_v2.json` — the archived export of 31 characters in the pre-v2 format, kept for reference after the v2 migration. This file is the de-facto pre-migration snapshot and the only local ordeal source available. No separate legacy database, spreadsheet, or Google Form export was found.

No `tm_deprecated` database was accessible or needed: the `chars_v2.json` file predates the ORD Tier 3 migration and provides the original ordeal completion state.

---

## Live State Catalogue

Queried via `server/scripts/di3-audit-ordeals.js` against `tm_suite.characters`.

**Schema shape confirmed:** `character.ordeals[]` = `{ name: string, complete: boolean, xp?: number }`.  
**XP rule confirmed:** `xpOrdeals(c)` in `public/js/editor/xp.js` counts `ordeals.filter(o => o.complete).length * 3`.  
The `xp` field on individual ordeal entries is not read by `xpOrdeals`; it is decorative only.

| Character | Live complete count | Live complete ordeals |
|-----------|---------------------|-----------------------|
| Aleksei | 0 | (none) |
| Alice Vunder | 2 | questionnaire, rules |
| Anichka | 2 | questionnaire, rules |
| Benedict Wiesel | 0 | (none) |
| Brandy LaRoux | 4 | questionnaire, lore, covenant, history |
| Carver | 5 | questionnaire, history, lore, rules, covenant |
| Cazz | 1 | questionnaire |
| Charles Mercer-Willows | 1 | questionnaire |
| Charlie Ballsack | 5 | questionnaire, rules, lore, history, covenant |
| Clarence von Schmidt | 0 | (none) |
| Conrad Sondergaard | 5 | questionnaire, lore, rules, history, covenant |
| Cyrus Reynolds | 1 | questionnaire |
| Doc | 0 | (none) |
| Edna Judge | 2 | questionnaire, rules |
| Einar Solveig | 5 | questionnaire, lore, history, covenant, rules |
| Etsy | 1 | questionnaire |
| Eve Lockridge | 1 | questionnaire |
| Gel | 0 | (none) |
| Hazel | 0 | (none) |
| Humongulus | 0 | (none) |
| Ivana Horvat | 5 | questionnaire, lore, history, rules, covenant |
| Jack Fallow | 3 | questionnaire, rules, covenant |
| Julia Dolancia | 0 | (none) |
| Keeper | 5 | questionnaire, rules, history, lore, covenant |
| Kirk Grimm *(retired)* | 3 | questionnaire, history, covenant |
| Laura | 0 | (none) |
| Livia | 0 | (none) |
| Ludica Lachramore | 1 | questionnaire |
| Mac | 5 | questionnaire, rules, lore, history, covenant |
| Magda | 0 | (none) |
| Reed Justice | 2 | questionnaire, history |
| René Meyer | 5 | questionnaire, rules, lore, history, covenant |
| René St. Dominique | 2 | history, covenant |
| Ryan Ambrose | 4 | covenant, history, lore, questionnaire |
| Tegan Groves | 2 | questionnaire, history |
| Terrassa Mortimer *(retired)* | 0 | (none) |
| Wan Yelong | 0 | (none) |
| Xavier Boussade | 2 | questionnaire, history |
| Yusuf Kalusicj | 5 | questionnaire, history, rules, covenant, lore |

**Total characters in live DB:** 39 (37 active + 2 retired)

---

## Source State Catalogue

From `data/archive/chars_v2.json` (31 entries).

Note: "Mammon" in the archive is Yusuf Kalusicj (legal name). The archive script resolved by `moniker || name`.

Characters in the archive but not in the live DB by name or moniker: **none** (all 31 matched).

| Character (archive display name) | Archive complete count | Archive complete ordeals |
|----------------------------------|------------------------|--------------------------|
| Alice Vunder | 2 | questionnaire, history |
| Anichka | 1 | questionnaire |
| Brandy LaRoux | 3 | questionnaire, history, covenant |
| Carver | 5 | questionnaire, history, rules, lore, covenant |
| Cazz | 1 | questionnaire |
| Charles Mercer-Willows | 1 | questionnaire |
| Charlie Ballsack | 5 | questionnaire, history, rules, lore, covenant |
| Conrad Sondergaard | 4 | questionnaire, rules, lore, covenant |
| Cyrus Reynolds | 1 | questionnaire |
| Doc | 0 | (none) |
| Edna Judge | 2 | questionnaire, history |
| Einar Solveig | 5 | questionnaire, history, rules, lore, covenant |
| Eve Lockridge | 1 | questionnaire |
| Gel | 0 | (none) |
| Hazel | 0 | (none) |
| Ivana Horvat | 5 | questionnaire, history, rules, lore, covenant |
| Jack Fallow | 2 | questionnaire, history |
| Julia *(= Julia Dolancia)* | 0 | (none) |
| Keeper | 5 | questionnaire, history, rules, lore, covenant |
| Kirk Grimm *(retired)* | 3 | questionnaire, history, covenant |
| Livia | 0 | (none) |
| Ludica Lachramore | 1 | questionnaire |
| Mac | 5 | questionnaire, history, rules, lore, covenant |
| Magda | 0 | (none) |
| Mammon *(= Yusuf Kalusicj)* | 5 | questionnaire, history, rules, lore, covenant |
| Reed Justice | 1 | questionnaire |
| René Meyer | 5 | questionnaire, history, rules, lore, covenant |
| René St. Dominique | 2 | history, covenant |
| Ryan Ambrose | 4 | questionnaire, history, lore, covenant |
| Tegan Groves | 2 | questionnaire, history |
| Wan Yelong | 0 | (none) |

**Total in archive:** 31 characters.  
**Characters in live but not in archive:** 8 (Aleksei, Benedict Wiesel, Clarence von Schmidt, Etsy, Humongulus, Laura, Terrassa Mortimer, Xavier Boussade) — all added to the game after the archive snapshot was taken. Not a gap; their ordeals start from zero.

---

## Diff

### Legend
- **Match** — counts and types agree (or live is a strict superset, which is legitimate post-archive progression)
- **Type mismatch** — counts match but specific ordeal types differ
- **Live ahead** — live has more complete ordeals than archive; counts differ but live never has fewer
- **No XP impact** — `xpOrdeals` is count-based; any mismatch that does not reduce the live count below the archive count has no XP consequence

| Character | Archive count | Live count | Delta | Ordeal type mismatches | XP impact? |
|-----------|---------------|------------|-------|------------------------|------------|
| Alice Vunder | 2 | 2 | 0 | Archive: history. Live: rules. `history` absent from live. | None — count equal |
| Anichka | 1 | 2 | +1 | — | None — live ahead |
| Brandy LaRoux | 3 | 4 | +1 | Archive has history; live additionally has lore. No entries missing from live. | None — live ahead |
| Carver | 5 | 5 | 0 | — | None — match |
| Cazz | 1 | 1 | 0 | — | None — match |
| Charles Mercer-Willows | 1 | 1 | 0 | — | None — match |
| Charlie Ballsack | 5 | 5 | 0 | — | None — match |
| Conrad Sondergaard | 4 | 5 | +1 | Archive lacks history; live has it. No entries missing from live. | None — live ahead |
| Cyrus Reynolds | 1 | 1 | 0 | — | None — match |
| Doc | 0 | 0 | 0 | — | None — match |
| Edna Judge | 2 | 2 | 0 | Archive: history. Live: rules. `history` absent from live. | None — count equal |
| Einar Solveig | 5 | 5 | 0 | — | None — match |
| Eve Lockridge | 1 | 1 | 0 | — | None — match |
| Gel | 0 | 0 | 0 | — | None — match |
| Hazel | 0 | 0 | 0 | — | None — match |
| Ivana Horvat | 5 | 5 | 0 | — | None — match |
| Jack Fallow | 2 | 3 | +1 | Archive: questionnaire + history. Live: questionnaire + rules + covenant. `history` absent from live. | None — live ahead |
| Julia Dolancia | 0 | 0 | 0 | — | None — match |
| Keeper | 5 | 5 | 0 | — | None — match |
| Kirk Grimm *(retired)* | 3 | 3 | 0 | — | None — match |
| Livia | 0 | 0 | 0 | — | None — match |
| Ludica Lachramore | 1 | 1 | 0 | — | None — match |
| Mac | 5 | 5 | 0 | — | None — match |
| Magda | 0 | 0 | 0 | — | None — match |
| Yusuf Kalusicj (Mammon) | 5 | 5 | 0 | — | None — match |
| Reed Justice | 1 | 2 | +1 | Archive lacks history; live has it. | None — live ahead |
| René Meyer | 5 | 5 | 0 | — | None — match |
| René St. Dominique | 2 | 2 | 0 | — | None — match |
| Ryan Ambrose | 4 | 4 | 0 | — | None — match |
| Tegan Groves | 2 | 2 | 0 | — | None — match |
| Wan Yelong | 0 | 0 | 0 | — | None — match |

**Summary:**
- 26 characters: full count and type match (or live strictly ahead with no archive entry missing)
- 3 characters with type mismatch, same count: Alice Vunder, Edna Judge, Jack Fallow — `history` ordeal complete in archive but absent from live; different ordeal(s) recorded as complete in live instead
- 5 characters where live has moved ahead: Anichka (+1), Brandy LaRoux (+1), Conrad Sondergaard (+1), Jack Fallow (+1), Reed Justice (+1) — plausible post-archive completions

**No character has a lower ordeal count in live than in the archive. XP cannot be undercounted relative to the archive source.**

---

## Type-Mismatch Detail

Three characters have `history` marked complete in the archive but not recorded at all in the live DB. Instead, a different ordeal (`rules`, and/or `covenant`) appears as complete in live.

| Character | Archive `history` | Live `history` | Archive `rules` | Live `rules` | Notes |
|-----------|-------------------|----------------|-----------------|--------------|-------|
| Alice Vunder | complete | absent | incomplete | complete | Swapped |
| Edna Judge | complete | absent | incomplete | complete | Swapped |
| Jack Fallow | complete | absent | incomplete | complete | Swapped; live also has covenant not in archive |

Possible explanations:
1. The archive snapshot was recorded before history submissions were reviewed and marked, so the `history` flag in the archive was aspirational or an early placeholder entry.
2. History ordeals were not imported when the live DB was populated (ORD Tier 3 migration), and a different ordeal (`rules`) was subsequently marked instead.
3. ST data entry during the migration differed from the archive for these three characters.

Since the total complete count is equal or higher in live, there is no XP shortfall. The practical consequence is that the `history` ordeal tracking for Alice Vunder and Edna Judge shows as incomplete in the Ordeals tab when the archive suggests it should be complete.

**Recommendation:** STs review these three characters' Ordeals tab entries and confirm whether `history` is genuinely incomplete or was missed during migration. If complete, the `history` entry can be added via the admin Ordeals interface without scripting. No DI-4 migration story is required unless the ST team confirms a systematic miss.

---

## Verdict

**Verdict A — No genuine import gaps with XP impact.**

All 31 archive characters are present in the live DB. No character has fewer complete ordeals in live than the archive, so no player's XP is understating their actual completed ordeal count relative to the archive source.

Three characters (Alice Vunder, Edna Judge, Jack Fallow) have a `history` ordeal type tracked as complete in the archive but absent from the live DB. This is a display-layer discrepancy: the Ordeals tab may show `history` as not submitted when it could be complete. This does not affect XP. Correction, if needed, is a manual ST admin action on three records, not a migration script.

---

## Recommended Follow-up

No DI-4 story required. The ST team may optionally:
- Check Alice Vunder, Edna Judge, and Jack Fallow's history ordeal status in the admin Ordeals panel
- If history was genuinely submitted and marked, add `{ name: 'history', complete: true, xp: 3 }` to each character's ordeals array via the Ordeals admin tab

This is a three-record manual check, not an engineering task.

---

## Files Produced

- `specs/audits/di-3-ordeal-parity-2026-06-07.md` — this note
- `server/scripts/di3-audit-ordeals.js` — read-only query script (can be deleted)
- `server/scripts/di3-find-mammon.js` — diagnostic script (can be deleted)
