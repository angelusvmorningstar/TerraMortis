---
name: TM DT Court Pulse
description: Synthesise the game-night Court Pulse — a single narrative summary of the night's political/social threads, built strictly from attending players' submitted highlights (`game_recount` field on their downtime submission), never invented. Flags ambiguous lines (typos, OOC notes misread as in-fiction) for ST confirmation before finalizing. Use at the start of downtime processing, every cycle, when the user says "Court Pulse", "synthesise the highlights", or "review the game night".
---

# TM DT Court Pulse

Produces the Court Pulse — the opening synthesis of a game night, built entirely from what attending players actually submitted as their own highlights. This runs first in downtime processing, before any mechanical resolution (Court Pulse → Action Queue → Haven/Travel → Phase 0 Sorcery → Feeding → the rest of Phase 2), per the documented 7-phase methodology (`reference_downtime_processing` memory).

## Input

`game_recount` on each attending player's downtime submission — a numbered list of that player's own highlights from the night (`responses['game_recount']`, written by the downtime form as `"1. ...\n\n2. ..."`). One player, one set of highlights. Pull every attending player's submission for the cycle, not just a sample.

## Method

1. **Read every attending player's `game_recount` in full** before synthesising anything. Don't sample or skip any — a thread that only shows up in one player's account (e.g. who was Dominated, who confronted whom) is still real and needs to make it in.
2. **Cross-reference across accounts to fill gaps.** Individual highlights are frequently incomplete — one player's account may not name who did something to them, while another's does (confirmed pattern this session: Reed's own recount didn't name who he Dominated, but Macheath's did). Build the fullest picture the *combined* set of highlights supports, not any single account read in isolation.
3. **Synthesise into a single flowing narrative** (not a bulleted list) — present tense, third person, grouped by thread rather than by player, in rough order of narrative weight (the night's dominant thread first, then secondary threads). Match the register of a prior cycle's Court Pulse if unsure of tone (query `downtime_cycles` / prior processing logs for an example).
4. **Never invent a detail not present in some player's highlight.** If two accounts conflict or a name/event is ambiguous, don't silently resolve it yourself — flag it as a judgment call (see step 5).
5. **Flag judgment calls explicitly, don't just make the call silently.** Two confirmed patterns from real use:
   - **Apparent typos or name-similarity errors** (e.g. a name that's clearly meant to be a different, similar-sounding established character) — state the read and ask for confirmation rather than silently correcting or leaving it as written.
   - **Lines that read as out-of-character/meta commentary directed at the ST team** rather than an in-fiction highlight (e.g. "keep in mind for OUR purposes...") — flag these as candidates for exclusion from the in-fiction synthesis, and confirm before dropping them.
6. **Present the full synthesis plus the judgment-call list together**, and treat both as needing sign-off before the Court Pulse is considered final — this feeds directly into character-by-character review later (a name or event mentioned here often becomes an Action Queue item), so getting it wrong early compounds.

## Boundaries

- Never invent an event, name, or outcome not present in at least one player's submitted highlight.
- Never silently resolve an ambiguous read (typo, OOC-vs-IC line) — always surface it as a judgment call for confirmation.
- Never skip a player's highlights because their thread seems minor — narrative weight is an ST judgement made *after* reading everything, not a reason to skip reading something.
- Never write this directly into a player-facing publish field without the ST's sign-off on both the synthesis and the judgment calls.
