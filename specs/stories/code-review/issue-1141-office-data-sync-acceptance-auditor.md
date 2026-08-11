# Acceptance Auditor — issue-1141-office-data-sync

You have **read access to the whole repository** at `D:\Terra Mortis\TM Suite`. Your job is to check this
diff against its specification, and — critically — to check whether the specification's own record of
what happened is honest.

## Run this in TWO PASSES, in order. Do not skip or reorder them.

### Pass 1 — form findings from the code alone

Read the diff below. Read `content/rules/office-powers.md` in the umbrella workspace
(`D:\Terra Mortis\content\rules\office-powers.md`) — this is the design source the change is meant to
implement. Read whatever else in the repo you need (`office-tab.js`, `character.schema.js`, etc.).

**Do not yet read the "Dev Agent Record" or "Senior Developer Review" sections of the story file** — if
you open `specs/stories/issue-1141-office-data-sync.story.md`, stop before those sections. Reading them
first will anchor you on the author's own framing of what was done; the point of this pass is to check
the code against the spec independently, before you know what the author claims to have done.

Form findings: does the diff satisfy the Acceptance Criteria section of the story (the numbered ACs and
the "What this story is NOT" section)? Any violation, deviation, missing behaviour, or contradiction
between the spec and the actual code goes here.

### Pass 2 — check the author's own record against reality

Now read the rest of `specs/stories/issue-1141-office-data-sync.story.md`, including "Dev Agent Record",
"Debug Log References", and "Completion Notes List". This story makes several specific, checkable
factual claims. **Verify each one by actually running or checking it yourself — do not accept it on
trust.** In particular:

- The claim that `server/tests/issue-1141-office-data-sync.test.js` failed 12/21 against the pre-edit
  file and passes 21/21 now. You can check the current pass by running the suite yourself
  (`cd server && npx vitest run tests/issue-1141-office-data-sync.test.js`); if you want to check the RED
  claim, temporarily revert `public/js/tabs/office-data.js` to `git show main:public/js/tabs/office-data.js`
  content, rerun, then restore it and confirm the restore with `git diff`.
- The claim that `office-data.js` has exactly one consumer (`office-tab.js`) in the whole codebase, and
  that no existing test file references `OFFICE_DATA` or the old manoeuvre/merit content. Verify by your
  own search, not by trusting the claim.
- The claim that importing `office-tab.js` into this project's Vitest crashes at collection time because
  `../data/api.js` reads `location.hostname` at module top level, and that `server/vitest.config.js` has
  no jsdom environment configured. Check both halves of this claim directly.
- **The T4 claim is the highest-value one to check.** The story claims a real Playwright/Chromium session
  was run, calling `renderOfficeTab` directly against six real `characters` documents fetched live from
  MongoDB (Eve Lockridge, Yusuf Kalusicj, Einar Solveig, Brandy LaRoux, Carver, Ivana Horvat), bypassing
  `app.js` routing and the Discord/dev-fixtures auth path, and that all assertions passed — but the
  verification script itself was deleted after the run, so there is no artefact you can independently
  re-execute. Treat this claim with real scepticism: cross-check its specifics against what you can
  verify — do those six characters and their `court_category` values actually exist as claimed in
  `tm_suite.characters` (if you have Mongo access; if not, say so and note the claim as unverifiable
  rather than confirmed), does the rendered content it claims (exact manoeuvre order, exact merit chips,
  the Administrator fallback text) match what `office-data.js` and `office-tab.js` would actually produce
  by your own reading of the code, and is there anything about the claim's specificity or structure that
  reads as fabricated rather than observed. If you cannot verify it, say exactly that — "unverifiable, not
  disputed" is a legitimate and different conclusion from "confirmed" or "false."
- The claim that a full regression run found 10 failing test files (2330/2335 passing), that 9 of them
  are not documented in `CLAUDE.md`'s pre-existing-failure list, and that none of the 10 reference
  `office-data.js` or `office-tab.js`. If you have a local MongoDB available, you can run
  `cd server && npx vitest run` yourself and compare; if not, at minimum verify the "none reference the
  changed files" half by grepping the 10 named files.

For anything claimed that turns out to be false, overstated, or unverifiable, say so explicitly — this is
exactly the class of finding this two-pass structure exists to catch. A false claim in the author's own
completion record is a more serious finding than an ordinary code defect; flag it as such.

## Context

- The diff: `D:\Terra Mortis\TM Suite\specs\stories\code-review\issue-1141-office-data-sync-diff.txt`
- The story: `D:\Terra Mortis\TM Suite\specs\stories\issue-1141-office-data-sync.story.md`
- The design source: `D:\Terra Mortis\content\rules\office-powers.md`
- The ecosystem data map (background on the wider system if useful, not required reading):
  `D:\Terra Mortis\data-map.md`

## Ground rules

- **Do not modify, commit, or push anything in this repository**, with the one exception described above
  (temporarily reverting `office-data.js` to check the RED claim) — and that must be restored and
  confirmed restored before you finish.
- **Never touch any sibling repository.** This is an umbrella workspace at `D:\Terra Mortis\`; TM Wiki,
  TM Cockpit and TM Herald are adjacent, independent repos with their own git history. Stay inside
  `D:\Terra Mortis\TM Suite` (and read-only reference to `D:\Terra Mortis\content\rules\office-powers.md`
  and `D:\Terra Mortis\data-map.md` in the umbrella) only.

## Output format

A Markdown list, clearly split into two sections — **Pass 1 findings** and **Pass 2 findings** (record
claims verified true here too, briefly, not only the false ones — a clean bill of health on a specific
checked claim is useful signal). For each finding:

- **One-line title**
- **Severity**: High / Medium / Low (a false completion claim is at minimum Medium regardless of the
  underlying defect's severity, because it corrodes trust in the rest of the record)
- **Which AC or claim it concerns**
- **Evidence**: what you actually checked and what you found
- **Confidence**: how sure you are, and why

If a pass finds nothing, say so plainly rather than manufacturing a finding.
