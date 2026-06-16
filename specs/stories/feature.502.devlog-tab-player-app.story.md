# Story feature.502: Devlog tab — player-facing rule changes and app roadmap

**Story ID:** feature.502
**Epic:** Player portal transparency
**Status:** review
**Date:** 2026-05-28
**Issue:** [#502](https://github.com/angelusvmorningstar/TerraMortis/issues/502)
**Branch:** morningstar-issue-502-devlog-tab-player-app

---

## User Story

As a player, I want a Devlog tab in the player app so that I can see which rules are under consideration for change and what app features are coming, without having to ask an ST.

As an ST, I want to create and manage devlog entries through the admin panel so that I can keep players informed without any code deployments.

---

## Background

Players currently have no visibility into upcoming rule changes or app development plans. This creates friction — players make character decisions without knowing a mechanic is about to change, and frequently ask STs about the app roadmap. A dedicated tab in the player app, ST-authored via the admin panel, gives players a single authoritative place to check.

The tab has two content sections:
1. **Rules under consideration** — rules being reviewed for change, with status and estimated game cycle for implementation.
2. **App development map** — upcoming and in-progress app features, giving players visibility into what is being built.

---

## Acceptance Criteria

- [ ] New MongoDB collection `devlog_entries` stores entries per the schema below
- [ ] `GET /api/devlog` returns all entries (requireAuth, no ST role required)
- [ ] `POST /api/devlog` creates an entry (requireRole('st'))
- [ ] `PATCH /api/devlog/:id` updates an entry (requireRole('st'))
- [ ] `DELETE /api/devlog/:id` deletes an entry (requireRole('st'))
- [ ] Admin panel has a Devlog domain: ST can create, edit, and delete entries
- [ ] Player app has a Devlog tab: entries rendered read-only, grouped by `type`
- [ ] Status displayed as a human-readable chip, not the raw enum value
- [ ] Implemented and deferred entries rendered in a collapsed "Resolved" section, hidden by default, togglable
- [ ] Tab name in the sidebar button: **Devlog**

---

## Schema

### Collection: `devlog_entries`

```js
// server/schemas/devlog_entry.schema.js
export const devlogEntrySchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Devlog Entry',
  type: 'object',
  required: ['type', 'title', 'status'],
  additionalProperties: true,
  properties: {
    type:         { type: 'string', enum: ['rule_change', 'app_feature'] },
    title:        { type: 'string', minLength: 1 },
    body:         { type: 'string' },           // plain text; optional
    status:       { type: 'string', enum: ['considering', 'confirmed', 'in_progress', 'implemented', 'deferred'] },
    target_cycle: { type: 'string' },           // e.g. "Game 4" or "2026-08"; optional
    created_at:   { type: 'string' },
    updated_at:   { type: 'string' },
  },
};
```

### Status label map (shared between admin and player modules)

```js
export const DEVLOG_STATUS_LABELS = {
  considering:  'Under Consideration',
  confirmed:    'Confirmed',
  in_progress:  'In Progress',
  implemented:  'Implemented',
  deferred:     'Deferred',
};

export const DEVLOG_TYPE_LABELS = {
  rule_change:  'Rule Change',
  app_feature:  'App Feature',
};
```

"Resolved" entries = status is `implemented` or `deferred`. These go in the collapsed section.

---

## Implementation

### 1. Server — schema file

**New file:** `server/schemas/devlog_entry.schema.js`

Export `devlogEntrySchema` per the schema block above.

---

### 2. Server — route file

**New file:** `server/routes/devlog.js`

Follow the same ES module pattern as `server/routes/game-sessions.js`:

```js
import { Router }   from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole }   from '../middleware/auth.js';
import { validate }      from '../middleware/validate.js';
import { devlogEntrySchema } from '../schemas/devlog_entry.schema.js';

const router = Router();
const col    = () => getCollection('devlog_entries');

// GET — all players can read
router.get('/', async (req, res) => {
  const entries = await col().find({}).sort({ created_at: -1 }).toArray();
  res.json(entries);
});

// POST — ST only
router.post('/', requireRole('st'), validate(devlogEntrySchema), async (req, res) => {
  const now  = new Date().toISOString();
  const doc  = { ...req.body, created_at: now, updated_at: now };
  const result = await col().insertOne(doc);
  res.status(201).json({ ...doc, _id: result.insertedId });
});

// PATCH — ST only
router.patch('/:id', requireRole('st'), async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'BAD_ID' });
  const update = { ...req.body, updated_at: new Date().toISOString() };
  delete update._id;
  const result = await col().findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: update },
    { returnDocument: 'after' }
  );
  if (!result) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json(result);
});

// DELETE — ST only
router.delete('/:id', requireRole('st'), async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'BAD_ID' });
  const result = await col().deleteOne({ _id: new ObjectId(id) });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({ ok: true });
});

export default router;
```

---

### 3. Server — register route in `server/index.js`

Add import near the other route imports (alphabetical order is conventional):

```js
import devlogRouter from './routes/devlog.js';
```

Add mount — `requireAuth` gates reading; the route itself applies `requireRole('st')` on writes:

```js
app.use('/api/devlog', requireAuth, noCache(), devlogRouter);
```

---

### 4. Player app — `public/player.html`

**Sidebar button** — add after the Tickets button (line 77):

```html
      <button class="sidebar-btn" data-tab="devlog">Devlog</button>
```

**Tab panel** — add after `<section id="tab-tickets">` (line 124):

```html
      <section id="tab-devlog" class="tab-panel">
        <div id="devlog-content"></div>
      </section>
```

---

### 5. Player tab module — `public/js/tabs/devlog-tab.js`

**New file.** The devlog tab is character-independent (same content for all players). Follow the `story-tab.js` fetch → render → bind pattern.

```js
import { apiGet } from '../data/api.js';
import { esc }    from '../data/helpers.js';

const DEVLOG_STATUS_LABELS = {
  considering: 'Under Consideration',
  confirmed:   'Confirmed',
  in_progress: 'In Progress',
  implemented: 'Implemented',
  deferred:    'Deferred',
};

const DEVLOG_TYPE_LABELS = {
  rule_change: 'Rule Change',
  app_feature: 'App Feature',
};

export async function renderDevlogTab(el) {
  el.innerHTML = '<p class="placeholder-msg">Loading…</p>';
  let entries = [];
  try {
    entries = await apiGet('/api/devlog');
  } catch (err) {
    el.innerHTML = `<p class="placeholder-msg">Failed to load: ${esc(err.message)}</p>`;
    return;
  }

  const active   = entries.filter(e => e.status !== 'implemented' && e.status !== 'deferred');
  const resolved = entries.filter(e => e.status === 'implemented' || e.status === 'deferred');

  const byType = (list, type) => list.filter(e => e.type === type);

  let h = '<div class="devlog-tab">';

  // ── Rule Changes ──
  h += _renderSection('Rule Changes', byType(active, 'rule_change'));

  // ── App Features ──
  h += _renderSection('App Development', byType(active, 'app_feature'));

  // ── Resolved (collapsed) ──
  if (resolved.length) {
    h += `<details class="devlog-resolved">`;
    h += `<summary class="devlog-resolved-toggle">Resolved (${resolved.length})</summary>`;
    h += _renderSection('Rule Changes', byType(resolved, 'rule_change'), true);
    h += _renderSection('App Development', byType(resolved, 'app_feature'), true);
    h += `</details>`;
  }

  if (!active.length && !resolved.length) {
    h += '<p class="placeholder-msg">Nothing posted yet.</p>';
  }

  h += '</div>';
  el.innerHTML = h;
}

function _renderSection(heading, items, inResolved = false) {
  if (!items.length) return '';
  let h = `<div class="devlog-section">`;
  h += `<h3 class="devlog-section-heading">${esc(heading)}</h3>`;
  for (const entry of items) {
    const statusLabel = DEVLOG_STATUS_LABELS[entry.status] || entry.status;
    h += `<div class="devlog-card">`;
    h += `<div class="devlog-card-header">`;
    h += `<span class="devlog-title">${esc(entry.title)}</span>`;
    h += `<span class="devlog-status devlog-status--${esc(entry.status)}">${esc(statusLabel)}</span>`;
    h += `</div>`;
    if (entry.body) {
      h += `<p class="devlog-body">${esc(entry.body)}</p>`;
    }
    if (entry.target_cycle) {
      h += `<div class="devlog-target">Target: ${esc(entry.target_cycle)}</div>`;
    }
    h += `</div>`;
  }
  h += `</div>`;
  return h;
}
```

---

### 6. Player.js — wire up the lazy renderer

The devlog tab is character-independent. However, since it is in the lazy-render system with the other tabs, the simplest approach is to add it to `_lazyRenderers` and note it does not use `activeChar`. It will re-render on character switch, which is acceptable for v1 (the fetch is trivial).

**`public/js/player.js`** — add import at the top (near the other tab imports):

```js
import { renderDevlogTab } from './tabs/devlog-tab.js';
```

**Add to `_lazyRenderers`** (after line 390, following existing pattern):

```js
  devlog: () => renderDevlogTab(document.getElementById('devlog-content')),
```

---

### 7. Admin app — `public/admin.html`

**Sidebar button** — add after the ST Mods Audit button (line 63):

```html
      <button class="sidebar-btn" data-domain="devlog">Devlog</button>
```

**Domain section** — add after the `d-st-mods-audit` section (after line 197):

```html
    <section id="d-devlog" class="domain">
      <div class="domain-header"><h2>Devlog</h2></div>
      <div id="devlog-admin-content"></div>
    </section>
```

---

### 8. Admin management module — `public/js/admin/devlog-admin.js`

**New file.** Follows the `players-view.js` / `tickets-views.js` pattern: module state, `init` export, `render()`, `bindEvents()`.

```js
import { apiGet, apiPost, apiPatch, apiDelete } from '../data/api.js';
import { esc } from '../data/helpers.js';

const STATUS_OPTS = [
  { value: 'considering',  label: 'Under Consideration' },
  { value: 'confirmed',    label: 'Confirmed' },
  { value: 'in_progress',  label: 'In Progress' },
  { value: 'implemented',  label: 'Implemented' },
  { value: 'deferred',     label: 'Deferred' },
];

const TYPE_OPTS = [
  { value: 'rule_change',  label: 'Rule Change' },
  { value: 'app_feature',  label: 'App Feature' },
];

let _entries  = [];
let _editingId = null;  // null | 'new' | entry._id

export async function initDevlogAdmin(contentEl) {
  contentEl.innerHTML = '<p class="placeholder">Loading…</p>';
  try {
    _entries = await apiGet('/api/devlog');
  } catch (err) {
    contentEl.innerHTML = `<p class="placeholder">Failed: ${esc(err.message)}</p>`;
    return;
  }
  _editingId = null;
  _render(contentEl);
}

function _render(root) {
  let h = `<div class="dl-admin-toolbar">`;
  h += `<button class="btn-sm dl-add-btn">+ Add Entry</button>`;
  h += `</div>`;

  if (_editingId === 'new') {
    h += _form(null);
  }

  h += `<div class="dl-admin-list">`;
  for (const entry of _entries) {
    if (_editingId === entry._id) {
      h += _form(entry);
    } else {
      h += _card(entry);
    }
  }
  h += `</div>`;

  root.innerHTML = h;
  _bindEvents(root);
}

function _form(entry) {
  const isNew = !entry;
  const id    = entry?._id || '';
  const statusOpts = STATUS_OPTS.map(o =>
    `<option value="${o.value}"${entry?.status === o.value ? ' selected' : ''}>${esc(o.label)}</option>`
  ).join('');
  const typeOpts = TYPE_OPTS.map(o =>
    `<option value="${o.value}"${entry?.type === o.value ? ' selected' : ''}>${esc(o.label)}</option>`
  ).join('');

  return `
    <form class="dl-form" data-id="${esc(id)}">
      <div class="dl-form-row">
        <label>Type <select name="type">${typeOpts}</select></label>
        <label>Status <select name="status">${statusOpts}</select></label>
      </div>
      <div class="dl-form-row">
        <label>Title <input type="text" name="title" value="${esc(entry?.title || '')}" required></label>
      </div>
      <div class="dl-form-row">
        <label>Body <textarea name="body" rows="3">${esc(entry?.body || '')}</textarea></label>
      </div>
      <div class="dl-form-row">
        <label>Target cycle <input type="text" name="target_cycle" value="${esc(entry?.target_cycle || '')}" placeholder="e.g. Game 4"></label>
      </div>
      <div class="dl-form-actions">
        <button type="submit" class="btn-sm">${isNew ? 'Create' : 'Save'}</button>
        <button type="button" class="btn-sm dl-cancel-btn">Cancel</button>
        <span class="dl-form-error" style="color:var(--crim)"></span>
      </div>
    </form>
  `;
}

function _card(entry) {
  const statusLabel = STATUS_OPTS.find(o => o.value === entry.status)?.label || entry.status;
  const typeLabel   = TYPE_OPTS.find(o => o.value === entry.type)?.label   || entry.type;
  return `
    <div class="dl-card" data-id="${esc(entry._id)}">
      <div class="dl-card-meta">
        <span class="dl-type-chip">${esc(typeLabel)}</span>
        <span class="dl-status-chip dl-status--${esc(entry.status)}">${esc(statusLabel)}</span>
        ${entry.target_cycle ? `<span class="dl-target">Target: ${esc(entry.target_cycle)}</span>` : ''}
      </div>
      <div class="dl-card-title">${esc(entry.title)}</div>
      ${entry.body ? `<div class="dl-card-body">${esc(entry.body)}</div>` : ''}
      <div class="dl-card-actions">
        <button class="btn-sm dl-edit-btn">Edit</button>
        <button class="btn-sm dl-delete-btn" style="color:var(--crim)">Delete</button>
      </div>
    </div>
  `;
}

function _bindEvents(root) {
  const contentEl = root;

  root.querySelector('.dl-add-btn')?.addEventListener('click', () => {
    _editingId = 'new';
    _render(contentEl);
  });

  root.querySelectorAll('.dl-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _editingId = btn.closest('.dl-card').dataset.id;
      _render(contentEl);
    });
  });

  root.querySelectorAll('.dl-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('.dl-card').dataset.id;
      if (!confirm('Delete this devlog entry?')) return;
      try {
        await apiDelete(`/api/devlog/${id}`);
        _entries = _entries.filter(e => e._id !== id);
        _render(contentEl);
      } catch (err) {
        alert(`Delete failed: ${err.message}`);
      }
    });
  });

  root.querySelectorAll('.dl-cancel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _editingId = null;
      _render(contentEl);
    });
  });

  root.querySelectorAll('.dl-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl  = form.querySelector('.dl-form-error');
      const id     = form.dataset.id;
      const isNew  = !id;
      const data   = Object.fromEntries(new FormData(form));

      try {
        if (isNew) {
          const created = await apiPost('/api/devlog', data);
          _entries.unshift(created);
        } else {
          const updated = await apiPatch(`/api/devlog/${id}`, data);
          const idx = _entries.findIndex(e => e._id === id);
          if (idx !== -1) _entries[idx] = updated;
        }
        _editingId = null;
        _render(contentEl);
      } catch (err) {
        errEl.textContent = err.message;
      }
    });
  });
}
```

---

### 9. Admin.js — wire up the domain

**`public/js/admin.js`** — add import at the top:

```js
import { initDevlogAdmin } from './admin/devlog-admin.js';
```

**Add to `switchDomain()`** after the `st-mods-audit` handler (line 283):

```js
  if (domain === 'devlog') initDevlogAdmin(document.getElementById('devlog-admin-content'));
```

---

## Files to Change / Create

| File | Action |
|---|---|
| `server/schemas/devlog_entry.schema.js` | **Create** |
| `server/routes/devlog.js` | **Create** |
| `server/index.js` | **Update** — import + mount |
| `public/player.html` | **Update** — sidebar button + tab panel |
| `public/js/tabs/devlog-tab.js` | **Create** |
| `public/js/player.js` | **Update** — import + `_lazyRenderers` entry |
| `public/admin.html` | **Update** — sidebar button + domain section |
| `public/js/admin/devlog-admin.js` | **Create** |
| `public/js/admin.js` | **Update** — import + `switchDomain` handler |

No existing collection is touched. No character schema changes.

---

## Dev Notes

- The `validate` middleware in the route is applied to POST only. PATCH is intentionally open (no schema validation) — partial updates are normal for editing single fields. This matches the pattern in other routes.
- `apiDelete` exists in `public/js/data/api.js` (line 37) — import it alongside `apiGet`, `apiPost`, `apiPatch`.
- CSS: devlog cards follow the `.bd-panel` / proc-card visual language. Use existing surface tokens (`--surf1`, `--surf2`, `--gold2`) for card backgrounds and headings. Status chips should reuse the `.proc-val-status` chip pattern. Do not invent new colour tokens.
- The `<details>`/`<summary>` element for the resolved section is native HTML — no JS needed for the toggle.
- British English in all UI strings: "Under Consideration", not "Under Review"; "Deferred", not "Postponed".
- The admin sidebar currently has 14 buttons. Devlog makes 15. No layout change is needed — the sidebar scrolls.
- `esc()` must wrap every user-supplied string rendered into HTML. No exceptions.

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes
- All 9 files created/updated. 5 new: `server/schemas/devlog_entry.schema.js`, `server/routes/devlog.js`, `public/js/tabs/devlog-tab.js`, `public/js/admin/devlog-admin.js`. 4 updated: `server/index.js`, `public/player.html`, `public/admin.html`, `public/js/player.js`, `public/js/admin.js`.
- Route mounted at `/api/devlog` with `requireAuth` + `noCache()`. ST role enforcement is handled inside the route (requireRole on POST/PATCH/DELETE).
- Player tab uses native `<details>`/`<summary>` for the resolved section — no JS toggle needed.
- All new JS files pass node parse check as ES modules.

### QA Notes (Quinn, claude-sonnet-4-6)
- API tests: 17/17 pass — `server/tests/api-devlog.test.js` (Vitest + Supertest). Covers auth (401/403), GET as player, POST 201 + 400 schema, PATCH 200/400/404, DELETE 200/404/400.
- Admin E2E: 5/5 pass — `tests/issue-502-devlog-tab.spec.js` (Playwright). Covers sidebar button, domain load, empty state, card rendering with human-readable chips, Add Entry form.
- Player E2E: 5 tests marked `test.fixme()` — **root cause: `player.html` contains an unconditional `window.location.replace('/')` redirect shim that navigates to `index.html` (the Game App) before `#player-app` is ever rendered**. The devlog tab implementation in `public/player.html` / `public/js/player.js` / `public/js/tabs/devlog-tab.js` is correct but unreachable via normal browser navigation. **Resolution required before AC#7-10 can be green-lit:** port the devlog tab to `index.html` / `public/js/app.js`, OR remove the redirect and restore `player.html` as the canonical player portal entry point.
- `server/tests/helpers/test-app.js` updated to include `devlogRouter`.

### File List
- `server/schemas/devlog_entry.schema.js` — new
- `server/routes/devlog.js` — new
- `server/index.js` — import + mount added
- `public/player.html` — sidebar button + tab panel added
- `public/js/tabs/devlog-tab.js` — new
- `public/js/player.js` — import + _lazyRenderers entry added
- `public/admin.html` — sidebar button + domain section added
- `public/js/admin/devlog-admin.js` — new
- `public/js/admin.js` — import + switchDomain handler added
- `server/tests/helpers/test-app.js` — devlogRouter added
- `server/tests/api-devlog.test.js` — new (17 API tests)
- `tests/issue-502-devlog-tab.spec.js` — new (5 admin E2E pass; 5 player fixme pending redirect fix)

---

## References

- Pattern reference: `public/js/admin/players-view.js` (CRUD form + card list)
- Pattern reference: `server/routes/game-sessions.js` (route shape)
- Pattern reference: `server/schemas/game_session.schema.js` (schema shape)
- Tab registration: `public/js/player.js` lines 374–390 (`_lazyRenderers`)
- Admin domain dispatch: `public/js/admin.js` lines 256–307 (`switchDomain`)
- HTML insertion points: `public/player.html` lines 77, 124; `public/admin.html` lines 63, 197
- CSS chip pattern: `.proc-val-status` in `public/css/admin-layout.css`
- Issue: [#502](https://github.com/angelusvmorningstar/TerraMortis/issues/502)
