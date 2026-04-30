---
title: 'Resources multi-acquisition — multiple purchases per downtime, each with its own availability'
type: 'feat'
created: '2026-04-30'
status: review
recommended_model: 'sonnet — pattern mirrors rite-slot (count + add/remove + per-slot keys + collector loop) with full precedent in the same file; backwards-compat fallback is straightforward'
context:
  - specs/epic-dtlt-dt2-live-form-triage.md
  - public/js/tabs/downtime-form.js
  - public/js/admin/downtime-views.js
  - public/js/admin/downtime-story.js
---

## Intent

**Problem:** The Resources Acquisition section (`tabs/downtime-form.js:3837-3911`) renders a single description + single availability dot row + single merit checkbox grid per submission. A player buying multiple distinct items in one downtime has to either submit them all under one description (ST disambiguates manually) or pick a single representative availability that doesn't reflect the others. The user observation from the live DT 2 form review: "In Resources, multiple purchases are allowed, but there is a request for a single rating. So just like you can add extra rites, you should be allowed to purchase extra items, each having their own availability rating."

The rite slot section (`tabs/downtime-form.js:3721-3830`) already implements exactly this pattern: hidden slot-count input, "+ Add" button, per-slot keys (`sorcery_${n}_*`), per-slot remove with shift-down, collector loop iterating slots. The fix is to mirror that pattern for Resources Acquisitions.

**Approach:** Three coordinated changes:

1. **Player render** — convert the single-card section to a multi-slot section. Hidden `acq_slot_count`, "+ Add Item" button, per-slot card with keys `acq_${n}_description`, `acq_${n}_availability`, `acq_${n}_merits`. Resources Level header (character merit dots) stays at the section level — it's character-wide, shared across slots. Add/remove handlers mirror rite slot pattern at `:2472-2508`.

2. **Collector + backwards-compat** — `collectResponses` at `:668-686` iterates `acq_slot_count` and writes per-slot keys plus an enriched `responses['resources_acquisitions']` blob containing all slots in multi-line form. Legacy single-slot keys (`acq_description`, `acq_availability`, `acq_merits`) are written from slot 1 only — preserves readers that haven't migrated. On render, if `acq_slot_count` is absent (legacy submission), legacy keys populate slot 1.

3. **ST-side scope (deferred)** — the existing ST queue construction at `admin/downtime-views.js:2755-2769` continues to push one queue row per submission with the (now multi-item) blob in `acqNotes`. ST reads the blob text and processes manually, same as today. Per-item ST processing (one queue row per item, structured availability handling) is **out of scope** for this story — flagged as a follow-up if multi-item submissions prove to need it. The blob now carries all the structured info, so ST work doesn't regress; it just doesn't get the multi-row treatment yet.

This story is precedented end-to-end. The rite slot section is the template — same shape, same handlers, same collector pattern. The only novelty is the availability dot row, which is per-slot now (the existing handler at `:1740-1761` is keyed on global ids and needs per-slot scoping).

## Boundaries & Constraints

**Always:**
- Per-slot keys: `acq_${n}_description` (textarea), `acq_${n}_availability` (1-5 or `'unknown'`), `acq_${n}_merits` (JSON array of merit-keys). Slot index `n` is 1-based.
- `acq_slot_count` is the canonical slot count. Default to 1 when absent.
- Resources Level header (character merit rating) stays at the section level. It's a property of the character, shared across all slot acquisitions.
- "+ Add Item" button mirrors `dt-add-rite-btn` styling at `:3830`.
- Per-slot remove button mirrors `dt-sorcery-remove` from rite slots: shown for n > 1, label "× Remove".
- Add/remove handlers re-render the form (per `:2472-2508` rite slot precedent).
- Backwards-compat on render: when `acq_slot_count` is absent AND legacy keys are present, treat legacy as slot 1; ignore `acq_1_*` if both legacy and new exist (slot data wins).
- Backwards-compat on save: still write legacy keys (`acq_description`, `acq_availability`, `acq_merits`) populated from slot 1. Preserves any reader that hasn't migrated.
- The composite `responses['resources_acquisitions']` blob is rebuilt to include all slots, multi-line. Format mirrors the existing single-slot shape at `:681-686` but with a slot separator and per-slot Description / Availability / Merits triplets. ST processing reads this blob (`admin/downtime-views.js:2746-2754`), so the format must be human-readable.
- Availability dot row's existing event handlers at `:1740-1761` are scoped per-slot. Use a slot-aware data attribute (`data-acq-slot="${n}"`) on the dot row container; the handler reads the slot index and updates the corresponding hidden input `dt-acq_${n}_availability`.

**Ask First:**
- **Per-slot Relevant Merits picker** — design choice. Each acquisition slot likely benefits from different supporting merits (e.g. Allies (Police) helps with one item, Resources alone with another). Default: per-slot merit picker. Confirm — alternative is a single merit set shared across all slots, simpler but less expressive. Default per-slot is closer to RAW intent (each acquisition is its own roll).
- **ST-side per-item processing scope** — explicit defer. The story ships player-side multi-slot only; ST queue stays single-row-per-submission with multi-item blob. If per-item ST processing is needed (e.g. each availability needs its own dice roll and outcome), that's a follow-up story (~dtlt-12 or in a future polish epic). Confirm: defer is acceptable. Otherwise scope balloons by ~50% to thread the structured slot data through queue construction and processing panel.

**Never:**
- Do not change Skill-Based Acquisition (`:3913-4028`). It's single-roll-per-DT by rules ("Limited to ONE skill-based acquisition per Downtime" per `:3923`). Different mechanic, different scope.
- Do not delete or rename the legacy `acq_description` / `acq_availability` / `acq_merits` keys. Backwards-compat layer keeps them populated from slot 1.
- Do not change the ST queue construction in `admin/downtime-views.js`. Multi-item awareness is deferred per "Ask First". The blob now contains everything; the queue stays a single row per submission.
- Do not collapse the Resources Acquisition card into the Skill Acquisition card. Two distinct mechanics; keep them visually and structurally separate.
- Do not change the published-outcome compilation logic (`admin/downtime-story.js`) for resources. The blob shape is multi-line as before; readers that summarise the first line continue to work; readers that show the full blob get all slots.

## I/O & Edge-Case Matrix

| Scenario | Pre-fix | Post-fix |
|---|---|---|
| Player declares 1 acquisition (default state) | Section renders one card with description + availability + merits | Section renders slot 1 card identically (visually no change for the common case); "+ Add Item" button below the card |
| Player clicks "+ Add Item" | n/a | Form re-renders with a second slot card; first card gets a "× Remove" button |
| Player declares 3 acquisitions, each with different availability | Single card; player has to merge them into one description with single availability | Three cards, each with own description, availability dot row, and merit picks |
| Player removes slot 2 of 3 | n/a | Remaining slots shift down: slot 3's data moves to slot 2; total count drops to 2 |
| Player removes slot 1 (the only slot) | n/a | Remove button is hidden when count === 1; slot 1 always exists |
| Form save with multi-slot data | Legacy single-slot blob saved | All per-slot keys saved + legacy keys mirror slot 1 + composite `resources_acquisitions` blob includes all slots multi-line |
| Form load of legacy submission (`acq_description` set, no `acq_slot_count`) | Renders single-slot card from legacy keys | Renders single-slot card from legacy keys (treated as slot 1); `acq_slot_count` is implicit 1 |
| Form load of submission with `acq_1_description` set AND legacy `acq_description` set (transitional) | n/a | Slot keys win (`acq_1_description` is the source of truth) |
| ST opens action queue post-fix for a multi-slot submission | Single queue row with single-item blob | Single queue row; `acqNotes` blob now contains all slots in multi-line form |
| ST opens processing panel for a multi-slot submission | Renders blob text in "Player Notes" | Same — blob text shows all slots; ST processes manually for now |
| Published outcome compilation reads `responses.resources_acquisitions` | Reads single-slot blob | Reads multi-slot blob (all items in multi-line form); existing readers continue to render the text as-is |
| Empty slot (player added a slot but didn't fill description or availability) | n/a | Saved with empty fields; ST sees a blank slot in the blob; no validation enforced (matches rite slot semantics) |

## Composite blob format

The legacy `resources_acquisitions` blob at `:681-686` currently joins four lines:
```
Resources 3
Merits: Allies|Police, Contacts|Bureaucracy
{description text}
Availability: 3/5
```

Multi-slot version mirrors this per-slot, with a `--- Item N ---` separator:
```
Resources 3

--- Item 1 ---
Merits: Allies|Police
{description for item 1}
Availability: 3/5

--- Item 2 ---
Merits: Contacts|Bureaucracy
{description for item 2}
Availability: Unknown
```

Resources Level (character merit rating) stays at the top, shared. Per-slot blocks separated by blank lines + `--- Item N ---` header.

When `acq_slot_count === 1`, the blob output collapses back to the single-block form (no `--- Item 1 ---` header) — preserves visual parity for the common case.

## Code Map

### Player render — `tabs/downtime-form.js:3837-3911`

Currently single-block. Convert to a slot loop:

```js
function renderAcquisitionsSection(saved) {
  const c = currentChar;
  const resourcesMerit = (c.merits || []).find(m => m.name === 'Resources');
  const resourcesRating = effectiveMeritRating(c, resourcesMerit);

  const charMerits = (c.merits || []).filter(m =>
    m.category === 'general' || m.category === 'influence' || m.category === 'standing'
  );

  // Slot count, default 1
  const savedCount = parseInt(saved['acq_slot_count'] || '1', 10);
  const slotCount = Math.max(1, savedCount);

  let h = '<div class="qf-section collapsed" data-section-key="acquisitions">';
  h += '<h4 class="qf-section-title">Acquisition: Resources and Skills<span class="qf-section-tick">✔</span></h4>';
  h += '<div class="qf-section-body">';

  // Hidden slot count
  h += `<input type="hidden" id="dt-acq-slot-count" value="${slotCount}">`;

  // Resources Level header (character-wide; outside the slots)
  h += '<div class="dt-acq-resources-row dt-acq-resources-header">';
  h += `<span class="dt-acq-label">Resources Level:</span>`;
  h += `<span class="dt-acq-dots">${resourcesRating ? '●'.repeat(resourcesRating) : 'None'}</span>`;
  h += '</div>';

  // ── Per-slot cards ──
  for (let n = 1; n <= slotCount; n++) {
    h += renderResourcesAcquisitionSlot(n, saved, charMerits, slotCount);
  }

  // "+ Add Item" button
  h += `<button type="button" class="dt-add-rite-btn dt-add-acq-btn" id="dt-add-acquisition">+ Add Item</button>`;

  // ── Skill-based acquisition (unchanged) ──
  // ... existing code from line 3913 onward ...
}
```

Then a new helper `renderResourcesAcquisitionSlot(n, saved, charMerits, slotCount)`:

```js
function renderResourcesAcquisitionSlot(n, saved, charMerits, slotCount) {
  // Backwards-compat: when n === 1 and acq_slot_count is absent, fall back
  // to legacy keys (acq_description, acq_availability, acq_merits).
  const useLegacy = n === 1 && saved['acq_slot_count'] === undefined && saved['acq_1_description'] === undefined;
  const description = useLegacy ? (saved['acq_description'] || '') : (saved[`acq_${n}_description`] || '');
  const availabilityRaw = useLegacy ? saved['acq_availability'] : saved[`acq_${n}_availability`];
  const merits = useLegacy ? (saved['acq_merits'] || '[]') : (saved[`acq_${n}_merits`] || '[]');

  let h = `<div class="dt-acq-card" data-acq-slot="${n}">`;

  // Slot header with optional remove button
  h += '<div class="dt-acq-card-hd">';
  h += `<div class="dt-acq-card-title">Item ${n}</div>`;
  if (slotCount > 1) {
    h += `<button type="button" class="dt-sorcery-remove dt-acq-remove" data-remove-acq="${n}" title="Remove this item">× Remove</button>`;
  }
  h += '</div>';

  // Relevant merits (per-slot)
  let meritPicks = [];
  try { meritPicks = JSON.parse(merits); } catch { /* ignore */ }
  h += '<div class="qf-field">';
  h += '<label class="qf-label">Relevant Merits</label>';
  h += '<p class="qf-desc">Select merits that support this acquisition.</p>';
  h += `<div class="dt-proj-merits" data-acq-merits="${n}">`;
  for (const m of charMerits) {
    const mName = m.area ? `${m.name} (${m.area})` : (m.qualifier ? `${m.name} (${m.qualifier})` : m.name);
    const dots = '●'.repeat(m.rating || 0);
    const mKey = `${m.name}|${m.area || m.qualifier || ''}`;
    const checked = meritPicks.includes(mKey) ? ' checked' : '';
    h += `<label class="dt-proj-merit-label">`;
    h += `<input type="checkbox" value="${esc(mKey)}" data-acq-merit-cb="${n}"${checked}>`;
    h += `<span>${esc(mName)} ${dots}</span>`;
    h += '</label>';
  }
  if (!charMerits.length) {
    h += '<p class="qf-desc">No applicable merits.</p>';
  }
  h += '</div></div>';

  // Description (per-slot)
  h += renderQuestion({
    key: `acq_${n}_description`, label: 'Acquisition Description',
    type: 'textarea', required: false,
    desc: 'What are you attempting to acquire? Include context and purpose.',
  }, description);

  // Availability dot row (per-slot)
  const savedAvail = availabilityRaw === 'unknown' ? 'unknown' : (parseInt(availabilityRaw, 10) || 0);
  h += '<div class="qf-field">';
  h += '<label class="qf-label">Availability</label>';
  h += '<p class="qf-desc">How rare is this item? Click to set (1 = common, 5 = unique).</p>';
  h += `<div class="dt-acq-avail-row" data-acq-avail="${n}">`;
  for (let d = 1; d <= 5; d++) {
    const filled = typeof savedAvail === 'number' && d <= savedAvail ? ' dt-acq-dot-filled' : '';
    h += `<span class="dt-acq-dot${filled}" data-acq-dot="${d}" data-acq-slot="${n}">●</span>`;
  }
  h += `<span class="dt-acq-unknown${savedAvail === 'unknown' ? ' dt-acq-dot-filled' : ''}" data-acq-unknown="${n}">Unknown</span>`;
  if (savedAvail) {
    const labels = ['', 'Common', 'Uncommon', 'Rare', 'Very Rare', 'Unique'];
    const lbl = savedAvail === 'unknown' ? '' : (labels[savedAvail] || '');
    if (lbl) h += `<span class="dt-acq-avail-label">${lbl}</span>`;
  }
  h += `<input type="hidden" id="dt-acq_${n}_availability" value="${esc(String(savedAvail || ''))}">`;
  h += '</div></div>';

  h += '</div>'; // acq-card
  return h;
}
```

### Add / remove handlers — `tabs/downtime-form.js:2472-2508` (mirror rite slot)

Add after the rite slot remove handler at line 2508:

```js
// Add Acquisition button
if (e.target.closest('#dt-add-acquisition')) {
  const responses = collectResponses();
  const countEl = document.getElementById('dt-acq-slot-count');
  const current = countEl ? parseInt(countEl.value, 10) || 1 : 1;
  responses['acq_slot_count'] = String(current + 1);
  if (responseDoc) responseDoc.responses = responses;
  else responseDoc = { responses };
  renderForm(container);
  return;
}
// Remove Acquisition button
const removeAcqBtn = e.target.closest('[data-remove-acq]');
if (removeAcqBtn) {
  const removeN = parseInt(removeAcqBtn.dataset.removeAcq, 10);
  const responses = collectResponses();
  const countEl = document.getElementById('dt-acq-slot-count');
  const current = countEl ? parseInt(countEl.value, 10) || 1 : 1;
  // Shift slots down
  for (let n = removeN; n < current; n++) {
    responses[`acq_${n}_description`]  = responses[`acq_${n + 1}_description`]  || '';
    responses[`acq_${n}_availability`] = responses[`acq_${n + 1}_availability`] || '';
    responses[`acq_${n}_merits`]       = responses[`acq_${n + 1}_merits`]       || '[]';
  }
  // Clear last slot
  delete responses[`acq_${current}_description`];
  delete responses[`acq_${current}_availability`];
  delete responses[`acq_${current}_merits`];
  responses['acq_slot_count'] = String(Math.max(1, current - 1));
  if (responseDoc) responseDoc.responses = responses;
  else responseDoc = { responses };
  renderForm(container);
  return;
}
```

### Availability dot click handler — `tabs/downtime-form.js:1722-1761` (per-slot scoping)

Currently the handler reads/writes the global `dt-acq_availability` input. Adapt it to read the slot index from the row's `data-acq-avail` attribute and target `dt-acq_${slot}_availability`:

```js
const acqUnknown = e.target.closest('[data-acq-unknown]') || e.target.closest('[data-skill-acq-unknown]');
if (acqUnknown) {
  const isSkill = !!acqUnknown.dataset.skillAcqUnknown;
  const slot = isSkill ? null : (acqUnknown.dataset.acqUnknown || null);  // per-slot for resource acq
  const inputId = isSkill
    ? 'dt-skill_acq_availability'
    : (slot ? `dt-acq_${slot}_availability` : 'dt-acq_availability');  // legacy fallback
  const input = document.getElementById(inputId);
  if (input) input.value = 'unknown';
  const row = acqUnknown.closest(isSkill ? '[data-skill-acq-avail]' : '[data-acq-avail]');
  if (row) {
    const dotAttr = isSkill ? 'data-skill-acq-dot' : 'data-acq-dot';
    row.querySelectorAll(`[${dotAttr}]`).forEach(d => d.classList.remove('dt-acq-dot-filled'));
    acqUnknown.classList.add('dt-acq-dot-filled');
    const lbl = row.querySelector('.dt-acq-avail-label');
    if (lbl) lbl.textContent = '';
  }
  scheduleSave();
  updateSectionTicks(container);
  return;
}
```

Same adaptation for `acqDot` handler at line 1740-1761. The legacy fallback path (`'dt-acq_availability'` without slot suffix) handles the (unlikely) case where the data-attribute is missing — should not occur for new renders.

### Collector — `tabs/downtime-form.js:668-686`

Currently:
```js
// Acquisition fields (custom render)
const acqDescEl = document.getElementById('dt-acq_description');
responses['acq_description'] = acqDescEl ? acqDescEl.value : '';
const acqAvailEl = document.getElementById('dt-acq_availability');
responses['acq_availability'] = acqAvailEl ? acqAvailEl.value : '';
// Acquisition merits
const acqMeritCbs = document.querySelectorAll('[data-acq-merit-cb]:checked');
const acqMeritKeys = [];
acqMeritCbs.forEach(cb => acqMeritKeys.push(cb.value));
responses['acq_merits'] = JSON.stringify(acqMeritKeys);
// Backwards compat: combined into old key
const resourcesM = (currentChar.merits || []).find(m => m.name === 'Resources');
const resourcesRating = effectiveMeritRating(currentChar, resourcesM);
responses['resources_acquisitions'] = [
  resourcesRating ? `Resources ${resourcesRating}` : '',
  acqMeritKeys.length ? `Merits: ${acqMeritKeys.join(', ')}` : '',
  responses['acq_description'],
  responses['acq_availability'] ? `Availability: ${responses['acq_availability'] === 'unknown' ? 'Unknown' : responses['acq_availability'] + '/5'}` : '',
].filter(Boolean).join('\n');
```

After:
```js
// Acquisition fields (multi-slot, per-slot keys)
const acqCountEl = document.getElementById('dt-acq-slot-count');
const acqSlotCount = acqCountEl ? parseInt(acqCountEl.value, 10) || 1 : 1;
responses['acq_slot_count'] = String(acqSlotCount);

const acqSlots = []; // collected for blob
for (let n = 1; n <= acqSlotCount; n++) {
  const descEl = document.getElementById(`dt-acq_${n}_description`);
  const availEl = document.getElementById(`dt-acq_${n}_availability`);
  responses[`acq_${n}_description`] = descEl ? descEl.value : '';
  responses[`acq_${n}_availability`] = availEl ? availEl.value : '';

  const cbs = document.querySelectorAll(`[data-acq-merit-cb="${n}"]:checked`);
  const keys = [];
  cbs.forEach(cb => keys.push(cb.value));
  responses[`acq_${n}_merits`] = JSON.stringify(keys);

  acqSlots.push({
    description: responses[`acq_${n}_description`],
    availability: responses[`acq_${n}_availability`],
    merits: keys,
  });
}

// Backwards-compat legacy keys: slot 1 mirror
responses['acq_description']  = responses['acq_1_description']  || '';
responses['acq_availability'] = responses['acq_1_availability'] || '';
responses['acq_merits']       = responses['acq_1_merits']       || '[]';

// Composite blob: all slots
const resourcesM = (currentChar.merits || []).find(m => m.name === 'Resources');
const resourcesRating = effectiveMeritRating(currentChar, resourcesM);
const blobLines = [];
if (resourcesRating) blobLines.push(`Resources ${resourcesRating}`);
if (acqSlotCount === 1) {
  // Single-slot: collapse to legacy shape (no "--- Item N ---" headers)
  const s = acqSlots[0];
  if (s.merits.length) blobLines.push(`Merits: ${s.merits.join(', ')}`);
  if (s.description)   blobLines.push(s.description);
  if (s.availability)  blobLines.push(`Availability: ${s.availability === 'unknown' ? 'Unknown' : s.availability + '/5'}`);
} else {
  // Multi-slot: per-item blocks separated by "--- Item N ---"
  acqSlots.forEach((s, i) => {
    blobLines.push(''); // blank line separator
    blobLines.push(`--- Item ${i + 1} ---`);
    if (s.merits.length) blobLines.push(`Merits: ${s.merits.join(', ')}`);
    if (s.description)   blobLines.push(s.description);
    if (s.availability)  blobLines.push(`Availability: ${s.availability === 'unknown' ? 'Unknown' : s.availability + '/5'}`);
  });
}
responses['resources_acquisitions'] = blobLines.filter((line, i, arr) =>
  // Strip leading blank line if present
  !(i === 0 && !line)
).join('\n').trim();
```

### CSS — minimal additions

Add `.dt-acq-card-hd` with flex layout (matches `.dt-sorcery-slot-hd`); reuse `.dt-sorcery-remove` styles or alias `.dt-acq-remove` to match. Add `.dt-acq-resources-header` if a visual gap from slot cards is desired (margin-bottom).

### ST-side queue construction — `admin/downtime-views.js:2755-2769`

**No changes required** — the existing single-row-per-submission path continues to work. The blob in `acqNotes` now contains all slots in multi-line form. ST's processing panel renders the blob text via `_acqRowSummary` and the `proc-acq-notes` block at `:7816`. STs read the multi-item blob and process manually for now.

Optional enrichment (defer to follow-up): augment the row summary `_acqRowSummary` at `:2748-2754` to detect `--- Item N ---` separators and report e.g. "3 items, mixed availability" instead of just the first description line. Not required.

## Tasks & Acceptance

**Execution:**

- [ ] Refactor `renderAcquisitionsSection` to slot loop. Extract `renderResourcesAcquisitionSlot(n, saved, charMerits, slotCount)`.
- [ ] Add slot-count hidden input + "+ Add Item" button.
- [ ] Add/remove handlers in the `container.addEventListener('click', ...)` block, mirroring rite slot pattern at `:2472-2508`.
- [ ] Adapt availability dot click handlers at `:1722-1761` to read slot index from data-attribute and target the per-slot hidden input.
- [ ] Refactor collector at `:668-686`: iterate slots, populate per-slot keys, mirror to legacy keys from slot 1, build composite blob.
- [ ] CSS: add `.dt-acq-card-hd` flex layout (mirrors `.dt-sorcery-slot-hd`); reuse `.dt-sorcery-remove` for the per-slot remove button or alias.
- [ ] Manual smoke per Verification.

**Acceptance Criteria:**

- Given a player opens the DT form for the first time (default state), when the Acquisitions section renders, then one Resources slot is visible (Item 1), an "+ Add Item" button is below it, and no remove button is shown for slot 1.
- Given the player clicks "+ Add Item", when the form re-renders, then a second slot card appears (Item 2) with its own description, availability, and merit picker; Item 1 now has a "× Remove" button.
- Given two slots exist, when the player removes Item 1, then Item 2's data shifts down to Item 1; total slot count is 1; the remove button vanishes (only one slot remains).
- Given three slots with different descriptions and availabilities, when the form saves, then `responses` contains `acq_slot_count: '3'`, `acq_1_description / acq_1_availability / acq_1_merits`, `acq_2_*`, `acq_3_*`, plus legacy `acq_description / acq_availability / acq_merits` mirroring slot 1.
- Given the same submission, when the composite `responses['resources_acquisitions']` blob is built, then it contains `Resources N` at top, three per-slot blocks separated by blank lines and `--- Item N ---` headers, each block listing merits + description + availability.
- Given a single-slot submission, when the composite blob is built, then it collapses to the legacy four-line shape (no `--- Item 1 ---` header).
- Given a legacy submission with `acq_description` set but no `acq_slot_count`, when the form loads, then slot 1 renders populated from legacy keys; `acq_slot_count` is implicit 1; saving the form upgrades to multi-slot keys.
- Given a player picks different merits for different slots, when the form saves, then `acq_${n}_merits` holds the JSON array of keys per slot independently.
- Given the per-slot availability dot row, when the player clicks dot 3 in slot 2, then the hidden input `dt-acq_2_availability` receives `'3'`; slot 1's availability is unchanged.
- Given the existing ST queue render path, when a multi-slot submission is processed, then the queue shows one row per submission; the row's `acqNotes` blob contains all slots in multi-line form; ST opens the processing panel and sees the blob in "Player Notes".
- Given Skill-Based Acquisition (separate card), when the form renders, then it remains single-slot (rules: ONE per DT) and is unaffected by this change.

## Verification

**Commands:**

- No new tests required — the change mirrors a precedented pattern (rite slots) with the same handlers, collector, and persistence shape.
- Browser console clean during render and slot add/remove interactions.

**Manual checks:**

1. **Default state:**
   - Open DT form for any character. Navigate to Acquisitions section. Confirm one slot visible (labelled "Item 1") + "+ Add Item" button below.
2. **Add and remove slots:**
   - Click "+ Add Item". Confirm Item 2 appears. Click "+ Add Item" again. Confirm Item 3 appears.
   - Confirm Items 1, 2, 3 each have their own description, availability, and merit picker.
   - Click "× Remove" on Item 2. Confirm Item 3's data shifts down (becomes Item 2). Total slots: 2.
   - Click "× Remove" on Item 2 (was Item 3 originally). Total slots: 1. Confirm "× Remove" button disappears (only one slot remains).
3. **Per-slot independence:**
   - Add 3 slots. Set different descriptions, different availability dots (e.g. 1, 3, Unknown), different merit picks per slot.
   - Reload the form. Confirm all three slots persist with their data intact.
4. **Backwards-compat:**
   - Find a legacy DT 1 submission with `acq_description` set. Open it in the DT form. Confirm slot 1 renders with the legacy data populated.
   - (Sanity check) Save the form. Inspect the responses in Mongo or via API. Confirm `acq_slot_count: '1'` is now set + `acq_1_description / acq_1_availability` mirror the legacy keys.
5. **Composite blob:**
   - With 3 slots filled, save the form. Inspect `responses.resources_acquisitions` in Mongo. Confirm format includes `Resources N` at top + three `--- Item N ---` blocks.
   - With 1 slot filled, save. Confirm blob is the four-line legacy shape (no `--- Item 1 ---` header).
6. **ST processing parity:**
   - Open the ST action queue for a multi-slot submission. Confirm one queue row labelled "Resources Acquisitions". Open its processing panel. Confirm "Player Notes" shows the multi-item blob in readable form.
7. **Skill Acquisition unaffected:**
   - Same form: Skill-Based Acquisition card below the Resources section renders unchanged. Single-slot, single description, single pool, single availability. (Per its rule: one per DT.)

## Final consequence

Players can declare multiple Resources acquisitions per downtime, each with its own description and availability rating. The pattern matches what they already know from rite slots — same UI shape, same affordances. Backwards compatibility is preserved at every layer: legacy submissions render correctly, legacy keys stay populated, the existing ST processing path consumes the multi-item blob without code changes.

ST tooling stays where it is for now — single queue row per submission, multi-item blob in Player Notes. Per-item processing (one row per acquisition, structured availability handling, separate dice rolls) is flagged as a follow-up if usage shows it's needed; not required by this story per the epic's scoping.

The rite-slot pattern is now mirrored in two places (rites + Resources). Future "list of N items per submission" features in the form follow the same shape, no new precedent.
