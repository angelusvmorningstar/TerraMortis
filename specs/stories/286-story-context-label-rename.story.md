---
title: "DT Processing Step 3: clarify ST Notes vs Story Context labels + DB field rename"
issue: 286
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/286
branch: morningstar-issue-286-story-context-label-rename
status: review
type: enhancement
---

## Story

As an ST using DT Processing Step 3 (Feeding), I want the three Claude/player-destination fields to have unambiguous labels and consistent DB field names, so I know at a glance where each input goes.

## Background

Step 3 has three related inputs:
- **ST Notes** — multi-entry threaded notes, fed into the AI prompt
- **Story Context** — single-line narrative constraint injected as "do not contradict" into the AI prompt
- **Player Feedback** — verbatim note sent to the player

The first two are both Claude-facing, but only ST Notes labels itself that way ("— visible to Claude"). Story Context has no destination label, so STs can mistake it for player-facing text.

Additionally, the DB field that persists Story Context is named `player_feedback`, the exact inverse of its purpose. This naming confusion extends to the DT Story tab (where it's mislabelled "Player Feedback") and to the player-facing `story-tab.js` (where it leaks as a fallback for player display).

## Acceptance criteria

- [x] `player_feedback` field renamed to `story_context` across all JS consumers and default object initialisers.
- [x] Story Context input (`.proc-feedback-input`) displays label "Story Context — Claude narrative constraint".
- [x] All three sections in the DT Processing panel have a destination sub-label: ST Notes — "visible to Claude", Story Context — "Claude narrative constraint", Player Feedback — "sent to player".
- [x] DT Story tab feeding section: `fr.player_feedback` read updated to `fr.story_context`; label "Player Feedback" corrected to "Story Context".
- [x] Player-facing `story-tab.js`: `|| rev.player_feedback` fallback removed from both project-card render paths — `story_context` is Claude-only and must never show to players.
- [x] Schema definition `resolvedAction` in `downtime_submission.schema.js` gains `story_context: { type: 'string' }`.
- [x] Migration script `server/scripts/migrate-286-player-feedback-to-story-context.js` renames the field across all six review sub-arrays in live `downtime_submissions`.
- [x] Dev-fixture data (`public/js/dev-fixtures.js`) and mockup data (`public/mockups/data/downtime_submissions.json`) updated to use `story_context`.
- [x] AI prompt assembly unchanged — "Story context (do not contradict):" wording stays; only the field name read changes.

## Dev agent record

### Files changed

| File | Change |
|------|--------|
| `public/js/admin/downtime-views.js` | 9 changes: 6 default initialisers, read, save, label sub-text |
| `public/js/admin/downtime-story.js` | 4 changes: 3 AI prompt assembly reads, DT Story tab label fix |
| `public/js/tabs/story-tab.js` | Removed `player_feedback` fallback at 2 player-facing card render sites |
| `server/schemas/downtime_submission.schema.js` | Added `story_context: { type: 'string' }` to `resolvedAction` definition |
| `server/scripts/migrate-286-player-feedback-to-story-context.js` | NEW — migration script for live DB |
| `public/js/dev-fixtures.js` | 23 occurrences renamed (global replace) |
| `public/mockups/data/downtime_submissions.json` | 41 occurrences renamed (global replace) |

### Completion notes

All nine changes in `downtime-views.js` applied: six `player_feedback: ''` default initialisers across feeding/project/merit/sorcery/st_created/acquisition review paths; the read at line 7572; the save-on-blur at line 4998; and the label now reads "Story Context — Claude narrative constraint". Three AI prompt assembly sites in `downtime-story.js` updated. DT Story tab feeding section label corrected from "Player Feedback" to "Story Context". Player-facing `story-tab.js` fallback removed at both project-card render paths — `story_context` never surfaces to players. Schema `resolvedAction` definition updated. Migration script created for live data. Fixture and mockup data updated. All three JS files pass acorn parse check clean.

---

## Dev notes

### Summary of all changes

| File | Change |
|------|--------|
| `public/js/admin/downtime-views.js` | 8 targeted changes (read + save + 6 default initialisers + label) |
| `public/js/admin/downtime-story.js` | 4 targeted changes (3 AI prompt reads + 1 DT Story tab label) |
| `public/js/tabs/story-tab.js` | Remove `player_feedback` fallback at 2 sites |
| `server/schemas/downtime_submission.schema.js` | Add `story_context` to `resolvedAction` definition |
| `server/scripts/migrate-286-player-feedback-to-story-context.js` | NEW — migration script |
| `public/js/dev-fixtures.js` | Rename field in embedded fixture objects |
| `public/mockups/data/downtime_submissions.json` | Rename 41 occurrences |

---

### 1. `public/js/admin/downtime-views.js`

#### 1a. Read for display (line 7572)

```js
// BEFORE
const feedback = rev.player_feedback || '';

// AFTER
const feedback = rev.story_context || '';
```

#### 1b. Save on blur (line 4998)

```js
// BEFORE
await saveEntryReview(entry, { player_feedback: inp.value.trim() });

// AFTER
await saveEntryReview(entry, { story_context: inp.value.trim() });
```

#### 1c. Six default object initialisers (lines 3483, 3494, 3506, 3512, 3519, 3526)

Each of these has `player_feedback: ''` in the fallback object literal. Rename to `story_context: ''`.

| Line | Object created for |
|------|--------------------|
| 3483 | `feeding_review` |
| 3494 | `projects_resolved[n]` |
| 3506 | `merit_actions_resolved[n]` |
| 3512 | `sorcery_review[n]` |
| 3519 | `st_actions_resolved[n]` |
| 3526 | `acquisitions_resolved[n]` |

#### 1d. Label — add destination sub-label (lines 8355–8358)

```js
// BEFORE
h += '<div class="proc-detail-label">Story Context</div>';

// AFTER
h += '<div class="proc-detail-label">Story Context <span class="proc-label-sub">— Claude narrative constraint</span></div>';
```

This matches the existing pattern:
- ST Notes uses: `ST Notes <span class="proc-label-sub">— visible to Claude</span>` (line 8334)
- Player Feedback uses: `Player Feedback <span class="proc-label-sub">— sent to player</span>` (line 8363)

The compact panel version of ST Notes at line 6678 already has the sub-label — no change needed there.

---

### 2. `public/js/admin/downtime-story.js`

#### 2a. AI prompt assembly — three sites

All three are identical in form. The comment above each already says "Story context (ST-written context for AI prompt)".

```js
// BEFORE
if (rev.player_feedback) {
  lines.push('');
  lines.push(`Story context (do not contradict): ${rev.player_feedback}`);
}

// AFTER
if (rev.story_context) {
  lines.push('');
  lines.push(`Story context (do not contradict): ${rev.story_context}`);
}
```

Locations: lines 553–555, 767–769, 2188–2190.

#### 2b. DT Story tab — Feeding section label (lines 1204–1210)

`fr` is `sub.feeding_review || {}` (set at line 1153). The field reads `player_feedback` and labels it "Player Feedback" — this is wrong on both counts.

```js
// BEFORE
const feedback = fr.player_feedback || '';
h += `<div class="dt-feed-val-row dt-feed-val-feedback-row"><dt>Player Feedback</dt>`;

// AFTER
const feedback = fr.story_context || '';
h += `<div class="dt-feed-val-row dt-feed-val-feedback-row"><dt>Story Context</dt>`;
```

`player_facing_note` is the actual player-facing note and is rendered separately in the publish pipeline at lines 3175 and 3193 — those are untouched.

---

### 3. `public/js/tabs/story-tab.js`

Two project-card render paths fall back to `player_feedback` when `player_facing_note` is empty. After the rename, `story_context` is a Claude-internal field that must never surface to players. Remove the fallback.

```js
// BEFORE (lines 426 and 680)
const note = rev.player_facing_note || rev.player_feedback || '';

// AFTER
const note = rev.player_facing_note || '';
```

---

### 4. `server/schemas/downtime_submission.schema.js`

The `resolvedAction` definition (starting around line 514) defines fields common to all review sub-arrays. Add `story_context` alongside `player_facing_note`.

```js
// In the resolvedAction properties block — add after player_facing_note:
story_context:      { type: 'string' },
```

---

### 5. Migration script (NEW file)

Create `server/scripts/migrate-286-player-feedback-to-story-context.js`.

The script must rename `player_feedback` → `story_context` on the following sub-arrays inside every `downtime_submissions` document:
- `feeding_review` (object, not array — direct field rename)
- `projects_resolved[*]`
- `merit_actions_resolved[*]`
- `sorcery_review` (object keyed by index strings, not a true array — iterate keys)
- `st_actions_resolved[*]`
- `acquisitions_resolved[*]`

Pattern for each:

```js
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

async function run() {
  await client.connect();
  const db = client.db('tm_suite');
  const coll = db.collection('downtime_submissions');

  const subs = await coll.find({}).toArray();
  let updated = 0;

  for (const sub of subs) {
    const patch = {};

    // feeding_review (object)
    if (sub.feeding_review?.player_feedback !== undefined) {
      patch['feeding_review.story_context'] = sub.feeding_review.player_feedback;
      patch['feeding_review.player_feedback'] = undefined;  // will use $unset
    }

    // Array sub-fields
    for (const arrayField of ['projects_resolved', 'merit_actions_resolved', 'st_actions_resolved', 'acquisitions_resolved']) {
      (sub[arrayField] || []).forEach((item, i) => {
        if (item && item.player_feedback !== undefined) {
          patch[`${arrayField}.${i}.story_context`] = item.player_feedback;
          patch[`${arrayField}.${i}.player_feedback`] = undefined;
        }
      });
    }

    // sorcery_review (object keyed by index strings)
    for (const [k, v] of Object.entries(sub.sorcery_review || {})) {
      if (v?.player_feedback !== undefined) {
        patch[`sorcery_review.${k}.story_context`] = v.player_feedback;
        patch[`sorcery_review.${k}.player_feedback`] = undefined;
      }
    }

    if (Object.keys(patch).length) {
      const $set = {};
      const $unset = {};
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) $unset[k] = '';
        else $set[k] = v;
      }
      const op = {};
      if (Object.keys($set).length) op.$set = $set;
      if (Object.keys($unset).length) op.$unset = $unset;
      await coll.updateOne({ _id: sub._id }, op);
      updated++;
    }
  }

  console.log(`Migration complete. Updated ${updated} documents.`);
  await client.close();
}

run().catch(err => { console.error(err); process.exit(1); });
```

Run with: `node server/scripts/migrate-286-player-feedback-to-story-context.js`

---

### 6. Fixture data

**`public/js/dev-fixtures.js`** — the embedded `DT_SUBS` array contains review sub-objects with `player_feedback`. Do a global string replace: `"player_feedback":` → `"story_context":`. Confirm the file still parses cleanly after the replace.

**`public/mockups/data/downtime_submissions.json`** — 41 occurrences. Same global replace: `"player_feedback":` → `"story_context":`.

---

### Fields NOT renamed

- `rev.player_facing_note` — the actual player-facing note — untouched throughout
- AI prompt wording: "Story context (do not contradict):" — unchanged, only the field name read changes
- `server/migrate-dt1.js` — historical migration script, not a live route; leave as-is (it ran once and the data is already in the DB)

---

### Verification checklist

After implementing, confirm in-browser:

1. DT Processing Step 3 — Story Context input:
   - Label reads "Story Context — Claude narrative constraint"
   - Typing and blurring saves to `story_context` in the DB (check Network tab for the PATCH payload)
2. All three sections show their destination sub-labels (Claude / Claude constraint / Player)
3. Trigger a story generation (Step 7 or equivalent) — confirm the "Story context (do not contradict):" line still appears in the prompt when `story_context` has a value
4. DT Story tab Feeding section: "Story Context" row appears where "Player Feedback" used to be, with the correct value
5. Player-facing story tab: project cards do not show the old fallback content (only `player_facing_note` data appears under "ST Note")
6. No console errors on open or interaction
