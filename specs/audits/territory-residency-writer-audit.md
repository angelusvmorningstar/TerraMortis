# Audit — `territory_residency` writer identification

> **Conclusion: A — no active writer.** The historical writer existed in `public/js/player/regency-tab.js` from commit `b168535` (2026-04-02) until commit `5128e43` / Fix.39 (2026-04-11), which moved feeding-rights data to `territories.feeding_rights` as the canonical store. Four documents were left behind by regents who used the feature during that nine-day window. The collection has since been retired entirely (commit `fd5dee1`, 2026-05-05), so there is no surface left to write against.

---

## Background

ADR-002 (territory FK refactor, 2026-05-05) reported `territory_residency.count = 0` in its §Live-data baseline. Story #3c's pre-flight probe (also 2026-05-05, hours later) found **4 documents** dated `2026-04-04T05:24:24Z` (Academy 3 residents, Harbour 7, Second City 4, North Shore 6). Maat's #3c QA confirmed the docs as pre-existing data, not post-ADR writes. ADR Q5 user decision (MIGRATE / parked-but-revivable) preserved the collection through #3b/#3c; the surface remained.

That left an unresolved question: **who wrote those four documents?** This audit answers it.

A direct second path closed the question even more cleanly between #3c and the audit start: commit `fd5dee1` (2026-05-05 17:21) retired the collection entirely after the same 4-doc surprise prompted a deeper look at the data. The retirement decision and the audit were running in parallel; this document captures the audit findings in their own right.

## Methodology

Five passes, each verifiable by re-running the cited query.

### 1. Server write-path grep

```
grep -rn "getCollection('territory_residency')" server/
grep -rn "territory_residency" server/routes/
grep -rn "territory_residency" server/middleware/
grep -rn "territory_residency" server/scripts/
```

**Result:** zero matches in `server/routes/` and `server/middleware/`. Three matches in `server/scripts/` — all in the new `migrate-territory-fk.js`, `retire-territory-residency.js`, or audit-trail commentary in `cleanup-territory-id-dupes.js`. The route file `server/routes/territory-residency.js` no longer exists in the working tree (deleted by `fd5dee1`).

### 2. Client write-path grep

```
grep -rn "/api/territory-residency" public/js/
grep -rn "territory_residency" public/js/
grep -rEn "apiPut.*territory-residency|apiPost.*territory-residency|apiPatch.*territory-residency" public/js/
```

**Result:** zero matches across all three patterns. The dead `apiGet` consumer at the previous `downtime-form.js:1311-1317` was removed as part of the `fd5dee1` retirement. No client code references the API.

### 3. Git log archaeology

```
git log --all -S "territory_residency" --oneline
git log --all -S "territory-residency" --oneline
git log --all --before=2026-04-15 --after=2026-03-25 --oneline
```

The `-S` searches surface 21 commits across both naming variants. Three commits explain the lifecycle:

| Commit | Date | Action |
|---|---|---|
| `b168535` | 2026-04-02 | **Writer introduced.** "Separate regency, feeding, influence from downtime into own tabs". Player Regency tab shipped with a 10-slot residency grid that saved to `PUT /api/territory-residency`. |
| `5128e43` | 2026-04-11 | **Writer removed (Fix.39).** "Feeding rights — single source of truth on territories collection". Player Regency tab now reads from `territories.feeding_rights`. The `apiGet`/`apiPut('/api/territory-residency')` calls were deleted from `regency-tab.js`. |
| `7ca403c` | 2026-04-20 | Cleanup followup. "remove dead residency grid code" — dead-code removal of the now-unused render functions from the player downtime form. |
| `fd5dee1` | 2026-05-05 | **Collection retired.** Backup-then-drop script, route file deleted, schema deleted, dead `apiGet` consumer in `downtime-form.js:1311-1317` removed. |

The 4 documents fall **between `b168535` (2026-04-02) and `5128e43` (2026-04-11)**, all dated `2026-04-04T05:24:24Z`. The single-second timestamp suggests four near-simultaneous writes — most plausibly one game session in early April where four regents (Academy / Harbour / Second City / North Shore — exactly the four with regent_id) saved residency assignments via the Regency tab.

### 4. Server scripts archaeology

```
grep -rn "territory_residency" server/scripts/
```

**Result:** three files reference the collection; all are post-#3c artefacts (the migration script, the retirement script, and an audit comment in `cleanup-territory-id-dupes.js`). No historical one-shot import script that would have created the 4 docs. The hypothesis that the writes were "a one-shot import script" (per the story) is **disproved**: the writes came from interactive regent-tab use, not an offline import.

### 5. Live MongoDB probe (read-only, 2026-05-05)

A throwaway probe script (`server/scripts/_probe-residency-writer.mjs`, deleted before commit) connected to `tm_suite` and ran:

```js
db.listCollections({ name: 'territory_residency' }).toArray()
```

**Result:** the collection no longer exists. Output:

```
=== territory_residency collection state ===
  exists: false
  (collection dropped — confirmed retired)
```

The full `db.listCollections()` output confirms 27 collections, none named `territory_residency` or any variant. The retirement of `fd5dee1` is reflected in production state.

## Findings

1. **The historical writer was `public/js/player/regency-tab.js`**, introduced in `b168535` on 2026-04-02. It called `apiPut('/api/territory-residency', { territory: <name>, residents: [...] })` when a regent saved their residency grid.

2. **The writer was removed in commit `5128e43` (Fix.39)** on 2026-04-11. From that commit onward, no code path wrote to the collection. The 4 documents that ADR-002 missed and #3c surfaced were left behind from the nine-day window of active use.

3. **The hypothesis ("one-shot import script") is disproved.** The writes were interactive (4 regents using the live tab), not a batch import. The single-second timestamp coincidence is consistent with one game-session evening where regents took action together (or one regent entering data on behalf of the others — the timestamps don't distinguish).

4. **The dead client consumer at `downtime-form.js:1311-1317`** (Q5 carve-out) was the post-removal residue: the consumer block was kept after Fix.39 removed the writer, and remained dead-on-the-read-side until `fd5dee1` removed it as part of the retirement.

5. **The collection is gone.** Production no longer carries it. The retirement included a backup at `server/scripts/_backups/territory-residency-retirement-2026-05-05T07-18-05-854Z.json` — recoverable if the user ever wants to revisit.

## Conclusion

**A — no active writer found.**

Issue #26 closes informationally. The territory FK refactor's audit trail is now fully closed. The four mystery documents are explained as residue from a feature that lived briefly (April 2 — April 11, 2026) and was superseded when feeding-rights moved to the canonical `territories.feeding_rights` store. The retirement on 2026-05-05 closes the surface entirely.

## Detection-and-response

If a future audit ever surfaces a *new* `territory_residency` document (or the collection re-appears in `db.listCollections()`):

1. **Re-run the audit's grep set** above against the current `dev` and `main`. The greps are the cheapest first probe.
2. **Check `git log --since=<last-audit-date> -S "territory_residency"`** for any reintroduction of the writer.
3. **Inspect the doc's `created_at` and `updated_at` timestamps.** A doc dated after `2026-05-05T07:18:05Z` (the retirement) is a smoking gun for an active reintroduction.
4. **Check the retirement backup file** (if still on disk) before considering re-creating a doc — the data may have been intentional historical state worth restoring rather than discarding.
5. **Owner:** SM (Khepri) routes the response: either an immediate fix issue (if a regression has slipped) or a deliberate revival proposal (if a feature wants the surface back).

## References

- Issue #26 — this audit's parent.
- ADR-002 §Live-data baseline (`specs/architecture/adr-002-territory-fk.md`) — the original count=0 claim.
- Story #3c (`specs/stories/3c-migration-script.story.md`) §Dev Agent Record — the surprise finding (4 docs).
- Commit `b168535` (2026-04-02) — writer introduced.
- Commit `5128e43` (2026-04-11) — writer removed (Fix.39).
- Commit `7ca403c` (2026-04-20) — dead code cleanup.
- Commit `fd5dee1` (2026-05-05) — collection retirement.
- Backup: `server/scripts/_backups/territory-residency-retirement-2026-05-05T07-18-05-854Z.json` (local; not in repo).
