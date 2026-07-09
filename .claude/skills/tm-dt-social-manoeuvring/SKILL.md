---
name: TM DT Social Manoeuvring
description: Resolve Social Manoeuvring (Doors) attempts between characters — a multi-cycle subplot mechanic, not a one-shot resolution. Tracks Doors total/opened, cumulative failure penalty, and Impression level in a persistent per-thread file across cycles. Covers base Doors calculation, TM's covenant-Disposition attempt-frequency rule, contested rolls, and Office powers like Open Door Policy. Use when the user says "Social Manoeuvring", "Doors", or references an ongoing PC-vs-PC/NPC persuasion subplot.
---

# TM DT Social Manoeuvring

Resolves Social Manoeuvring (the Doors system) for a persuasion/goal-oriented subplot between characters. Unlike feeding or sorcery (resolved fresh each cycle), **a Social Manoeuvring thread persists across multiple cycles and rolls** — this skill must track state between invocations, not just resolve a single action.

Built from a live worked session with Angelus (Eve Lockridge vs. Jack Fallow, DT5) — the base mechanic was corrected multiple times before landing on the final rules below; don't re-litigate what's already settled here.

## Persistent State — Read/Write a Tracking File

Each ongoing Social Manoeuvring thread gets its own file: `st-working/downtime/social-manoeuvring/<short-name>.md` (e.g. `eve-vs-jack.md`). **Before resolving a new roll, check whether this thread's file already exists** — if so, read its current state (Doors total, Doors opened so far, cumulative failure penalty, current Impression level, roll history) before doing anything else. If it doesn't exist yet, this is the thread's first roll — create the file after resolving it.

Track in the file:
- **Doors total** (calculated once, at the start of the thread — see below)
- **Doors opened so far** (running count, out of the total)
- **Cumulative failure penalty** (a running -1 per failed roll, never resets on a later success — see rules below)
- **Current Impression level** (Hostile / Poor / Average / Good / Excellent, or whatever the TM tier scale is — confirm current tier if unsure)
- **Roll history** (date, pool used, dice result, successes, outcome, narrative interpretation) — one entry per roll made
- **Office powers spent against this thread** (e.g. Open Door Policy consumes a use)

## Base Doors Calculation (once per thread, not per roll)

- **Base**: the lower of the target's Resolve or Composure.
- **+2** if this crosses a breaking point.
- **+1** if it blocks an Aspiration.
- **+1** if it acts against the target's Virtue (or Mask, for Kindred — per this rulebook's own text extending the Virtue modifier to Mask).
- Confirm any Mask-conflict modifier against the character's **actual** archetype text before applying it — don't assume from the archetype name alone (confirmed live: assumed Jack's "Spy" Mask implied loyalty-resistance without checking the real text; the real text was about secrets/pragmatism and didn't apply a modifier at all).

## TM Covenant-Disposition Addendum (attempt frequency)

- Attempt frequency is gated by a **covenant-based Disposition tier**: Friendly (same covenant), Neutral (non-opposing covenants), Adversarial (opposing covenants) — check this before assuming a roll is available this cycle.
- TM's Forcing-Doors failure state is **immune "for a Story," not permanently** — don't treat a stalled attempt as dead forever.
- No-PCs-in-a-group restriction applies — confirm this doesn't secretly involve a third PC acting as backup/audience in a way the base rules don't cover.

## Opening Doors — The Roll Itself

- **One Door opens per successful roll**, regardless of raw success count. An exceptional success opens **two** Doors instead of one.
- **The pool can be different each attempt**, depending on tactics used — don't assume the same Attribute/Skill pairing carries across every roll in the thread.
- **The roll doesn't have to be Social at all** if the tactic described genuinely isn't (e.g. a favour, a display of competence).
- **Making a given attempt contested is optional, the ST's call per roll** — not automatic, and not fixed to the first roll only. When contested, the defender's side isn't locked to Resolve/Composure — any two appropriate Attributes fitting the fiction work.
- **Failed rolls carry a cumulative -1 penalty on further rolls in this thread, permanently** — it does not clear on a later success. Track this running total in the file.
- **On a failed roll, the ST may (not must) worsen the Impression level by one step**, and the player takes a Beat if so. If Impression drops to Hostile, the attempt **stalls entirely** until it recovers — don't keep rolling against a Hostile Impression.

## Office Powers That Interact With Doors

Damnation City court offices grant powers that can modify a Doors thread directly — e.g. the Ruler's **Open Door Policy** (removes one Door outright, once per instance). Check `D:\Terra Mortis\Character Sheets\Offices Double Sided.pdf` (local file) for the full office-power list before assuming a character's office doesn't interact with this thread — confirm the office actually maps to the character (e.g. "Head of State" = "The Ruler" title) before applying its powers.

## Steps

1. **Locate or create the thread's tracking file.** Read existing state if present.
2. **Calculate Doors total** if this is the thread's first roll (see Base Doors Calculation above) — otherwise use the stored total.
3. **Check Disposition/attempt-frequency gating** before assuming a roll is available.
4. **Determine this roll's pool** — may differ from prior rolls in the same thread; state reasoning, don't just reuse the last pool by default.
5. **Apply the cumulative failure penalty** from the tracking file, if any.
6. **Decide (or ask the ST to decide) whether this roll is contested.** If so, build the defender's pool from whatever Attributes genuinely fit the fiction.
7. **Present the pool(s) and reasoning, then stop for explicit ST sign-off before rolling** — same hard checkpoint discipline as the other DT-resolve skills.
8. **Roll through the real dice engine** once confirmed, genuine randomness.
9. **Resolve the outcome**: Door(s) opened, failure penalty applied if it failed, Impression possibly worsened, narrative interpretation written.
10. **Update the tracking file** with the new state before finishing.

## Boundaries

- Never resolve a Social Manoeuvring roll without first checking for and reading an existing tracking file for that thread.
- Never assume the same pool carries over roll to roll without re-checking the fiction.
- Never apply a Mask/Virtue modifier without checking the character's actual archetype text.
- Never treat a stalled (Hostile Impression) attempt as permanently dead.
- Never roll in the same turn the pool is presented — sign-off first.
- Never write results to MongoDB or spend a live tracker resource (e.g. an Office power's Influence cost) without flagging it as pending for whoever runs the actual tracker update.
