# Adversarial review - EQC-3 (container assignment: write path + picker UI, issue #1154),
TerraMortis (TM Suite)

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written, which is the point: you are here to catch what the author
could not catch about their own work.

## How to run this - read this section before anything else

This is **three passes in one session, in a fixed order**, and the order is load-bearing. Each pass
is allowed to see strictly more than the one before it. You cannot un-read a spec, so the pass that
must judge the code cold goes first.

1. Work the passes **in the order written**. Do not read ahead. Do not open a file a later pass
   grants you until you reach that pass. In particular: **the story spec is deliberately NOT in the
   diff.** Do not go looking for it during the earlier passes. The final pass will hand you the path.
2. **Freeze each pass before advancing.** Write that pass's findings out in full, to
   `specs/stories/code-review/issue-1154-eqc3-codex-findings.md`, before you open anything the next
   pass allows. Do not revise an earlier pass's findings in light of what a later pass taught you - if
   a later pass contradicts an earlier one, say so as a new finding and leave the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- **Repo root: `D:\Terra Mortis\TM Suite-eqc`.** This is a dedicated `git worktree`, NOT the main
  repo directory. **Quote this path in every shell command you run** - it contains a space. **A
  concurrent, unrelated Claude Code session is actively working in the SIBLING directory
  `D:\Terra Mortis\TM Suite` (the original checkout, a different worktree of the SAME repo, on a
  different branch). Do NOT read, write, or run any command against `D:\Terra Mortis\TM Suite` -
  operate exclusively inside `D:\Terra Mortis\TM Suite-eqc`.** The two directories share the same
  `.git` object database but have independent working trees and independent checked-out branches -
  this worktree's own branch (`ms/issue-1154-eqc3-container-assignment`) and checked-out files are
  yours alone to use; nothing you do here can affect the sibling directory's files.
- The diff is at `specs/stories/code-review/issue-1154-eqc3-diff.txt` (relative to the repo root),
  taken between base commit `f13c21cb` (the tip of the prerequisite EQC-2 branch) and the committed
  state at `de5d5278` (current HEAD in this worktree).
- The diff is **deliberately scoped to source and tooling only**. The story spec
  (`specs/stories/feature.1154.eqc3-container-assignment.story.md`) is excluded from it on purpose,
  so the earlier passes stay genuinely blind to the author's own account. Do not treat its absence as
  an omission or go hunting for it before Pass 3.
- **Read and run freely** to verify a claim within this worktree. Running the code beats reasoning
  about it every time.
- **Do NOT modify, commit, or push anything**, and do not touch the sibling `TM Suite` directory under
  any circumstance, even to read.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged, within this worktree only** - you MUST restore
  it exactly, confirm the restore with `git diff`, and say so in your output.
- **Environment hazards**: `npm test` (vitest, `server/` directory) needs `node_modules` - this
  worktree's `node_modules` is a filesystem JUNCTION pointing at the original directory's install (not
  a fresh install), so it should work identically; if you hit a module-resolution error, say so rather
  than assuming the worktree is broken. Integration-bearing suites need a local `mongod` and the
  worktree's own `server/.env` (copied in, not tracked by git) - if these are absent, disclose it.
- **Blast radius**: `POST /api/characters/:id/equipment` is a real, already-live write endpoint (ST
  admin equipment editing) - this diff adds new validation branches to it. A mistake here could either
  (a) silently accept invalid `container_id` data going forward, or (b) silently REJECT previously-
  valid requests that don't set `container_id` at all (a regression to existing, already-shipped
  equipment-adding functionality that has nothing to do with containers). Check (b) especially
  carefully - it's the kind of "new optional field breaks the old required-fields-only path" mistake
  that's easy to introduce and easy to miss in review.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**.
- If you found nothing in a pass or at a severity, **say that explicitly**.
- Report the **exact current gate numbers**: `npx vitest run tests/equipment.test.js` and
  `npx vitest run tests/issue-879-defence-penalty-wirein.test.js` (from `server/`, this worktree),
  the two files this diff's own tests live in. Report the real numbers even if they disagree with
  anything the story claims.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/issue-1154-eqc3-diff.txt` and **nothing else**. No
spec, no story file, no project context. Do not explore the repository. Do not go looking for the
spec.

### What this diff claims to be

`POST /api/characters/:id/equipment` gains optional `container_id` support: if present, it must be a
24-hex ObjectId-shaped string, must match the `catalogue_id` of ANOTHER equipment row this SAME
character already owns, and that referenced catalogue item's `bucket` must be `'container'` - all
three checks running BEFORE any write, rejecting the whole request on failure rather than a partial
write. `equipment-derivation.js` gains a new exported pure function, `equipmentContainerLabel(item,
allEquipment, catalogueLookup)`, computing an "(in: <name>)" display string - deliberately checking
whether the CHARACTER's own equipment array still contains a row matching `container_id` (not just
whether the catalogue item globally exists), because a catalogue item can outlive a specific
character's own possession of it. `editor/sheet.js` gains a "Place inside" dropdown in the add-item
form (only rendered when the character owns at least one container) and wires `equipmentContainerLabel`
into six render sections. `editor/edit.js`'s `shAddEquip()` reads the new dropdown and includes
`container_id` in the POST body.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **Does the new `container_id` validation block accidentally make `container_id` REQUIRED**, or
   otherwise change behaviour for a request that never mentions it at all? Trace the exact branch
   condition guarding the new checks (is it `if (item.container_id != null)` or something looser that
   could misfire on e.g. an empty string, `0`, or `false`?).
2. **Order of operations**: does the diff's own claimed order (shape -> existence -> bucket-
   correctness, all before the actual `$push` write) actually hold in the code, or does e.g. the
   bucket-correctness DB lookup happen before the cheaper shape check, wasting a round-trip on
   obviously-malformed input? (Low severity if so, but worth noting.)
3. **`equipmentContainerLabel`'s self-reference guard** (`e !== item`): is this REFERENCE equality
   (`!==`) doing real work, or could two distinct object literals with identical content both be
   "the same item" in a way this guard fails to catch (e.g. if the array is ever rebuilt/cloned
   between when `item` was captured and when `allEquipment` is passed in)? Trace where `containedLabel`
   is actually called from in `sheet.js` and confirm `item` and the elements of `allEquipment` are
   genuinely the same object references, not copies.
4. **`shAddEquip()`'s new `containerId` read**: `document.getElementById('eq-add-container')?.value ||
   null` - does this correctly distinguish "the dropdown doesn't exist in the DOM at all" (character
   owns no containers) from "the dropdown exists but nothing is selected" (both should send `null`)?
   Trace both cases.
5. **Trivially-satisfiable assertions** in the new tests - anything that would pass even if the
   underlying logic were wrong.
6. **Self-contradiction**: does any comment claim behaviour the code doesn't implement (e.g. claiming
   the existence check queries the database, when it might actually only check an in-memory array
   already fetched)?
7. **Unused imports / dead code**: is `equipmentContainerLabel` actually imported and called in
   `sheet.js`, or could the import exist without the call site (or vice versa - called without being
   imported, a ReferenceError)?

**STOP. Write your Pass 1 findings to
`specs/stories/code-review/issue-1154-eqc3-codex-findings.md` now, before reading further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Suite-eqc` (this worktree only - see Ground
Rules). You still do **not** have the story spec or any account of the author's intent.

### Orientation (not ground truth - verify against the code)

Same summary as Pass 1: `container_id` write-path validation added to an existing, live equipment-add
endpoint; a new pure display predicate checking character-scoped (not catalogue-global) container
ownership; a new UI picker; wiring through the existing add-item client function.

### What to hunt for

1. **Hand-trace the FULL write-path validation** in `server/routes/characters.js` for FOUR scenarios:
   (a) no `container_id` at all (must behave EXACTLY as before this diff), (b) `container_id` present
   but malformed (not 24-hex), (c) `container_id` well-formed but referencing a catalogue_id this
   character has never added, (d) `container_id` well-formed and owned, but that catalogue item's
   `bucket` is NOT `'container'` (e.g. it's `'combat_gear'`). Confirm each produces exactly the
   response the diff's comments/messages claim.
2. **Read `server/schemas/character.schema.js`'s `container_id` field definition** (not part of this
   diff, but load-bearing context) and confirm the new route code's validation is actually CONSISTENT
   with what the schema itself permits - does the schema's own pattern match what the route checks, or
   could the route accept something the schema would reject at a different write path (or vice versa)?
3. **Race/ordering concern**: the existence check reads `char.equipment` from a `findOne` BEFORE the
   `$push` that adds the new item. Could a concurrent second request (adding a DIFFERENT item with a
   `container_id` pointing at a container the FIRST request is simultaneously adding) pass validation
   against a stale read? Is this a realistic concern for a single-ST-admin-at-a-time tool, or worth
   flagging as a real (if narrow) race?
4. **`equipmentContainerLabel`'s catalogue lookup fallback**: if `containerEntry` resolves (the
   character still owns a row with this catalogue_id) but that catalogue entry's `name` field is
   itself null/empty, does the function fall back sensibly (the diff claims `containerEntry.name ||
   item.container_id`) - trace this exactly.
5. **Grep the WHOLE repo** for any OTHER write path that could set a character's `equipment[]` array
   (e.g. a bulk `PUT /:id` character-replace route) - does THAT route need the same `container_id`
   validation this diff added only to `POST /:id/equipment`, or is `POST` genuinely the only equipment-
   adding write path? If there's a second path, is it now inconsistently validated?
6. **The "Place inside" dropdown's option values**: read `editor/sheet.js`'s render code and confirm
   the `<option value="...">` uses the SAME string form (`item.catalogue_id`, presumably already a
   string) that `server/routes/characters.js`'s validation later compares `container_id` against - any
   type mismatch (e.g. one side ObjectId-ish, the other a raw string with different casing) would make
   every dropdown selection fail validation.

**STOP. Write your Pass 2 findings to
`specs/stories/code-review/issue-1154-eqc3-codex-findings.md` now, before reading further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/feature.1154.eqc3-container-assignment.story.md` - the **Story**, **Background**,
   **Explicitly NOT this story**, and **Acceptance Criteria (1-6)** sections.
2. **Do NOT read the "Dev Agent Record" section yet.** Skip past it entirely.
3. Against the six acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**.
   - **"Explicitly NOT this story" is equally load-bearing** - check the change did not quietly do one
     of the excluded things: no edit/reassignment endpoint for an EXISTING row's container_id; no
     resolution of the container-instance-identity ambiguity; no delete-time cascade/orphan guard; no
     grouped "contents of X" view (only an inline annotation); no catalogue-level CRUD change.
   - AC #1's exact validation ORDER and failure-mode claims (400 before any write, never a partial
     write).
   - AC #4 as WRITTEN in the file - note whether it matches or has been amended from what a first
     glance might expect (read carefully; the story may record a mid-development correction to its own
     acceptance criterion - if so, evaluate the code against the FINAL, amended wording).
4. **Write your Pass 3a findings down now, before moving on.**

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes several specific, checkable claims:
   - Built in a dedicated git worktree due to a real branch-collision incident with a concurrent
     session - not itself a code claim, but check it doesn't leave any residue in the reviewed diff
     (e.g. no accidental reference to the sibling directory's path anywhere in the changed files).
   - A claimed mid-development finding: the AC's original "dangling" definition was wrong (catalogue-
     global existence vs character-scoped ownership) - verify this claim against the actual code in
     `equipmentContainerLabel` and against `server/routes/equipment-catalogue.js`'s DELETE handler (not
     part of this diff, but referenced by the claim) to confirm the DELETE guard really does only check
     `equipment.catalogue_id`, not `container_id`.
   - Full equipment suite: 9 files, 196/196 (up from EQC-2's 185, +11 from this story's own new tests:
     6 in `equipment.test.js`, 5 in `issue-879-defence-penalty-wirein.test.js`).
   - Prove-discrimination performed on the character-ownership check in `equipmentContainerLabel`
     (temporarily hardcoded to always-true, exactly 2 tests failed, restored).
6. **Verify each claim by running it, not by reading it.** Run `npx vitest run tests/equipment.test.js`
   and `npx vitest run tests/issue-879-defence-penalty-wirein.test.js` yourself, from `server/` in THIS
   worktree, right now.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to `specs/stories/code-review/issue-1154-eqc3-codex-findings.md`, grouped `## High` /
`## Medium` / `## Low`, each finding tagged with the pass that produced it (`[Pass 1]`, `[Pass 2]`,
`[Pass 3a]`, `[Pass 3b]`). Write `- None found.` under any empty heading rather than dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** - be concrete
- **The observable consequence** - what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened in each pass, and confirmation you did not read ahead.
- Every command you ran, with its real result, including the two named vitest files.
- **Anything you could not run, and why.**
- Confirmation you modified nothing (or restored anything you touched), and confirmation you never
  read or touched `D:\Terra Mortis\TM Suite` (the sibling directory).
