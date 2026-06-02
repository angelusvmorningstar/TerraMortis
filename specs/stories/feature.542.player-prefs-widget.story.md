# Story feature.542: Player preferences widget in ordeals tab

## Status: review

## Issue
[#542](https://github.com/angelusvmorningstar/TerraMortis/issues/542) — feat: add player preferences widget to ordeals tab

## Branch
`ms/issue-542-player-prefs-widget`

---

## Story

**As a** player filling in my character sheet,
**I want** to record what I want from the chronicle using simple 1–5 ratings,
**so that** the ST team can calibrate content decisions against the table's actual preferences.

**As an** ST,
**I want** to see each player's ratings inline on their character sheet, plus a campaign-level aggregate,
**so that** I can answer questions like "do players actually want more combat?" with data rather than gut feel.

---

## Background

Seven preference axes were derived from a 27-player survey (24 substantive responses). The dominant preference — political/social play — scored nearly 3:1 over the next category. The feature is a **ST calibration tool**: ratings are read at population level to inform chronicle and system design decisions, not to affect individual game outcomes.

The concrete trigger: the ST team questioned whether the volume of combat merits was warranted given what players actually want.

---

## Acceptance Criteria

- [x] Player can set a 1–5 rating for each of the seven preference axes in the ordeals tab
- [x] Ratings default to null (unanswered); unanswered axes render visibly differently from a rating of 1
- [x] `updated_at` timestamp is written on every save and displayed to the player ("Last updated [date]")
- [x] Player can update ratings at any time; saves overwrite previous values
- [x] ST admin character sheet shows the player's seven ratings inline, clearly separate from mechanical stats
- [x] ST admin "Player Preferences" view shows average rating per axis across all active (non-retired) characters that have at least one rating set
- [x] Characters with no `player_prefs` set (or all null ratings) are excluded from the aggregate averages
- [x] `player_prefs` is declared in `character.schema.js` before any UI or API work — no "additional properties" save failures

---

## Scope

**In scope**: schema registration; scoped player PATCH endpoint; player-facing rating UI; ST per-character inline display; ST aggregate view.

**Out of scope**: per-cycle preference snapshots; point-budget / trade-off model (ratings are independent); email nudges; any mechanical effect on game outcomes.

---

## Dev Notes

### The seven preference axes

```js
const PLAYER_PREF_AXES = [
  { key: 'political_social',    label: 'Political & Social' },
  { key: 'personal_horror',     label: 'Personal Horror' },
  { key: 'direct_confrontation',label: 'Direct Confrontation' },
  { key: 'character_growth',    label: 'Character Growth' },
  { key: 'mysticism',           label: 'Mysticism & Occult' },
  { key: 'supporter_wildcard',  label: 'Supporter / Wildcard' },
  { key: 'st_scaffolding',      label: 'ST Scaffolding needed' },
];
```

Define this constant once in `ordeals-view.js` (player UI) and re-use it in `ordeals-admin.js` (ST UI) by importing or duplicating. Do not scatter the axis list.

---

### Task 1 — Schema registration (do this FIRST)

**File:** `server/schemas/character.schema.js`

Add `player_prefs` as a new top-level property, after the `ordeals` block (~line 276). All sub-fields are optional — a character with no preferences is valid. The rating fields use a wrapper object (`{ rating: null }`) rather than bare integers for forward compatibility (e.g. a future `notes` field per axis).

```js
// ── Player Preferences ────────────────────────────────────────
player_prefs: {
  type: 'object',
  properties: {
    political_social:      { type: 'object', properties: { rating: { type: ['integer', 'null'], minimum: 1, maximum: 5 } }, additionalProperties: false },
    personal_horror:       { type: 'object', properties: { rating: { type: ['integer', 'null'], minimum: 1, maximum: 5 } }, additionalProperties: false },
    direct_confrontation:  { type: 'object', properties: { rating: { type: ['integer', 'null'], minimum: 1, maximum: 5 } }, additionalProperties: false },
    character_growth:      { type: 'object', properties: { rating: { type: ['integer', 'null'], minimum: 1, maximum: 5 } }, additionalProperties: false },
    mysticism:             { type: 'object', properties: { rating: { type: ['integer', 'null'], minimum: 1, maximum: 5 } }, additionalProperties: false },
    supporter_wildcard:    { type: 'object', properties: { rating: { type: ['integer', 'null'], minimum: 1, maximum: 5 } }, additionalProperties: false },
    st_scaffolding:        { type: 'object', properties: { rating: { type: ['integer', 'null'], minimum: 1, maximum: 5 } }, additionalProperties: false },
    updated_at:            { type: ['string', 'null'] }
  },
  additionalProperties: false
},
```

**Why first**: the root character schema has `additionalProperties: false`. Any save that includes `player_prefs` before this declaration will be rejected by schema validation.

---

### Task 2 — Server: scoped player PATCH endpoint

**File:** `server/routes/characters.js`

**Auth boundary**: `PUT /api/characters/:id` is ST-only (line 386). Players cannot use it. The precedent is `PATCH /api/characters/:id/safe_place_locations` (line 456) — a narrowly scoped player write path. Follow the same pattern exactly.

Add after the `safe_place_locations` handler:

```js
// PATCH /api/characters/:id/player_prefs — player (own char) or ST.
// #542: persist player preference ratings. Narrowly scoped: only the
// `player_prefs` subdocument is touched. Ownership mirrors GET /:id.
router.patch('/:id/player_prefs', async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character ID format' });

  // Ownership: players may only write their own character; ST may write any.
  if (!isStRole(req.user)) {
    const owns = (req.user.character_ids || []).some(id => id.toString() === oid.toString());
    if (!owns) return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your character' });
  }

  const { player_prefs } = req.body || {};
  if (!player_prefs || typeof player_prefs !== 'object') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'player_prefs must be an object' });
  }

  const VALID_KEYS = [
    'political_social', 'personal_horror', 'direct_confrontation',
    'character_growth', 'mysticism', 'supporter_wildcard', 'st_scaffolding',
  ];
  const prefs = {};
  for (const key of VALID_KEYS) {
    const v = player_prefs[key];
    if (v === undefined) continue;
    const rating = v?.rating !== undefined ? v.rating : v;
    if (rating !== null && (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5)) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: `${key}.rating must be 1–5 integer or null` });
    }
    prefs[key] = { rating: rating ?? null };
  }
  prefs.updated_at = new Date().toISOString();

  const result = await col().findOneAndUpdate(
    { _id: oid },
    { $set: { player_prefs: prefs } },
    { returnDocument: 'after' },
  );
  if (!result) return res.status(404).json({ error: 'NOT_FOUND', message: 'Character not found' });
  res.json(result);
});
```

**Note**: The endpoint replaces the entire `player_prefs` subdocument on each save (not a merge). This is correct — the player always submits all seven axes from the widget.

---

### Task 3 — Player UI in ordeals tab

**File:** `public/js/tabs/ordeals-view.js`

**Import**: Add `apiPatch` to the import from `../data/api.js`.

**Where to inject**: In `renderOrdealsList()`, add the player_prefs widget as a new section between the "Player Ordeals" section and the XP breakdown (before `h += renderXPBreakdown(char)`).

**Reading**: `char.player_prefs` is already on the `char` object passed to `initOrdeals` — no extra API call needed.

**Rendering the widget**:

```js
function renderPlayerPrefs(char) {
  const prefs = char.player_prefs || {};
  const updatedAt = prefs.updated_at
    ? new Date(prefs.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  let h = '<div class="player-prefs-panel">';
  h += '<h3 class="ordeals-heading">Chronicle Preferences</h3>';
  h += '<p class="player-prefs-desc">Rate what you want from the chronicle. This helps the ST team calibrate content — it doesn\'t affect your individual story.</p>';

  for (const axis of PLAYER_PREF_AXES) {
    const current = prefs[axis.key]?.rating ?? null;
    h += `<div class="player-pref-row" data-pref-key="${esc(axis.key)}">`;
    h += `<span class="player-pref-label">${esc(axis.label)}</span>`;
    h += '<div class="player-pref-dots">';
    for (let i = 1; i <= 5; i++) {
      const filled = current !== null && i <= current;
      h += `<button type="button" class="pref-dot${filled ? ' filled' : ''}" data-value="${i}" aria-label="${esc(axis.label)} ${i}">${filled ? '●' : '○'}</button>`;
    }
    h += '</div>';
    h += '</div>';
  }

  if (updatedAt) {
    h += `<p class="player-prefs-updated">Last updated ${esc(updatedAt)}</p>`;
  }
  h += `<button class="qf-btn qf-btn-submit player-prefs-save" id="player-prefs-save">Save Preferences</button>`;
  h += '</div>';
  return h;
}
```

**Save handler** — wire in `renderOrdealsList` after `el.innerHTML = h`:

```js
const saveBtn = el.querySelector('#player-prefs-save');
if (saveBtn) {
  saveBtn.addEventListener('click', async () => {
    const prefs = {};
    for (const axis of PLAYER_PREF_AXES) {
      const filled = el.querySelector(`.player-pref-row[data-pref-key="${axis.key}"] .pref-dot.filled:last-of-type`);
      // Collect the highest filled dot value
      const dots = el.querySelectorAll(`.player-pref-row[data-pref-key="${axis.key}"] .pref-dot`);
      let rating = null;
      dots.forEach((dot, idx) => {
        if (dot.classList.contains('filled')) rating = idx + 1;
      });
      prefs[axis.key] = { rating };
    }
    try {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      await apiPatch(`/api/characters/${currentChar._id}/player_prefs`, { player_prefs: prefs });
      // Update local char object so re-render shows updated_at
      currentChar.player_prefs = { ...prefs, updated_at: new Date().toISOString() };
      renderOrdealsList(el, currentChar);
    } catch (err) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Preferences';
      alert('Save failed: ' + err.message);
    }
  });
}
```

**Dot toggle handler** — also wire after `el.innerHTML = h`:

```js
el.querySelectorAll('.pref-dot').forEach(dot => {
  dot.addEventListener('click', () => {
    const row = dot.closest('.player-pref-row');
    const clickedVal = +dot.dataset.value;
    const currentFilled = row.querySelectorAll('.pref-dot.filled').length;
    // Clicking the only filled dot deselects (sets to null); otherwise fill up to clicked
    const newVal = (currentFilled === 1 && currentFilled === clickedVal) ? 0 : clickedVal;
    row.querySelectorAll('.pref-dot').forEach((d, idx) => {
      const fill = idx < newVal;
      d.classList.toggle('filled', fill);
      d.textContent = fill ? '●' : '○';
    });
  });
});
```

**CSS classes to add** (in the ordeals tab stylesheet or inline in the component — follow existing patterns):
- `.player-prefs-panel` — panel chrome matching `.xpl-panel` visual style
- `.player-pref-row` — flex row: label left, dots right
- `.player-pref-label` — `min-width: 180px`
- `.player-pref-dots` — flex row of 5 dot buttons
- `.pref-dot` — unstyled button, cursor pointer, font size ~1.2em, colour `--gold2` when filled, muted when hollow
- `.player-prefs-desc` — small italicised note, `--text-muted` colour
- `.player-prefs-updated` — small, muted, below the axes
- `.player-prefs-save` — reuse `qf-btn qf-btn-submit` pattern

---

### Task 4 — ST admin: Player Preferences view

**File:** `public/js/admin/ordeals-admin.js`

**Where**: Add a third toggle button alongside "Marking" / "Rubric Editor":

```js
h += `<button class="or-toggle-btn${activeView === 'prefs' ? ' on' : ''}" data-view="prefs">Player Preferences</button>`;
```

Add `activeView === 'prefs'` branch in `render()`:

```js
} else if (activeView === 'prefs') {
  h += renderPrefsView();
}
```

**Bind the new toggle** in `bindEvents`:
```js
container.querySelectorAll('.or-toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    activeView = btn.dataset.view;
    if (activeView === 'marking') activeSubId = null;
    render();
  });
});
```
(Already a forEach — just ensure the existing handler covers the new button; no change needed if it's already a generic `.or-toggle-btn` listener.)

**`renderPrefsView()` function**:

```js
function renderPrefsView() {
  const active = characters.filter(c => !c.retired);
  // Only include characters that have at least one non-null rating
  const withPrefs = active.filter(c => {
    const p = c.player_prefs || {};
    return PLAYER_PREF_AXES.some(a => p[a.key]?.rating != null);
  });

  // Compute per-axis averages across withPrefs
  const averages = {};
  for (const axis of PLAYER_PREF_AXES) {
    const vals = withPrefs.map(c => c.player_prefs[axis.key]?.rating).filter(v => v != null);
    averages[axis.key] = vals.length ? (vals.reduce((s, v) => s + v, 0) / vals.length) : null;
  }

  let h = '<div class="or-prefs-shell">';

  // ── Campaign aggregate ──
  h += '<div class="or-prefs-aggregate">';
  h += `<h3 class="or-prefs-heading">Campaign Average <span class="or-prefs-meta">${withPrefs.length} of ${active.length} players responded</span></h3>`;
  h += '<table class="or-prefs-table">';
  h += '<thead><tr><th>Preference</th><th>Average</th><th>Visual</th></tr></thead><tbody>';
  for (const axis of PLAYER_PREF_AXES) {
    const avg = averages[axis.key];
    const avgStr = avg !== null ? avg.toFixed(1) : '—';
    const filled = avg !== null ? Math.round(avg) : 0;
    const dots = Array.from({ length: 5 }, (_, i) => i < filled ? '●' : '○').join('');
    h += `<tr><td>${esc(axis.label)}</td><td class="or-prefs-avg">${esc(avgStr)}</td><td class="or-prefs-dots">${dots}</td></tr>`;
  }
  h += '</tbody></table>';
  h += '</div>';

  // ── Per-character breakdown ──
  h += '<div class="or-prefs-chars">';
  h += '<h3 class="or-prefs-heading">Per Character</h3>';
  if (!withPrefs.length) {
    h += '<p class="placeholder">No characters have set preferences yet.</p>';
  } else {
    h += '<table class="or-prefs-table or-prefs-chars-table">';
    h += '<thead><tr><th>Character</th>';
    for (const axis of PLAYER_PREF_AXES) h += `<th title="${esc(axis.label)}">${esc(axis.label.split(' ')[0])}</th>`;
    h += '</tr></thead><tbody>';
    for (const c of [...withPrefs].sort((a, b) => displayName(a).localeCompare(displayName(b)))) {
      const p = c.player_prefs || {};
      const updatedAt = p.updated_at
        ? new Date(p.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : null;
      h += `<tr><td>${esc(displayName(c))}${updatedAt ? `<br><small class="or-prefs-date">${esc(updatedAt)}</small>` : ''}</td>`;
      for (const axis of PLAYER_PREF_AXES) {
        const rating = p[axis.key]?.rating ?? null;
        h += `<td class="or-prefs-cell">${rating !== null ? rating : '<span class="or-prefs-null">—</span>'}</td>`;
      }
      h += '</tr>';
    }
    h += '</tbody></table>';
  }
  h += '</div>';

  h += '</div>';
  return h;
}
```

**Import `displayName`** — already imported at line 8 of `ordeals-admin.js`.

**CSS additions** (in ordeals admin stylesheet):
- `.or-prefs-shell` — padding, two stacked sections
- `.or-prefs-aggregate`, `.or-prefs-chars` — `bd-panel` visual style, matching existing admin panels
- `.or-prefs-heading` — matches `or-detail-header` sizing
- `.or-prefs-table` — clean table: `border-collapse: collapse`, alternating rows
- `.or-prefs-avg`, `.or-prefs-dots` — `text-align: right`, monospace dots
- `.or-prefs-meta` — small muted span
- `.or-prefs-date` — `font-size: 0.75em`, muted
- `.or-prefs-null` — opacity 0.35
- `.or-prefs-cell` — `text-align: center`

---

### What NOT to change

- `PUT /api/characters/:id` — ST-only, do not relax
- `initOrdeals` signature — `(char, chars, containerEl)` is consumed by `app.js:454`; don't change it
- Existing ordeal card rendering, XP breakdown, form navigation — no changes
- `initOrdealsAdminView(chars)` signature — consumed by `admin.js:279`; don't change it
- The `chars` array passed to `initOrdealsAdminView` already contains `player_prefs` once the schema is registered and players have saved preferences

---

### Test manually

1. As a player (use `localTestLogin()` or dev site):
   - Open the Ordeals / XP tab → "Chronicle Preferences" section appears below Player Ordeals
   - Click dots on several axes → dots fill up to clicked value
   - Click the only filled dot on an axis → it deselects (null)
   - Click "Save Preferences" → "Last updated [today]" appears; no page error
   - Reload → ratings persist
2. As an ST (admin):
   - Open Player → select any character → Ordeals domain → "Player Preferences" toggle appears
   - Click it → see per-character table; empty state if no one has saved yet
   - After player saves → "Campaign Average" table shows averages; per-character row shows ratings
3. Schema validation:
   - A normal character save (PUT via ST) after adding schema entry succeeds with no "additional properties" error

---

---

## Dev Agent Record

### File List
- `server/schemas/character.schema.js` — added `player_prefs` subdocument schema
- `server/routes/characters.js` — added `PATCH /:id/player_prefs` endpoint
- `public/js/tabs/ordeals-view.js` — added `PLAYER_PREF_AXES`, `renderPlayerPrefs()`, dot-toggle + save event handlers; imported `apiPatch`
- `public/js/admin/ordeals-admin.js` — added `PLAYER_PREF_AXES`, `renderPrefsView()`, third "Player Preferences" toggle
- `public/css/player-layout.css` — added `.player-prefs-*` and `.pref-dot` styles
- `public/css/admin-layout.css` — added `.or-prefs-*` styles

### Change Log
- 2026-06-02: Implemented feature.542 — player preferences widget. Schema first, then scoped PATCH endpoint, then player UI, then ST admin aggregate view.

### Completion Notes
All four tasks implemented in sequence per story spec. Schema registered before any UI code. Player PATCH endpoint mirrors `safe_place_locations` auth pattern. Player widget uses clickable dot buttons (●/○) with toggle-to-deselect behaviour. ST admin adds a third toggle view with campaign average table + per-character breakdown. CSS uses existing token system (no bare hex). All files pass Node.js syntax check.

---

### Dev notes: sequence

**Must do in order:**
1. Schema first (`character.schema.js`)
2. Server route (`characters.js`)
3. Player UI (`ordeals-view.js`)
4. ST admin view (`ordeals-admin.js`)

If you add UI before the schema, any test save will fail with a 400 validation error.
