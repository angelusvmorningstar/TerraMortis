# Adversarial review - EQC-1 (bucket re-partition, containment schema, live-data migration,
issue #1152), TerraMortis (TM Suite)

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
   `specs/stories/code-review/issue-1152-eqc1-codex-findings.md`, before you open anything the next
   pass allows. Do not revise an earlier pass's findings in light of what a later pass taught you - if
   a later pass contradicts an earlier one, say so as a new finding and leave the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. **Quote this path in every shell command you run** - it
  contains a space. The diff is at `specs/stories/code-review/issue-1152-eqc1-diff.txt` (relative to
  that root), taken between base commit `ddf059f8` and the committed state at `c7e6771b` on branch
  `ms/issue-1152-eqc1-bucket-container-schema` (current HEAD - the change is already committed, not
  a working-tree diff).
- The diff is **deliberately scoped to source and tooling only**. The story spec
  (`specs/stories/feature.1152.eqc1-bucket-container-schema.story.md`) is excluded from it on purpose,
  so the earlier passes stay genuinely blind to the author's own account. Do not treat its absence as
  an omission or go hunting for it before Pass 3.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.**
- **This is an umbrella workspace.** `D:\Terra Mortis\TM Suite` sits alongside three sibling repos:
  `D:\Terra Mortis\TM Wiki`, `D:\Terra Mortis\TM Cockpit`, `D:\Terra Mortis\TM Herald`. **Never modify,
  commit, or push in any of them, under any circumstance**, and you should not need to read them either
  - this change is entirely self-contained within TM Suite.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output. Given the change is already committed, "restore"
  here means `git checkout -- <path>` back to the committed state, then confirm `git status --short`
  is clean of your own edits.
- **Environment hazards**: `npm test` (vitest, `server/` directory) needs a local `mongod` for several
  suites - they SKIP rather than fail without one (a documented quirk of this repo, per its own
  CLAUDE.md). If you don't have one, disclose that plainly rather than treating a skip as a pass. The
  equipment-specific suites you'll run (`equipment.test.js`, `equipment-client-fixes.test.js`,
  `issue-868-ecm-1-equipment-catalogue-api.test.js`, `issue-871-876-ecm-4-9-bundle.test.js`,
  `issue-872-ecm-5-editor-cache.test.js`, `issue-896-availability-filter.test.js`,
  `issue-879-defence-penalty-wirein.test.js`, `issue-1152-eqc1-bucket-migration.test.js`,
  `issue-873-ecm-6-admin-sidebar.test.js`) DO need `mongod` for their integration slices - if those
  skip in your environment, say so and report what DID run (the pure-function / static-analysis
  portions still exercise without a DB).
- **Blast radius**: `equipment_catalogue.bucket` is read directly by armour-penalty derivation
  (`equipment-derivation.js`), both roll calculators' weapon/skill-bonus chip filters (`roll.js`,
  `roll-v2.js`), the character sheet renderer, the DT form equipment dropdown, and the admin CRUD UI.
  A mistake in the bucket re-partition or the migration script would silently mis-derive combat
  mechanics (armour bonuses, weapon/skill roll chips) for EVERY character with equipment - live game
  data, not a corner case. This is exactly the kind of shared-gate, real-data change that warrants a
  full pass rather than a light one.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe: the equipment-related vitest suites named
  above, run individually (`npx vitest run tests/<name>.test.js` from `server/`). Report the real
  numbers even if they disagree with anything the story claims - especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/issue-1152-eqc1-diff.txt` and **nothing else**. No
spec, no story file, no project context. Do not explore the repository. Do not go looking for the
spec. Read other files only to resolve an import path the diff itself leaves ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

A re-partition of an equipment catalogue's `bucket` taxonomy from four old values
(`weapon|armour|equipment|asset`) to five new ones (`combat_gear|skill_gear|tool_utility|narrative|
container`), where `combat_gear` merges the old weapon and armour buckets (distinguished at read time
by which stat fields are populated: `weapon_type`/`damage_mod` for weapon-shaped, `armour_value`/
`defence_penalty` for armour-shaped - NOT by a new subtype field), and `container` replaces `asset`
(items can now be placed "inside" a container via a new `container_id` field on character equipment
entries, single-level only, no recursion). The diff includes: two JSON-schema files, a new
dry-run-by-default migration script (`migrate-eqc1-bucket-taxonomy.mjs`) with its own pure planning
function `planBucketMigration`, six production consumer files updated to the new bucket vocabulary,
and five pre-existing test files updated for the new fixtures/assertions plus one new test file for
the migration script itself.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **The armour/weapon disambiguation within `combat_gear` is the single highest-risk change in this
   diff.** Before this change, a weapon item and an armour item could never be confused (different
   buckets). After it, they share a bucket and are distinguished ONLY by which stat fields happen to
   be populated. Find every predicate that reads `bucket === 'combat_gear'` and check it ALSO checks
   the right stat field (`armour_value != null` for armour-only logic, `weapon_type != null` for
   weapon-only logic) - not just the bucket. A predicate that checks bucket alone would now silently
   apply armour-penalty math to a weapon, or list a piece of armour in the weapon-reference panel.
2. **`planBucketMigration`'s mapping table**: `weapon→combat_gear`, `armour→combat_gear`,
   `equipment→skill_gear`, `asset→container`. Is every one of the four old values actually mapped?
   Is there any old value silently left unmapped, or any NEW value accidentally present as a map KEY
   (which would make an already-migrated document look unrecognised)? What happens to a document whose
   `bucket` field is missing, null, or an empty string - does the code path handle it, or throw?
3. **Migration idempotency claim**: the code should recognise a document already on a NEW bucket value
   and leave it untouched (`touched: false`) rather than re-processing or erroring. Verify the actual
   branch logic achieves this, don't take the intent on faith.
4. **The `container_id` field** (`character.schema.js`): is it validated as EITHER null/absent OR a
   24-hex string, with no way to sneak in some other type? Does the schema's `additionalProperties:
   false` on the equipment sub-document actually still hold with the new field added, or could there be
   a syntax slip that accidentally widens/narrows the allowed key set?
5. **Trivially-satisfiable assertions**: scan the new/changed test assertions for anything that would
   pass even if the underlying fix were wrong - e.g. a `toEqual` between two computed values that could
   coincidentally match, rather than being pinned against a hard-coded expected literal.
6. **Self-contradiction within the diff**: does any updated comment now claim behaviour the code
   doesn't actually implement (e.g. claiming recursive containment is blocked, when nothing in the
   diff actually prevents it programmatically - is the "single-level only" claim enforced in CODE, or
   only asserted in a comment)?
7. **Dead code / unused branches**: does the new `BUCKET_FIELDS`/`BUCKET_LABELS`-style mapping in
   `equipment-catalogue-admin.js` and `sheet.js` cover every one of the five new bucket values with no
   gaps that would silently render an empty options list for a real bucket?
8. **Error paths**: `migrate-eqc1-bucket-taxonomy.mjs`'s `main()` and `migrate()` - what happens on a
   Mongo connection failure mid-loop? Does a failure on document N leave documents 1..N-1 written but
   silently abandon the rest without reporting which ones were missed?

**STOP. Write your Pass 1 findings to `specs/stories/code-review/issue-1152-eqc1-codex-findings.md`
now, before reading further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Suite`. Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec or
any account of the author's intent - work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

Same summary as Pass 1: a five-value bucket re-partition (combat_gear/skill_gear/tool_utility/
narrative/container) replacing the old four (weapon/armour/equipment/asset), with combat_gear merging
weapon+armour (disambiguated by stat-field presence) and container replacing asset (adding a new
`container_id` field for single-level containment). A migration script backfills existing catalogue
documents; six consumer files were updated to read the new vocabulary.

### What to hunt for

1. **Hand-trace `armourDefencePenalty` and `wornArmourCount`** in `public/js/data/equipment-derivation.js`
   for a character wearing THREE items: one weapon-shaped combat_gear item (`weapon_type: 'melee'`,
   `armour_value: null`), one armour-shaped combat_gear item (`armour_value: 2`, `weapon_type: null`),
   and one combat_gear item with NEITHER field populated (an ST created it, never filled in stats).
   Confirm by tracing the actual code which of the three contribute to the penalty sum and which don't
   - does the third (neither-shaped) item silently count as armour, silently count as nothing, or
   throw?
2. **Hand-trace `roll.js`'s and `roll-v2.js`'s weapon-reference filter and skill-bonus chip filter**
   for the SAME three-item scenario. Confirm the weapon-shaped item appears in the weapon reference
   panel, the armour-shaped item does NOT, and walk what happens to the neither-shaped item in both
   filters.
3. **`editor/sheet.js`'s new "Other Combat Gear" fallback section** - find it, and trace: is it
   genuinely reachable (i.e., does SOME code path actually classify an item into it), or is the
   filtering logic upstream (`isWeaponShaped`/`isArmourShaped`) written such that every combat_gear
   item necessarily matches one of the two shaped filters, making the fallback dead code? Read the
   actual filter predicates, don't assume from the section's existence that it's reachable.
4. **Route/consumer completeness**: grep the WHOLE repo (not just the files the diff touched) for any
   OTHER place that compares against the literal strings `'weapon'`, `'armour'`, `bucket === 'equipment'`,
   or `bucket === 'asset'` in a bucket-comparison context that this diff did NOT update. The story's own
   claim is that all direct consumers were updated - verify that by searching independently rather than
   trusting the claim. Distinguish a genuine miss (something that reads bucket values and will now
   silently misbehave) from an incidental/comment-only/cosmetically-stale reference (lower severity, if
   any).
5. **Malformed/absent input at the migration script's entry points**: what does `planBucketMigration`
   return for `null`, `undefined`, `{}`, and a document whose `bucket` is a number or an array instead
   of a string? Trace the actual code, not the tests' coverage of it.
6. **`character.schema.js`'s `container_id`**: is there ANY write-site code path (not shown in this
   diff, but reachable from it) that would accept a `container_id` value referencing an item that does
   NOT exist in the same character's equipment array, or that references itself (an item claiming
   itself as its own container)? The story claims this is "display-inert" rather than write-rejected -
   confirm no downstream consumer added in THIS diff actually crashes on such a dangling/self reference
   (search `editor/sheet.js` and any other touched file for a `container_id` read site, since the
   diff's own scope doesn't appear to include a container-assignment UI yet - confirm that's really
   true, i.e. nothing reads `container_id` at all yet, or if something does, that it fails soft).
7. **CSS bucket-tag classes** (`admin-layout.css`): confirm every one of the five new bucket values has
   a matching `.ec-bucket-<value>` rule, and that no OLD `.ec-bucket-weapon` etc. rule was left
   dangling (harmless but worth noting as a Low if so).

**STOP. Write your Pass 2 findings to `specs/stories/code-review/issue-1152-eqc1-codex-findings.md`
now, before reading further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/feature.1152.eqc1-bucket-container-schema.story.md` - the **Story**,
   **Background**, **The new taxonomy** table, and **Acceptance Criteria (1-7)** sections.
2. **Do NOT read the "Dev Agent Record" section yet** (Agent Model Used / Debug Log References /
   Completion Notes List / Change Log). Skip past it entirely for now.
3. Against the seven acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative.
   - AC #2's "single-level containment only" claim - is this enforced anywhere in code, or purely
     descriptive? If purely descriptive, is that a gap against the AC's own wording, or is the AC
     itself only claiming a schema-level absence of recursion support (which would be true simply by
     there being no code that walks a container chain)? Reason carefully about what the AC actually
     commits to versus what would be nice-to-have.
   - AC #4's list of "every direct reader" - cross-check against your own Pass 2 grep for completeness.
   - AC #5's "no behavioural regression for correctly-migrated data" - is this actually demonstrated by
     a test that proves OLD-shape-derived output equals NEW-shape-derived output for equivalent data,
     or merely asserted?
4. **Write your Pass 3a findings down now, before moving on.**

Explicitly settled/out of scope for this story, per its own account - do not flag these as gaps if
genuinely absent, but DO flag if quietly done anyway: on-me vs owned-elsewhere display; a
container-assignment UI (something letting an ST actually set `container_id`); programmatic purchase
flow; skill-based acquisition removal; recursive containment; running the live migration against
production `tm_suite` (explicitly disclosed as NOT done, a deploy-time action).

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes several specific, checkable claims:
   - The consumer blast-radius was originally scoped as 2 files (schema-only) and expanded to include
     14 files found via grep, with the final diff touching a named list of files.
   - `npm test`: 2463 total, 2458 pass, 5 pre-existing failures across 10 named test files - and a
     claim that these were **independently verified as pre-existing** via `git stash push` on the 13
     tracked EQC-1 files, re-running the same 10 previously-failing files against the clean base, and
     observing an **identical failure signature** (same file count, same test count, same test names),
     before `git stash pop` restored the changes.
   - "None of the 5 pre-existing failures reference equipment/bucket/armour/weapon/container in any
     way."
   - The live migration was deliberately NOT run against production `tm_suite`.
6. **Verify each claim by running it, not by reading it.** Run the equipment-related vitest suites
   yourself, right now (see Ground Rules for the list and the `mongod` caveat). If you have `mongod`
   available, additionally try to REPRODUCE the pre-existing-failure claim yourself: run the 10 named
   files (`epic.708.3-cycle-phase-controls`, `issue-1013-indomitable-rules-text`,
   `issue-1021-failed-breakpoint-merit`, `issue-811-sumchannels-rootcause`,
   `issue-826-cleanup-script-integration`, `issue-836-legacy-tracker-cache-removed`,
   `issue-837-xp-totals-deprecation`, `n7-n9-allocator-readers`, `n8-mandragora-prereq`,
   `oath-a-pledge-helpers`) against the CURRENT committed state (no stash needed - they should already
   fail identically, since the story's own claim is that these failures are unrelated and pre-existing)
   and confirm the failure count/names match what the story claims. If you don't have time/environment
   to fully reproduce the stash comparison, at minimum confirm these 10 files still show the same
   failure signature against current HEAD, and say plainly whether you attempted the deeper
   verification.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself be
   wrong - re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem. Given the live-game stakes (Game 7 is Saturday), be explicit about whether you'd
   trust this to run correctly against real character data TODAY if the migration script were applied.

---

## Output

Write everything to `specs/stories/code-review/issue-1152-eqc1-codex-findings.md`, grouped `## High` /
`## Medium` / `## Low`, each finding tagged with the pass that produced it (`[Pass 1]`, `[Pass 2]`,
`[Pass 3a]`, `[Pass 3b]`). Write `- None found.` under any empty heading rather than dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** - be concrete about what reaches it
- **The observable consequence** - what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened in each pass, and confirmation you did not read ahead.
- Every command you ran, with its real result, including the named vitest suites.
- **Anything you could not run, and why.** Name it specifically (e.g. no local mongod).
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
