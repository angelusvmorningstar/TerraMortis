# Investigation: #815 — Harbour influence total discrepancy

- **Date:** 2026-06-16
- **Issue:** #815 (Harbour influence total discrepancy: +17 shown vs +19 expected)
- **Type:** read-only data investigation (no code change)
- **Verdict:** **Not a bug. The tracker is correct.** The live Ambience screen reflects **Downtime 4** (the active cycle), where Harbour influence genuinely totals **+17** — matching the submitted data exactly. The "+19 expected" was an arithmetic miscount of a list that sums to 17.

## How the confusion arose

The original report referenced "DT3 processing", so the first query pass looked at **Downtime 3** and found Harbour = +13/−3/+10. But the live Ambience table the ST is actually viewing reflects the **active cycle, Downtime 4** (`6a11a3814fce658310cdee80`). The two cycles have different influence data. Everything below is DT4, which is what the screen shows.

## Verification — DT4, all five territories match the screen exactly

Read-only query of live `tm_suite`, DT4 cycle, all 29 `downtime_submissions`, `responses.influence_spend` parsed (JSON string keyed by territory `_id`). Summed per territory:

| Territory | Contributors (DT4) | Total | Screen | Match |
|---|---|---|---|---|
| The Academy | Henry 17, Charlie 14, Jack 4, Yusuf 1, Anichka 1, Tegan 1 | +38 | `+38 \| -0 \| +38` | ✓ |
| The Dockyards | Conrad 7, Hazel 5, Tegan 4, Ryan 2, Reed 2 | +20 | `+20 \| -0 \| +20` | ✓ |
| **The Harbour** | **Wan 8, Ludica 3, Benedict 2, Reed 2, Yusuf 1, Xavier 1** | **+17** | `+17 \| -0 \| +17` | ✓ |
| The North Shore | Brandy 7, René Meyer 2, Alice 2, Yusuf 1, Anichka 1 | +13 | `+13 \| -0 \| +13` | ✓ |
| The Second City | Eve 7, René Meyer 5, Einar 4, Aleksei 2 | +18 | `+18 \| -0 \| +18` | ✓ |

All five territories reconcile to the screenshot to the unit. `_gatherInfluence` and the Influence column are computing correctly.

## The Harbour number specifically

DT4 Harbour `influence_spend`: Wan 8, Ludica 3, Benedict 2, Reed 2, Yusuf 1, Xavier 1 → **+17**.

This is **identical to the ST's own expected breakdown** in the report (Wan 8, Ludica 3, Reed 2, Benedict 2, Yusuf 1, Xavier 1). That list sums to **17**, not 19 — the "+19" was simply an addition error. The screen already shows exactly what the ST expected.

(Benedict — flagged as "missing" in the first DT3 pass — *does* have a DT4 submission with Harbour +2. He simply had no DT3 submission. The DT4 screen includes him correctly.)

## "−0" on the negative column

Correct, not a bug. Every DT4 `influence_spend` value is ≥ 0 — no character submitted a negative influence this cycle — so `inf_neg` is 0 for all territories and the column renders "−0". (DT3 *did* have negatives, e.g. Jack Fallow −1, Macheath −2 on Harbour; that's why the DT3 pass showed −3. Different cycle.)

## Conclusion & recommendation

- **No code change.** The Ambience Influence column is accurate for the active cycle (DT4): Academy +38, Dockyards +20, Harbour +17, North Shore +13, Second City +18, all with no negatives — verified to the unit against live data.
- The reported discrepancy was (a) a cycle mix-up (DT3 expectation vs DT4 screen) and (b) a +19/+17 arithmetic slip. Harbour is correctly +17.
- **Recommend closing #815 as "working as intended."**

## Out of scope (confirmed, not actioned)

- No change to `_gatherInfluence` (it is correct).
- Side-finding (unrelated): the `territories` collection holds ~16 `Regent Save Test` junk docs and `downtime_cycles` holds 2 `Test Cycle` junk docs (test residue) — candidate for a separate cleanup, same class as the `secondcity` residue noted in ADR-002.
