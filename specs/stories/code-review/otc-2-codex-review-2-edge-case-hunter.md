# Adversarial review — otc-2-status-actions-server-hardening (Status Actions server hardening), TM Suite

## PASS 2 of 3 — EDGE CASE HUNTER (the diff, plus the repository)

You have full read access to `D:\Terra Mortis\TM Suite`. Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec
or any account of the author's intent — work from the code itself. This is pass 2 of 3, each in its
own file; a separate Pass 1 file already ran blind against the diff alone — do not read it, work
independently.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at
  `specs/stories/code-review/otc-2-diff.txt`, relative to that root, taken against base commit
  `9bdd8ad0`.
- The diff is **deliberately scoped to source and tooling only**. Story-spec and
  `sprint-status.yaml` edits are excluded on purpose. Do not treat their absence as an omission —
  you may read the real spec at `specs/stories/otc-2-status-actions-server-hardening.md` if you
  judge it useful for understanding intent, since this pass (unlike Pass 1) is not required to stay
  blind to it, but your primary judgement should come from tracing the actual code.
- This repo sits inside an umbrella workspace (`D:\Terra Mortis`) with sibling repos `TM Wiki`,
  `TM Cockpit`, `TM Herald`. **Do not read or touch anything outside `D:\Terra Mortis\TM Suite`.**
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.**
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the
  way you expect, restore it) is allowed and encouraged — you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- **MongoDB connectivity is a known hazard in this environment.** The author's own session could
  not reach either the configured Atlas URI (hung indefinitely) or a local `mongod` (fast
  `ECONNRESET` — `server/db.js` hardcodes `tls: true`). If you can reach a working MongoDB in your
  environment, that is directly useful — report what you found. If not, disclose it plainly.
- **Blast radius**: `accessors.js`'s City Status functions are consumed by 9 call sites app-wide.
  A mistake here changes displayed/effective City Status everywhere, not just Status Actions.

## Honesty requirements (these outrank completeness)

- If you could not run something, say so plainly and name what you could not run.
- If you found nothing at a severity, say that explicitly rather than omitting the section.
- Report the exact current gate numbers:
  `cd server && npx vitest run tests/otc-2-city-status-calc.test.js`, and attempt
  `cd server && npx vitest run tests/otc-2-office-actions-api.test.js`. Report real numbers.

---

### Orientation (not ground truth — verify against the code)

The change replaces a hand-duplicated, incomplete City-Status budget formula in
`server/routes/office-actions.js` with a shared calculation in the new
`public/js/data/city-status-calc.js`, and adds a phase gate that rejects Status Actions unless a
`downtime_cycles` document is currently `phase: 'game'`. `public/js/tabs/office-tab.js` reads an
existing-but-previously-unused function, `getGamePhaseCycle()` in `public/js/downtime/db.js`, to
mirror that gate client-side.

### What to hunt for

1. **`getGamePhaseCycle()` vs the server's own phase-cycle selection — read both in full and
   compare.** `public/js/downtime/db.js`'s `getGamePhaseCycle()` does
   `cycles.find(isInGamePhase)` — the FIRST array match, in whatever order the API returns cycles,
   with NO sort by `game_number`. The new server-side code in `office-actions.js`, by contrast,
   filters ALL cycles by `cyclePhase(c) === 'game'` and then sorts by `game_number` descending,
   taking the highest. **If more than one cycle is simultaneously in `'game'` phase, the client and
   the server can disagree about which cycle is "the" live one.** Trace whether this is reachable
   in practice (can two cycles legitimately both carry `phase: 'game'` at once?), and if so, what
   actually happens — does the client show the panel as live while the server rejects, or vice
   versa?
2. Walk `findRegentTerritory`'s canonical-slug-duplicate-preference logic
   (`public/js/data/helpers.js:198-218`) end to end as called from the server's new code path.
   The server's territories fetch is a bare `.find().toArray()` with no projection — confirm every
   field `findRegentTerritory` reads (`regent_id`, `slug`, `name`, `ambience`) is actually present
   on documents returned that way, by checking the territories schema/route, not assuming.
3. Race condition check: the budget check (`countDocuments`) and the eventual `insertOne` in
   `office-actions.js` are not atomic — this was already true before this diff. Does the new
   phase-gate query and the new territories fetch (two additional awaited DB round-trips before the
   budget check) widen the race window in any way that makes double-spend of budget MORE likely
   than before, even if it was already theoretically possible?
4. `GATED_TYPES = new Set(['raise', 'lower', 'grant_first', 'strip_last'])` — cross-reference
   against `server/schemas/office_action.schema.js`'s `action_type` enum. Is there any value the
   schema allows that `GATED_TYPES` does NOT cover (a live gap), or is `GATED_TYPES` provably
   exhaustive against the schema (meaning the `if (GATED_TYPES.has(action_type))` branch can never
   actually be skipped in practice — dead conditional)? State which, with evidence.
5. What happens when `findRegentTerritory` returns `null` (actor regents nothing) — confirm the
   `?.ambience` optional-chain in `office-actions.js` correctly produces `undefined`, and that
   `regentAmbienceBonusFor(undefined)` in `city-status-calc.js` returns `0`, not `NaN` or a thrown
   error. Trace this by hand, do not assume from the `|| 0` pattern.
6. Confirm no other reference to the removed local `TITLE_STATUS_BONUS` literal remains anywhere
   in `office-actions.js` after its removal (a dangling reference would be a `ReferenceError` at
   request time, not at import time — grep, don't just read the diff hunk).
7. In `public/js/data/accessors.js`: `calcCityStatus`, `regentAmienceBonus`, and `titleStatusBonus`
   are now thin wrappers. Pick THREE of the 9 real call sites (e.g. `csv-format.js`,
   `suite/status.js`, `sheet.js`) and hand-verify the wrapper functions still produce byte-identical
   output to what the OLD inline implementation would have produced for the same inputs — not just
   that the code compiles/imports cleanly.
8. `office-tab.js`'s `renderButtons()`/`doAction()` now both early-return on `!liveCycle`. Confirm
   there is no OTHER code path in this file (or in `renderOfficeTab`'s caller, `app.js`) that could
   still invoke a raise/lower/grant_first/strip_last action while bypassing this check — e.g. a
   stale closure capturing a button reference from before `liveCycle` was known.
9. Malformed/absent input at the new entry points: what does the phase-gate code do if a
   `downtime_cycles` document has a `phase` field set to something outside the known enum (a
   corrupted or hand-edited document)? Trace through `cyclePhase()` in
   `public/js/downtime/cycle-phase.js` for this case specifically.

**STOP. Write your Pass 2 findings to `specs/stories/code-review/otc-2-codex-findings.md` now,
before reading further or opening any other pass's file.**

## Output (append this pass's findings, do not overwrite Pass 1's)

Append to `specs/stories/code-review/otc-2-codex-findings.md`, under a `## Pass 2 — Edge Case
Hunter` heading, grouped `### High` / `### Medium` / `### Low`, each finding tagged `[Pass 2]`.
Write `- None found.` under any empty heading rather than dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** — be concrete about what reaches it
- **The observable consequence** — what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened.
- Every command you ran, with its real result, including the two vitest commands named above.
- Anything you could not run, and why (name the MongoDB hazard explicitly if it applies to you).
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
