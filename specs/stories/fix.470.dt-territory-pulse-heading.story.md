---
issue: 470
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/470
branch: ms/issue-470-dt-territory-pulse-heading
status: review
date: 2026-05-22
---

# fix.470 — DT player report: Territory Pulse renders under Feeding heading as raw text

## Story

As a player viewing my downtime report,
I want the Territory Pulse to appear under its own section heading, separate from Feeding,
so that the pulse narrative is clearly distinguishable from my personal feeding outcome.

## Background

`compilePushOutcome` in `downtime-story.js` builds Territory Pulse chunks at line 3601
with a `### ` prefix, then joins them into the `## Feeding` section block at lines 3606-3610:

```js
// line 3601 — WRONG prefix
pulseChunks.push(`### Territory Pulse — ${terr.name}\n\n${pulse.trim()}`);

// lines 3606-3610 — pulses buried inside the Feeding block
if (narrativeText || pulseChunks.length) {
  const sectionParts = ['## Feeding'];
  if (narrativeText) sectionParts.push(narrativeText);
  if (pulseChunks.length) sectionParts.push(pulseChunks.join('\n\n'));
  parts.push(sectionParts.join('\n\n'));
  hasContent = true;
}
```

`parseOutcomeSections` (helpers.js:287) splits only on `## ` lines. Because the
Territory Pulse uses `### `, it is never treated as a new section — it falls into the
Feeding section body, and the three `#` characters appear as literal text in the player
report.

Confirmed in Anichka's DT 3 report (dev): "### Territory Pulse — The North Shore"
renders as a raw paragraph inside the FEEDING section.

## Acceptance Criteria

- [ ] AC1: A submission with a Territory Pulse block in `published_outcome` renders
  a distinct section heading for each Territory Pulse, clearly separated from Feeding.
- [ ] AC2: The `###` characters do not appear as visible text in the player report.
- [ ] AC3: The Feeding section (player's own feeding narrative) is unaffected — its
  heading and body text render as before.
- [ ] AC4: A submission with no Territory Pulse block renders identically to before —
  no empty or spurious section heading appears.

---

## Dev Notes

### File to modify — ONE file

**`public/js/admin/downtime-story.js`** — function `compilePushOutcome`, lines 3601 and 3606-3610.

Do NOT touch: `parseOutcomeSections`, `renderOutcomeWithCards`, `story-tab.js`,
`helpers.js`, or any CSS.

### Exact fix — two adjacent changes in the same block

**Locate this block (lines 3592-3611 approximately):**

```js
const pulseChunks = [];
const noFeed = sub.feeding_review?.pool_status === 'no_feed';
if (!noFeed && cyc?.territory_pulse) {
  for (const terr of _feedTerrEntries(sub)) {
    if (terr.id === 'barrens') continue;
    const tDoc = _currentTerritories.find(t => t.slug === terr.id);
    const tOid = tDoc ? String(tDoc._id) : null;
    const pulse = tOid && cyc.territory_pulse[tOid]?.draft;
    if (pulse?.trim()) {
      pulseChunks.push(`### Territory Pulse — ${terr.name}\n\n${pulse.trim()}`);
    }
  }
}

if (narrativeText || pulseChunks.length) {
  const sectionParts = ['## Feeding'];
  if (narrativeText) sectionParts.push(narrativeText);
  if (pulseChunks.length) sectionParts.push(pulseChunks.join('\n\n'));
  parts.push(sectionParts.join('\n\n'));
  hasContent = true;
}
```

**Replace with:**

```js
const pulseChunks = [];
const noFeed = sub.feeding_review?.pool_status === 'no_feed';
if (!noFeed && cyc?.territory_pulse) {
  for (const terr of _feedTerrEntries(sub)) {
    if (terr.id === 'barrens') continue;
    const tDoc = _currentTerritories.find(t => t.slug === terr.id);
    const tOid = tDoc ? String(tDoc._id) : null;
    const pulse = tOid && cyc.territory_pulse[tOid]?.draft;
    if (pulse?.trim()) {
      pulseChunks.push(`## Territory Pulse — ${terr.name}\n\n${pulse.trim()}`);
    }
  }
}

if (narrativeText) { parts.push(`## Feeding\n\n${narrativeText}`); hasContent = true; }
for (const chunk of pulseChunks) { parts.push(chunk); hasContent = true; }
```

**What changed:**
1. `### ` → `## ` on the pulseChunks.push line — makes each pulse a `## `-level section
   that `parseOutcomeSections` will split on correctly.
2. The Feeding block is decomposed — Feeding is only pushed when there is feeding
   narrative text, and each pulse chunk is pushed independently to `parts`. This
   prevents a spurious empty `## Feeding` heading appearing when there is no feeding
   narrative but territory pulses exist.

### Why `parseOutcomeSections` now splits correctly

`parseOutcomeSections` in helpers.js:287 splits line-by-line on `line.startsWith('## ')`.
With `## Territory Pulse` as the prefix, the player report will produce:

```html
<div class="story-section">
  <div class="story-section-header">
    <h4 class="story-section-head">Territory Pulse — The North Shore</h4>
  </div>
  <div class="story-section-body">
    <p>…pulse text…</p>
  </div>
</div>
```

No CSS changes needed — `.story-section-head` already covers this.

### Multiple territories

A player who fed in two territories will produce two separate `## Territory Pulse — <name>`
sections in order. Each is pushed independently to `parts` so they appear in feed-order
after the Feeding section (or at the start of the outcome if there is no feeding narrative).

### Impact on existing published outcomes

Already-stored `published_outcome` strings in MongoDB will not be changed — the fix
only affects future `compilePushOutcome` calls. The STs must run **Publish All** on the
relevant cycle to update existing outcomes.

### Parse check (required after edit)

```
node --check --input-type=module < public/js/admin/downtime-story.js
```

Must exit 0.

### Prior art

`fix.468` used the same approach for `general_notes` — adding a `## ` prefix so
`parseOutcomeSections` treats it as a new section. This fix extends the same pattern
to Territory Pulse, with the additional step of separating pulses from the Feeding
block assembly.

---

## Tasks / Subtasks

- [x] T1: In `compilePushOutcome`, change `### Territory Pulse` → `## Territory Pulse`
  in the `pulseChunks.push(...)` line (~line 3601)
- [x] T2: Replace the Feeding block assembly (~lines 3606-3610) — push `## Feeding`
  only when `narrativeText` is non-empty; push each pulse chunk independently to `parts`
- [x] T3: Parse check: `node --check --input-type=module < public/js/admin/downtime-story.js`

---

## Testing Approach

Playwright test via the Archive tab — same pattern as fix-464, fix-466, fix-468.

Stub submissions with:
1. Both a feeding narrative and a territory pulse → Feeding section present; Territory
   Pulse section present; `###` not visible; Feeding body does not contain pulse text
2. Territory pulse only (no feeding narrative) → Territory Pulse section present; no
   Feeding heading at all
3. Feeding narrative only (no territory pulse) → Feeding section present; no Territory
   Pulse heading

**Test file:** `tests/fix-470-dt-territory-pulse-heading.spec.js`

---

## File List

- `public/js/admin/downtime-story.js` — UPDATE (lines 3601, 3606-3610)
- `tests/fix-470-dt-territory-pulse-heading.spec.js` — CREATE

---

## Dev Agent Record

**Completed:** 2026-05-22

**Implementation:** Two-part change to the Feeding block in `compilePushOutcome`:
1. `downtime-story.js:3601` — `### Territory Pulse` → `## Territory Pulse` (prefix change)
2. `downtime-story.js:3606-3611` — decomposed the combined Feeding+pulse block: `## Feeding` only pushed when `narrativeText` exists; each pulse chunk pushed independently to `parts`

Parse check passed (exit 0).

**Tests:** 6 Playwright tests in `tests/fix-470-dt-territory-pulse-heading.spec.js` — all passed on first run. Covers: pulse heading present, `###` not visible, Feeding body uncontaminated, pulse body in correct section, no pulse heading when none in outcome, pulse-only edge case (no empty Feeding heading).
