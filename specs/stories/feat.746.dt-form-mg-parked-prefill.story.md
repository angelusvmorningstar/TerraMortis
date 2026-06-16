---
title: 'DT form: lock pre-filled Mandragora Garden rite slots + show prior outcome'
type: 'feature'
issue: 746
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/746
branch: ms/issue-746-dt-form-mg-parked-prefill
created: '2026-06-15'
status: done
recommended_model: 'sonnet — targeted changes to one file, async fetch for AC-2'
context:
  - public/js/tabs/downtime-form.js
depends_on:
  - issue: 745
    status: PR open (#747)
---

## Intent

The Mandragora Garden pre-fill was partially implemented (Mandragora 2b/2c). The
seeding works — parked rites are written into the form on first load. What is
missing: the pre-filled slots are not locked (player can change the rite or un-tick
the park checkbox), and no prior cycle outcome is shown inline.

---

## What is already implemented

Search `downtime-form.js` for `Mandragora 2b` (line ~1442) and `Mandragora 2c`
(line ~4863). These blocks are already live:

**Mandragora 2b (line ~1448):** When `responseDoc` is null (no server doc, no local
draft), seeds `sorcery_N_rite` + `sorcery_N_mandragora: 'yes'` for each
`character.powers[]` entry where `mandragora_parked === true`.

**Mandragora 2c (line ~4866):** Computes `mandragoraCap` and `parkedCount` from
`saved` responses. Disables the Park checkbox when `capacityReached && !mandSaved`
(over-capacity guard). Shows "X / Y rites parked" capacity line.

**Do NOT re-implement these.** The seeding and capacity guard are correct. The
tasks below build on top of them.

---

## What is NOT yet implemented

### AC-1 gaps — slot locking

The seeded slot renders as a normal editable slot:
- The rite select (`<select id="dt-sorcery_N_rite">`) is still a full dropdown —
  player can change which rite is in the parked slot.
- The mandragora checkbox is `checked` but **not** `disabled` for seeded parked
  rites. `mandDisabled` is only set when `!isCruac || overCap`; a parked rite that
  is already at `mandSaved === true` has `overCap === false`, so the checkbox is
  always enabled. Player can un-tick it.
- The "× Remove" button on slots `n > 1` would still appear, letting the player
  remove a parked slot.

### AC-2 — prior cycle outcome

No prior outcome is shown anywhere on the player form for parked rite slots. The
MG-1 feature (ST-side, `downtime-views.js`) has a reusable lookup pattern but it
operates on the processing panel, not the player form.

### AC-3 minor gap — seeding cap

The seeding loop (line ~1454) seeds ALL powers where `mandragora_parked === true`,
without capping at `mandragoraCap`. In practice the DB should not have more parked
rites than MG dots (the ST controls this), but a guard is needed for correctness.

---

## Data shape

The locking mechanism uses a new per-slot flag in `responses`:

| Field | Value | Purpose |
|-------|-------|---------|
| `sorcery_N_mg_locked` | `'yes'` | Set during seeding; tells renderer this slot is locked |

This flag travels with the other seeded fields in `responseDoc.responses`. It is
written by the seeding block (T1) and read by the slot renderer (T2/T3/T4).

Because `responses` has `additionalProperties: true` on the server schema, no
schema change is needed.

---

## File location

All changes are in **`public/js/tabs/downtime-form.js`** only. No server changes.

---

## Implementation

### T1 — Add `sorcery_N_mg_locked` to seeding block (~line 1448)

Find the **Mandragora 2b** seeding block. The current `seeded` object sets
`sorcery_slot_count`, `sorcery_N_rite`, and `sorcery_N_mandragora`. Add
`sorcery_N_mg_locked: 'yes'` for each seeded slot, and cap seeding at
`mandragoraCap` (computed from `effectiveDomainDots`).

```js
// Mandragora 2b: seed parked rites on first load
if (!responseDoc && currentChar?.powers && currentCycle && currentCycle._id !== 'dev-stub') {
  const parked = currentChar.powers.filter(
    p => p.category === 'rite' && p.mandragora_parked === true,
  );
  if (parked.length > 0) {
    const mgCap = hasMandragora ? effectiveDomainDots(currentChar, 'Mandragora Garden') : parked.length;
    const toSeed = parked.slice(0, mgCap);
    const seeded = { sorcery_slot_count: String(toSeed.length) };
    toSeed.forEach((rite, i) => {
      const n = i + 1;
      seeded[`sorcery_${n}_rite`]        = rite.name;
      seeded[`sorcery_${n}_mandragora`]  = 'yes';
      seeded[`sorcery_${n}_mg_locked`]   = 'yes';
    });
    responseDoc = { responses: seeded };
  }
}
```

**Where is `hasMandragora` available?** It is computed higher up in the form init
before the Mandragora 2b block (grep for `hasMandragora`). Similarly,
`effectiveDomainDots` is already imported/available in the sorcery section renderer
(line ~4866). If `effectiveDomainDots` is not available at the seeding call site,
use `currentChar.merits?.find(m => m.name === 'Mandragora Garden')?.rating || 0`
as a direct fallback (same result without the helper dependency).

### T2 — Lock the rite select for locked slots (~line 4907)

In the slot rendering loop, detect `saved[`sorcery_${n}_mg_locked`] === 'yes'`
before rendering the `<select>`. When locked, replace with a read-only display:

```js
const mgLocked = saved[`sorcery_${n}_mg_locked`] === 'yes';

h += '<div class="qf-field">';
if (mgLocked && selectedRite) {
  // Locked: display rite name as text + hidden input to preserve the saved value
  h += `<p class="qf-mg-locked-rite">${esc(selectedRite)}<span class="rite-mg-tag" title="Permanently sustained by Mandragora Garden">MG</span></p>`;
  h += `<input type="hidden" id="dt-sorcery_${n}_rite" value="${esc(selectedRite)}">`;
} else {
  // Normal: full select dropdown (existing code, unchanged)
  h += `<select id="dt-sorcery_${n}_rite" class="qf-select" data-sorcery-slot="${n}">`;
  // ... existing option loop unchanged ...
  h += '</select>';
}
```

The hidden input preserves the value so the form's existing save logic can read
`document.getElementById('dt-sorcery_N_rite').value` without branching.

### T3 — Lock the mandragora checkbox for locked slots (~line 4937)

In the mandragora checkbox section, when `mgLocked` is true, force `disabled`:

```js
// existing:
const overCap = capacityReached && !mandSaved;
const mandDisabled = (!isCruac || overCap) ? ' disabled' : '';

// replace with:
const overCap = capacityReached && !mandSaved;
const mandDisabled = (mgLocked || !isCruac || overCap) ? ' disabled' : '';
const mandTitle = mgLocked
  ? 'This rite is permanently parked in your Mandragora Garden and cannot be removed via the form.'
  : overCap
    ? `Garden capacity reached (${mandragoraCap}). Untick another parked rite to free a slot.`
    : `If ticked, this rite is parked in your Mandragora Garden: it costs no vitae for this casting and is sustained by the garden until next month.`;
```

### T4 — Hide Remove button for locked slots (~line 4903)

The "× Remove" button appears for `n > 1`. Suppress it when `mgLocked`:

```js
// existing:
if (n > 1) h += `<button type="button" class="dt-sorcery-remove" ...>...`;

// replace with:
if (n > 1 && !mgLocked) h += `<button type="button" class="dt-sorcery-remove" ...>...`;
```

### T5 — Prior cycle outcome inline (AC-2)

For each locked slot, show the prior cycle's `ritual_result_note` inline below the
locked rite display (after T2's `qf-mg-locked-rite` paragraph).

**Approach:** async hydration after the slot HTML is written to the DOM, matching
the MG-1 pattern in `downtime-views.js` (`_hydrateMgPriorOutcomes`).

After the sorcery section is inserted into the DOM, iterate locked slots and fetch:

```js
async function _hydrateMgPriorOutcomesForm(lockedSlots) {
  if (!lockedSlots.length || !currentCycle) return;

  // Find the prior cycle (the one before currentCycle by cycle_number)
  const allCycles = await apiGet('/api/downtime_cycles');
  const sortedCycles = allCycles
    .filter(c => c.cycle_number < currentCycle.cycle_number)
    .sort((a, b) => b.cycle_number - a.cycle_number);
  const priorCycle = sortedCycles[0];
  if (!priorCycle) return;

  // Fetch prior submission for this character
  const priorSubs = await apiGet(
    `/api/downtime_submissions?cycle_id=${priorCycle._id}&character_id=${currentChar._id}`
  );
  const priorSub = priorSubs[0];
  if (!priorSub) return;

  // Match by rite name across cycles (slot N in prior != slot N in current)
  for (const { n, riteName } of lockedSlots) {
    let priorNote = null;
    const priorSlotCount = parseInt(priorSub.responses?.sorcery_slot_count || '0', 10);
    for (let pn = 1; pn <= priorSlotCount; pn++) {
      if (priorSub.responses?.[`sorcery_${pn}_rite`] === riteName) {
        priorNote = priorSub.sorcery_review?.[pn]?.ritual_result_note || null;
        break;
      }
    }
    const el = document.getElementById(`dt-mg-prior-${n}`);
    if (el) {
      el.textContent = priorNote || 'No prior resolution recorded.';
      el.classList.remove('dt-mg-prior-loading');
    }
  }
}
```

The placeholder element in T2's locked display:
```js
h += `<p class="qf-mg-locked-rite">...`;
// Add loading placeholder for prior outcome:
h += `<div class="dt-mg-prior-outcome"><span class="dt-sorcery-label">Prior outcome:</span> <span id="dt-mg-prior-${n}" class="dt-mg-prior-loading">Loading...</span></div>`;
```

Call `_hydrateMgPriorOutcomesForm` after the sorcery section renders, passing an
array of `{ n, riteName }` objects for each locked slot.

**Where to call it:** After the sorcery section HTML is injected into the DOM (look
for where `renderBloodSorcerySection` or equivalent inserts its HTML). The call
should be fire-and-forget: `_hydrateMgPriorOutcomesForm(lockedSlotsList).catch(() => {})`.

---

## CSS additions (`public/css/components.css` or inline style)

Add to the player form section of `components.css`:

```css
.qf-mg-locked-rite{display:flex;align-items:center;gap:6px;font-family:var(--ft);font-size:13px;color:var(--txt1);padding:6px 0;}
.dt-mg-prior-outcome{font-family:var(--ft);font-size:12px;color:var(--txt3);margin:4px 0 0;line-height:1.5;}
.dt-mg-prior-loading{font-style:italic;opacity:.6;}
```

The `.rite-mg-tag` class already exists in `components.css` (added by #745). Reuse it.

---

## Acceptance criteria

- [ ] Given a character with `mandragora_parked: true` rites and no existing
  submission, the DT form pre-fills one slot per parked rite with the rite name
  shown as read-only text (not a dropdown)
- [ ] Given a pre-filled parked slot, the mandragora checkbox is checked and
  disabled (locked) — player cannot untick it
- [ ] Given a pre-filled parked slot, the "× Remove" button is absent
- [ ] Given a pre-filled parked slot, the prior cycle's `ritual_result_note` is
  shown inline (or "No prior resolution recorded." if absent)
- [ ] Given a character with MG rating N and N+1 parked rites in DB, only N slots
  are pre-filled (cap enforced at seeding)
- [ ] Players can add additional non-locked sorcery slots beyond the pre-filled ones
- [ ] Characters without `mandragora_parked` rites see no change to the form
- [ ] An existing draft or server submission is NOT overwritten by the seeding
  (the `!responseDoc` guard remains intact)

---

## Guardrails

- **Only `public/js/tabs/downtime-form.js` and `public/css/components.css` change.**
  No server changes, no schema changes, no other JS files.
- Do NOT refactor the existing Mandragora 2b/2c blocks — only add the `mg_locked`
  flag to the seeding and read it in the renderer.
- The `_hydrateMgPriorOutcomesForm` fetch is fire-and-forget — a network failure
  must leave "No prior resolution recorded." in the placeholder, never crash the form.
- The hidden `<input type="hidden" id="dt-sorcery_N_rite">` must preserve the form's
  existing save path — `document.getElementById('dt-sorcery_N_rite').value` must
  return the rite name for locked slots, identical to what the select would return
  for normal slots.
- Read the full sorcery slot rendering loop (lines ~4895–4942) before editing —
  `mgLocked` must be declared before the first use (line ~4903 for Remove button).

---

## Dev Agent Record

### Files changed

- `public/js/tabs/downtime-form.js` — T1 seeding cap, T2/T3/T4 slot rendering, T5 hydration, collectResponses preserve-prior fix
- `public/css/components.css` — `.rite-mg-tag`, `.qf-mg-locked-rite`, `.dt-mg-prior-outcome`, `.dt-mg-prior-loading`
- `tests/feat-746-dt-form-mg-parked-prefill.spec.js` — 10 Playwright tests, all passing

### Completion notes

T1 seeding cap uses `m.dots || m.rating` instead of `effectiveDomainDots` because the latter requires `attached_to` → Safe Place link (CAP_DOMAIN path via `_havenCap`) which is absent from fresh characters and test fixtures.

collectResponses() had a pre-existing issue: sorcery fields (`sorcery_N_rite`, `sorcery_N_mandragora`) were overwritten with `''`/`'no'` when the sorcery section was absent from the DOM (minimal mode). This broke seeded locked slots on mode switch. Fixed by preserving `_prior` values when elements are null.
