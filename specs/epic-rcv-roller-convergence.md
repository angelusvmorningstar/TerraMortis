# Epic RCV — Roller Convergence

**Goal:** Bring the live Roll tab up to the consolidated design Angelus built across three separate
design passes — a recovered local dev-server prototype (`roller-live/`, 2026-08-21/22), and two
Claude Artifact mockups ("Roller Convergence", "Vampire Mechanics Mockup") — as a genuine refactor of
what's already shipped, not features bolted on top of it. Fix one real rules bug found along the way.

**Why:** Epic RLV (closed, done 2026-08-25) shipped the roller's own engine — the anchor number,
the Again control, the mod-chip persistence layer, the Free Build custom-pool wizard. What it didn't
touch is the layer above that engine: how the picker is organised (Skills/Disciplines share one
collapse toggle; "Vampire Mechanics" never collapses at all), what a selected power tells the player
about itself (nothing — the data exists, nothing renders it), and which special vampire mechanics
have a real UI path at all (three of eight do). Angelus designed the fix for all of this in a working
prototype, then in two Artifact mockups reconciling that prototype against what's actually live — this
epic is the story-by-story port of that already-settled design into the real app.

**Source:**
- `TM Game/scratchpad/roller-live-recovered/` — a byte-exact reconstruction (255/255 write/edit
  operations replayed clean from that session's own transcript, after the original temp files were
  wiped) of a local Node dev server Angelus ran against real character fixtures on port 5175. This is
  the **primary design source for every story below** — a complete, working implementation of the
  target UI, not a mockup of one.
- "Roller Convergence" (Claude Artifact, `https://claude.ai/code/artifact/9cbf6e50-1cc4-45e0-a8cc-6b50a3e06e84`)
  — the corrected, consolidated presentation of the same design, reconciled against the live app's own
  real component names during this epic's own scoping session. Use this for the overall shape at a
  glance; use `roller-live/app.js` directly for exact copy, exact markup, exact class names.
- GitHub issue #1039 — the epic's nominal ancestor, badly stale (wrong section names, missing 5 of 8
  special mechanics, carries a Social Manoeuvring item that's being retired elsewhere, and its
  Humanity Check line is now settled the opposite way — see the locked decision below). **Close #1039
  as part of rcv.0**, referencing this doc as its replacement, rather than editing it in place.
- A `bmad-party-mode` roundtable (Dana, Winston, Sally, John — 2026-08-30) scoped this story list and
  surfaced the schema/architecture questions below. Full transcript in this epic's own session; key
  findings folded into the stories directly.

**A rule this epic must not break, found scoping it:** whoever builds a story below reads the actual
`roller-live/app.js` region cited in that story's own Dev Notes before writing anything — not this
doc's summary of it, not an inference from the class names. Two real mistakes already happened this
way during scoping: an early pass on the "Roller Convergence" Artifact used the wrong real modal
component (guessed from an older mockup instead of checking the recovered code, which uses a
different one — `.fb-modal`, not `#panel`); a first scoping pass treated the Special-tile rules copy
as a content gap needing fresh authoring, when it was already fully drafted in `app.js`'s own
`power-desc` paragraphs, just never checked. Ground every design-lock in the file itself.

## Locked decisions (Angelus, 2026-08-30 — do not re-litigate)

1. **Humanity Breaking Point level selection stays ST-only.** The prototype's own player-side
   grid+examples+nav picker (`app.js:793-897`) is **not** being built. The live gdx.12 flow — player
   submits blind, ST picks the level and confirms in the admin Approval Queue — is correct as-is and
   unchanged by this epic. `rcv.7` is scoped down accordingly (see its own row).
2. **A Rules-explanation box for plain Skills is not wanted.** `purchasable_powers` has zero
   cost/action/duration/description data for Skills, and `char-pools.js:183` never routes skill pools
   through `getPool()` at all — there is no gap to fill. Skills are explicitly out of `rcv.3`.
3. **The Special-tile rules copy is not a content-authoring task.** It is already fully drafted,
   mechanically precise, page-cited, house-errata-aware text sitting in `roller-live/app.js`'s own
   `power-desc` paragraphs (see `rcv.3c`'s own line citations). The work is porting it, not writing it.

## Stories

| ID | Story | Depends on | Roller-live source |
|---|---|---|---|
| rcv.0 | Close #1039; this doc is its replacement | — | — |
| rcv.1 | Fix the Riding the Wave bug | — | `app.js:181-190` (comment), server.mjs's own "Special rolls" comment |
| rcv.2 | Skills / Disciplines / Special as three independent accordions | — | `app.js:237` (`sectionOpen`), `app.js:1799-1822` (the three-section markup) |
| rcv.3a | Rules-explanation box — Disciplines / Rites | rcv.2 | `app.js:1225-1240`-ish (generic power block), `pools.js`'s own `info` object |
| rcv.3b | Rules-explanation box — Devotions, with a missing-duration fallback | rcv.3a | same as 3a; `purchasable_powers` devotion docs are 48/54 missing `duration` |
| rcv.3c | Port the drafted Special-tile rules copy | rcv.2 | see the per-mechanic line list below |
| rcv.4 | Surface the mod chips out of the buried disclosure | — | `power-mod-chips.js` (unchanged), `roll-v2.js:479-491` (current render site) |
| rcv.5 | Build Detecting Blood Sympathy against `#panel`, not `.fb-modal` | rcv.2 | `app.js:684-735`, `app.js:101-111` (`BLOOD_SYMPATHY_TIERS`) |
| rcv.6 | Build Surprise/Perception against `#panel`, not `.fb-modal` | rcv.2 | `server.mjs:226-247` (no-choice special, served straight from the server) |
| rcv.7 | Humanity Breaking Point — surface the drafted rules text ST-side only | — | `app.js:1276-1294` |

### rcv.0 — Close #1039

Close the issue with a comment pointing at this doc. Do not re-word #1039's own body — its scope has
moved on too far (four other epics already took bites out of it); a fresh doc is honester than an
edited-in-place one.

### rcv.1 — Fix the Riding the Wave bug (do this first, alone)

**The bug, live in production today:** `public/js/game/char-pools.js`'s `VM_IMMEDIATE` array lists
"Riding the Wave" as its own independently-rollable Wits+Composure pool, alongside Frenzy Resistance.
It isn't a real mechanic — per the actual rule (and confirmed against `roller-live/server.mjs`'s own
comment, which only ever builds a single `resistfrenzy` special), Riding the Wave is a Willpower
spend made **about a frenzy a failed Frenzy Resistance roll already triggered**, not a second dice
pool. Every tap of the live tile today writes a `roll_log` row for a roll that shouldn't exist.

**Fix:** delete the `Riding the Wave` entry from `VM_IMMEDIATE`. Frenzy Resistance's own tile gains a
short note (subtitle or Rules-explanation line, once `rcv.3c` lands) naming Riding the Wave as the
follow-up choice on a failed roll. Do not build it as its own launcher/modal — it is not a pool, it's
a Willpower-spend decision layered onto an existing roll's outcome.

**Scope note (Dana, party-mode):** no schema change. Nothing reads a stored "Riding the Wave" result
downstream — verify this directly before shipping (grep `roll_log` consumers for the literal label),
but don't scrub historical bad rows; not worth the ceremony.

**Sequencing (Winston, party-mode):** land this alone, first, before any of `rcv.2` onward touches the
Special section — otherwise the fix is buried in a much bigger diff and harder to review/revert on
its own.

### rcv.2 — Three independent accordions

Today: `char-pools.js` has exactly ONE `localStorage['tm_pools_collapsed']` toggle covering Skills +
Disciplines combined; "Vampire Mechanics" is a fixed heading that never collapses. The consolidated
design (`app.js:237`, `sectionOpen: { secQueue: true, secSkills: false, secDisc: false, secSpecial:
false }`, rendered `app.js:1799-1822`) makes Skills, Disciplines, and Special three independent
accordions, each its own `data-open` state, chevron, and count badge — all closed by default except
Queue (Queue itself is CRD's own contested-roll inbox, out of scope for this epic; see the note below).

**Must carry forward, not just re-skin (John, party-mode):** `char-pools.js:188-198`'s existing
rank-gate filter on the discipline list (only shows disciplines the character actually has dots in)
has to survive the restructure. Put it in the story's own AC explicitly.

**State-shape change, not just CSS (Winston, party-mode):** the collapse-state key becomes per-section.
Existing users' stored `tm_pools_collapsed` preference needs either a migration or an accepted silent
reset to default-collapsed — pick one and say so in the story, don't leave it implicit.

**Out of scope:** the Queue accordion (`secQueue` in the recovered build) is CRD's contested-roll
inbox — a separate epic already covers it. Don't port it here.

### rcv.3a / rcv.3b — Rules-explanation box, Disciplines/Rites/Devotions

The data already exists and is already computed — `public/js/shared/pools.js`'s `getPool()` returns a
full `info` object (`{ d, a, s, r, c, ac, du, ef }` — parent/attr/skill/resistance/cost/action/
duration/description) for every Discipline and Rite pool today; it's simply never rendered. This is a
template change against existing data, not a new data source. `purchasable_powers` coverage: Discipline
(50 docs) — 0 missing action/description, only 8 missing cost, 6 missing duration. Rite (132 docs) —
similarly solid.

Devotions (54 docs) are thinner — 48/54 missing `duration` — so `rcv.3b`'s own AC needs an explicit
"duration not specified" fallback rather than a blank field or a crash.

Reference the recovered build's own rendering shape at `app.js:1225-1240` (the generic power block) for
exact structure — the box is a `<details class="rules-summary">`, open by default in the mockup for
visibility, collapsed in the real shipped default state to match every other accordion in this epic.

### rcv.3c — Port the drafted Special-tile rules copy

This is a **copy port, not authoring.** Every special mechanic already has full, rules-accurate,
page-cited text sitting in `roller-live/app.js`. Read each cited range in full before writing the
real app's version — quote it, don't paraphrase it:

- **Lashing Out** — `app.js:1246-1247` (aspect description, Willpower cost by target, what happens if
  the target fights back)
- **Detecting Blood Sympathy** — `app.js:1259-1260` (outcome tiers, force-vs-passive cost)
- **Resist Blood Bond** — `app.js:1272-1273` (the Willpower-doesn't-add-dice rule, the cumulative -1
  penalty on repeated resistance)
- **Humanity Breaking Point** — `app.js:1292-1294` (the full Terra Mortis errata pool formula, all
  four outcome tiers, the immunity-bane rule) — needed for `rcv.7` specifically
- **Clash of Wills** — `app.js:1306-1307` (the contested roll-off mechanic, the duration-bonus
  interaction, the Willpower-presence caveat)
- **Surprise / Perception** — `app.js:1319-1320` (the ambush mechanic, the can't-act/can't-Defend
  consequence) — needed for `rcv.6`
- **Resisting Frenzy** — `app.js:1332-1333` (the Willpower-holds-off-the-Beast mechanic — a stall, not
  +3 dice — all four outcome tiers) — needed for `rcv.1`'s own Riding the Wave note
- **Defensive Reaction** — `app.js:1345-1347` (CRD's own contested-defence pool; likely out of this
  epic's scope, confirm against Epic CRD before porting)

Land this after `rcv.2` (the Special section needs to exist to hold it), and note it directly unblocks
part of `rcv.1`'s own "Riding the Wave" subtitle and all of `rcv.7`.

### rcv.4 — Surface the mod chips

`power-mod-chips.js` is fully shipped and correct (rlv.7) — persistent per-`(character, power)`
localStorage chips, already imported and wired into `roll-v2.js`. The only defect is placement: it
renders today inside `<details class="rv2-breakdown">` (`index.html:250-264`), collapsed, which a
player has no reason to ever open — so a real, working feature is effectively invisible. This story
is a DOM re-parent, nothing else. **Do not reimplement the chip logic** — the recovered prototype has
its own from-scratch chip state model; none of it should leak into this story, which only needs to
move the real render call.

**Regression class to test for (Sally/Dana, party-mode):** the chip storage key is
`tm-rlv7-chips-${charId}|${powerName}`, and that `|` separator was the site of a real cross-character
leak bug once (since fixed, unescaped-separator collision). If this story touches how `powerName`
strings get generated anywhere nearby, treat that as a regression class to test, not assume safe.

### rcv.5 / rcv.6 — Detecting Blood Sympathy, Surprise/Perception

Both net-new to the live app — confirmed zero pool math for either exists there today. Both exist
fully working in the recovered build. **Build against the real app's existing `#panel`/`#panel-overlay`
sheet** (`public/index.html:348-349`) — the same component Lashing Out, Clash of Wills, and Resist
Blood Bond already use live — **not** `.fb-modal`, which is a prototype-only component with zero
matches anywhere in `public/`. Acceptance criteria should say this explicitly ("uses `openPanel()`, no
new modal component") so it can't slip through during the port.

- Blood Sympathy: `app.js:684-735` (two-step wizard — which relation tier, then passive vs forced),
  tier data `app.js:106-111`.
- Surprise/Perception: server-side only in the recovered build (`server.mjs:226-247`, "no-choice
  special... Wits+Composure") — no client wizard needed, it's an immediate-roll tile like Frenzy
  Resistance.

**Not a shared data shape (Sally, party-mode):** the five choice-rolls are each hand-coded inline in
`app.js` with their own option lists — no shared per-roll-type collection. Fine to keep doing this for
these two; if a sixth special roll ever turns up, that's the point to ask whether this deserves a real
shared shape instead of six copies of the same hand-rolled pattern. Not this epic's problem.

### rcv.7 — Humanity Breaking Point, ST-only, rules text

**Scope after the locked decision above: no schema change, no player-facing level picker.** The live
gdx.12 flow (player submits blind, ST picks the level and confirms in the Approval Queue,
`server/routes/humanity-check.js`, `requireRole('st')`-gated at accept) is correct and stays exactly
as it is.

**The one open piece:** the drafted rules text (`app.js:1276-1294` — the full errata pool formula, all
four outcome tiers) currently exists nowhere in the live app at all, ST or player side. Design-lock
question for this story specifically, not assumed here: does it get surfaced in the admin Approval
Queue (so the ST sees the formula/outcomes while picking the level), on the player's own submit
screen (informational only, since they can't act on it), both, or neither? Ask before storying.

## What this epic is not

- Not a rebuild of the roller engine — `roll-v2.js`'s anchor number, Again control, and Free Build
  wizard are all Epic RLV's own shipped work, untouched here.
- Not a merge of `roller-live/app.js` into the real app — it is reference material only, a complete
  standalone prototype with its own state model and zero shared imports with the live app. Every story
  re-expresses its target behaviour against the real `char-pools.js`/`roll-v2.js`/`power-mod-chips.js`
  data model from scratch.
- Not the Queue/contested-roll inbox (`secQueue` in the recovered build) — Epic CRD's own scope.
- Not Social Manoeuvring's status-diff auto-mods (#1039's own item 3) — the mechanic is being retired
  by ST ruling; carrying it forward here would be building for something that no longer exists. If the
  SM retirement work touches `contested_roll_requests` broadly rather than scoping to
  `request_type: 'contested_roll'`, it risks Humanity Check and Status Actions as collateral damage
  (they share the same collection via a discriminator) — flagged for whoever picks up that retirement,
  not this epic's own job to fix.
