---
id: dtui.21
epic: dtui
status: will-not-implement
priority: medium
depends_on: []
---

# Story DTUI-21: Personal Story — character's NPC correspondents wired in as selectable chips alongside freetext

As a player writing about my character's off-screen NPC interactions,
I want my character's existing NPC correspondents to appear as selectable chips alongside the freetext,
So that I can quickly tag known NPCs without retyping them every cycle.

**STATUS: CLOSED — WILL NOT IMPLEMENT. Ruled by Angelus (2026-08-25):**

> "NPCs are being handled entirely by TM Story. This is a data custody thing that's already been settled."

**This is a cross-repo data-custody decision, not an internal feature-retirement question.**
NPC/correspondent data belongs to **TM Story** (`../TM Story`, the sibling read-only companion-site
repo — see the umbrella `CLAUDE.md` at `D:\Terra Mortis\CLAUDE.md`, "Repo topology"). TM Game does not
own that data and will not build UI over it — not now, not later in this epic, regardless of which
internal ADR or retirement story happens to be governing the DT form's NPC chrome at any given moment.
FR4 is closed for this reason. The internal evidence chain this story originally surfaced (ADR-003,
dt-form.18/.33, commit `8d12cede`) is kept below as supporting context — it happens to point the same
direction (don't build this here) but it is no longer the *authoritative* reason. The authoritative
reason is data custody: this data doesn't live in this repo, so no story in TM Game should be reading
or rendering it, independent of whether TM Game's own internal NPC-suppression policy is ever revisited.

---

## Context

**FR4** (epic doc, `specs/epic-dtui-downtime-form-ux-refactor.md` FR Coverage Map): *"Personal Story
section presents NPC correspondents from the character's NPC list as selectable chips, in addition to
existing freetext."* Epic doc Story 1.21 (`specs/epic-dtui-downtime-form-ux-refactor.md`
~line 1038-1066), Wave 4.

The epic's own source document is `specs/ux-design-downtime-form.md`, a UX design spec whose 14-step
BMAD workflow completed **2026-04-29** (epic doc frontmatter). FR4 reflects the DT form's shape as it
stood on that date — the tail end of Epic NPCR (`specs/epic-npcr.md`), when the Personal Story section
briefly did read from the relationships graph (NPCR-12, implemented 2026-04-24: a `<select>` picker
sourced from `GET /api/relationships/for-character/:myCharId`, grouped by kind family, including the
`correspondent` relationship kind FR4 is presumably describing).

### Supporting context — internal evidence chain (no longer the primary reason, kept for the record)

The paragraphs below were this story's original finding, written before Angelus's data-custody ruling
above. They document a genuine, separate internal conflict (TM Game's own ADR-003 policy vs. FR4) and
remain useful background for anyone auditing the DT form's NPC-chrome history, but they are now
secondary: even if TM Game's own internal NPC-suppression policy were reversed tomorrow, FR4 would
still be closed, because the underlying data is not TM Game's to read or render at all — it is
TM Story's. Do not read the rest of this section as "the blocker" — the blocker is the custody ruling
above. This is "why the internal signals also happened to point the same way."

**That relationship-backed picker was deliberately removed eight working days later, and the removal
has not been reversed since.** This is not stale wording (the dtui-23 kind of gap, where the epic
describes UI that already changed cosmetically) — it is an active product decision, made and enforced
across several separate stories and commits, most recently by Angelus directly:

1. **ADR-003** (`specs/architecture/adr-003-dt-form-cross-cutting.md`, status `approved`, dated
   **2026-05-06** — one week after FR4's own source UX doc), §Out-of-scope: *"NPC selector
   replacement. Task #33 removes NPC selectors entirely; if NPCs come back to the form later, they will
   need their own picker variant. Not addressed here."* Its own §Q2 records Piatra's verbatim
   instruction: *"all NPC interactions are being suppressed until next release cycle."*
2. **dt-form.18** (`specs/stories/dt-form.18-personal-story-reduce.story.md`, done) implemented that
   instruction for Personal Story specifically: removed the NPCR-12 relationship picker and the legacy
   DB-relational NPC card picker, replacing both with the current binary
   (Touchstone/Correspondence radio + **free-text-only** "Person involved" name input + description
   textarea). The free-text field was kept on purpose — explicitly called out as "categorically
   different from an NPC interaction" — but any DB-backed picker was not.
3. **dt-form.33** (`specs/stories/dt-form.33-npc-selectors-remove.story.md`, done, closes issue #84)
   swept the rest of the form for any remaining NPC-selector chrome and deleted it, plus the
   `GET /api/npcs/for-character/:characterId` route feeding it entirely (commit `e9072ebb`).
4. Related, independent removals across the same window confirm this was a sustained direction, not one
   story's local call: `15380ecd` removed the DB-relational NPC picker from the character-sheet
   Touchstone edit view (#162, "cycle-blocker"); `e6a3a1e8` removed the "Existing NPC" option from the
   player-facing Relationships-tab picker; `f1cb1c24` scoped the NPC quick-add chip to ST role only
   (#232); NPCR-14 (`specs/stories/npcr.14.directory-scope-to-player-creations.story.md`, done) locked
   `GET /api/npcs/directory` down so a player can only ever see NPCs *they themselves* quick-added, not
   the general register.
5. **Most decisively:** commit `8d12cede`, authored directly by Angelus (not an agent), dated
   **2026-05-09**, three days after ADR-003: *"fix(nav): hide unfinished NPCs tile from player
   more-grid — the feature is unfinished and not ready for player use."* The whole Relationships/NPC
   tab was pulled from player navigation entirely and re-flagged `stOnly: true`. This is the single
   clearest signal available that reintroducing an NPC-backed picker into a player-facing surface is a
   product call outside this story's authority, not an oversight to quietly fix.
6. The live code confirms all of the above landed and stuck: `renderPersonalStorySection()`
   (`public/js/tabs/downtime-form.js:4561-4620`) is exactly the dt-form.18 binary-plus-freetext shape
   today, with an explicit comment: *"The legacy NPC card picker (DB-relational, suppressed under the
   broader NPC-interaction policy) is removed; the free-text NPC name input is RETAINED because a typed
   string is categorically different from an 'NPC interaction.'"* `collectResponses()` around
   `downtime-form.js:619-625` reads `story_moment_relationship_id`/`story_moment_note` defensively
   (`if (relIdEl) ...`) purely to silent-leave legacy drafts — no current render path emits those
   elements (confirmed by the comment at `downtime-form.js:2740-2743`: *"No DOM element with id
   `dt-story_moment_relationship_id` is rendered anywhere now."*). `import { charPicker }` at
   `downtime-form.js:34` still imports the universal character picker (ADR-003 Q6, `scope: 'all'`),
   used for regular character-to-character targeting elsewhere in the form (per dtui-20's own notes) —
   but that component picks *player characters*, not NPCs, and is unrelated to FR4's ask.

### Why "just build the chip grid anyway" is not a safe reading of the epic

FR4's own wording — *"NPC correspondents from the character's NPC list"* — requires reading NPC data
scoped to the player's own character. No such player-facing read path currently exists:

- `GET /api/npcs` and `GET /api/npcs?is_correspondent=true` are ST/dev-only (`server/routes/npcs.js`;
  dtosl.1's own AC3 pins this: a non-ST caller gets 403).
- `GET /api/npcs/for-character/:characterId` — the one endpoint that would have served exactly this —
  was deleted outright (`e9072ebb`, dt-form.33).
- `GET /api/npcs/directory` (NPCR-14) is the closest surviving player-reachable endpoint, but by
  deliberate design it returns **only NPCs the calling player personally quick-added**, not "the
  character's NPC list" in the sense FR4 means (ST-authored correspondents, sires, cult contacts,
  etc.) — and it powers the Relationships tab, which is itself `stOnly: true` and unreachable by
  players in the live nav.
- The `is_correspondent` flag (`dtosl.1`, live in `server/schemas/investigation.schema.js`) is real and
  still exists, but it has never had a player-facing read path — DTOSL-2 (the story meant to add one,
  `specs/stories/dtosl.2.choice-selector-contextual-dropdown.story.md`) was itself superseded by
  NPCR-12/13 before it shipped a player endpoint, and NPCR-12 was in turn retired by dt-form.18/.33
  before *that* endpoint could be reused. There is no live route today that would let a player list
  their own character's correspondent-flagged NPCs.

Building FR4 as literally scoped therefore means: (a) reversing a directly-authored, cross-story,
several-week-sustained product decision without being asked to, and (b) standing up new player-facing
read access to NPC data that has been deliberately kept ST-only through at least four separate
hardening passes (dt-form.33, `15380ecd`, `f1cb1c24`, NPCR-14). Neither is a "Filter-to-Context per
Section" UI story — both are product/security decisions that belong to the ST team, not to a Wave 4
chip-grid story picked up mechanically off the epic's FR coverage map.

### What this story does NOT do

- Does not add a `.dt-chip-grid` (or any chip UI) to the Personal Story section.
- Does not add or restore any player-facing NPC/relationship read endpoint.
- Does not touch `public/js/tabs/downtime-form.js`, `public/js/tabs/downtime-data.js`,
  `server/routes/npcs.js`, or any NPC/relationship schema.
- Does not modify `server/schemas/character.schema.js` (confirmed untouched and uncommitted in the
  working tree at the time this story was picked up — that is a separate concurrent session's own work
  per this session's own instructions, left alone).

---

## Resolution

Angelus ruled 2026-08-25 (quoted in full at the top of this file): NPC/correspondent data is owned and
handled entirely by **TM Story**, per an already-settled cross-repo data-custody decision. This maps to
what this story originally called "Option 1, defer FR4 entirely" — but the reasoning is sharper than a
mere deferral: it is not that TM Game *could* build this later if its own internal policy changes, it is
that TM Game **should not build UI over this data at all**, because the data does not belong to this
repo. The two options this story originally floated for "bringing NPC chips back into TM Game" (re-open
the internal suppression policy; reuse the existing quick-add-only directory endpoint) are both moot —
neither would change which repo owns the data, so neither is a live path forward here regardless of
TM Game-internal policy. If NPC-correspondent chips for Personal Story are ever wanted, that is a
TM Story-side feature (or a TM Story-to-TM Game read integration explicitly scoped as such, which is a
much larger cross-repo decision than a Wave 4 UI story), not something dtui-21 or any of its
Wave-4 siblings should attempt.

**Follow-up for whoever reopens the epic doc:** `specs/epic-dtui-downtime-form-ux-refactor.md`'s FR4 row
has been updated (see that file directly) to record will-not-implement and this same custody reasoning,
so the FR doesn't get mechanically re-picked-up off the coverage map without the context surfacing
again.

---

## Files in scope

None — no implementation was made. This story file is the only artefact this pass produces.

---

## Acceptance Criteria

Not evaluated — will not implement (see "Resolution" above). The epic's own Story 1.21 ACs are
reproduced here for reference only, unchanged from `specs/epic-dtui-downtime-form-ux-refactor.md`:

- AC1: a character with ≥1 NPC correspondent sees a `.dt-chip-grid` (multi-select) alongside the
  existing freetext when Personal Story renders.
- AC2: a character with none sees only the freetext field (no empty chip-grid placeholder).
- AC3: ticking NPC chips records the tagged NPCs as part of the Personal Story entry per existing
  schema.
- AC4: existing freetext continues to accept free-form narrative beyond the listed NPCs.

---

## Definition of Done

- [x] Investigation complete: the conflict between FR4 and the live ADR-003/dt-form.33/`8d12cede`
      product direction is documented with primary sources (ADR text, story files, commit hashes).
- [x] Angelus ruled on the underlying cause (2026-08-25): data custody — NPC/correspondent data belongs
      to TM Story, not TM Game. Quoted verbatim at the top of this file.
- [x] Story closed as `will-not-implement`. Epic doc's FR4 coverage row updated to match. Sprint status
      updated to `will-not-implement`.
- No code changed. No tests run (nothing to test). No commit beyond doc updates (this story file, the
  epic doc's FR4 row, `sprint-status.yaml`).

---

## Compliance

Not applicable — no UI or data-layer change was made.

---

## Dependencies and Ordering

- **Closed, not blocked.** This is a terminal state, not a pending dependency — see "Resolution" above.
  Nothing unblocks this story; it will not be picked up again under the dtui epic.
- **Does not block:** dtui-22 (Mandragora/Vitae Projection) — confirmed disjoint, different section,
  different files, ran concurrently in a sibling worktree this session.

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Completion Notes

Followed the same investigation discipline dtui-23 used for its own "epic premise is partly stale"
section, but the finding here is a different shape and a different severity: not a cosmetic drift
between the epic doc and the current file layout, but a direct, repeatedly-reaffirmed, partly
Angelus-authored product decision (culminating in commit `8d12cede`, 2026-05-09, "the feature is
unfinished and not ready for player use") to keep all NPC/relationship data out of player-facing UI.
Implementing FR4 literally would mean quietly reversing that decision and opening a new ST-only-to-
player data boundary, which is not something a Wave 4 "filter-to-context" story has standing to do on
its own judgement.

Traced the full chain primary-source by primary-source rather than trusting any one summary:
`specs/architecture/adr-003-dt-form-cross-cutting.md` (the locked ADR and its Q2 quote), the two
stories that executed it (`dt-form.18`, `dt-form.33`), `git log --oneline --all | grep -i npc` for the
surrounding commit pattern (four independent removal commits across sires/touchstones/quick-add/
directory, not just the DT form), the live `renderPersonalStorySection()` and `collectResponses()` code
in `downtime-form.js` to confirm nothing of the relationship picker actually renders today, and
`server/routes/npcs.js` / `dtosl.1` / NPCR-14 to confirm no player-reachable endpoint exists that could
even feed a correspondent-chip grid without new server work.

No code was written. No branch scope beyond this file. `server/schemas/character.schema.js` was
checked and confirmed untouched/uncommitted in this worktree — left alone per this session's own
instruction, unrelated to this investigation.

**Closure (same session, follow-up turn):** the investigation above was handed to Angelus, who ruled
the real cause is cross-repo data custody — NPC/correspondent data belongs to TM Story, not TM Game —
which subsumes and sharpens the original internal-conflict finding rather than replacing it outright
(the internal ADR-003/dt-form.33/`8d12cede` chain independently also argued against building this, but
the custody ruling is now the authoritative reason regardless of that internal history). Story closed
`will-not-implement`. Updated this file, `specs/epic-dtui-downtime-form-ux-refactor.md`'s FR4 coverage
row, and `specs/stories/sprint-status.yaml`'s dtui-21 line to match, then committed doc-only.

### File List

- `specs/stories/dtui-21-personal-story-npc-chips.story.md` — new, then updated to closed
  `will-not-implement` with Angelus's ruling
- `specs/epic-dtui-downtime-form-ux-refactor.md` — FR4 coverage-map row updated to note
  will-not-implement / data-custody reason
- `specs/stories/sprint-status.yaml` — dtui-21 line updated to `will-not-implement`
