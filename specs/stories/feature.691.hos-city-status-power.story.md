---
issue: 691
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/691
branch: ms/issue-691-hos-city-status-power
status: review
---

# feature.691 — Head of State: City Status Power (Phase 1)

## Story

As a player holding the Head of State office, I want interactive controls on the Office tab so I can exercise my per-session city status budget — raising, lowering, granting first, or stripping last dots — and have every action logged publicly on the Status tab for all players to see.

## Acceptance Criteria

- [ ] **AC1 — Office tab interactive section**: When a character's `court_category === 'Head of State'` the Office tab renders a "Status Actions" section below the Status Power description with: budget display, character picker, and action buttons.
- [ ] **AC2 — Budget display**: Shows "N of M actions remaining this session" where M = `calcCityStatus(char)` (effective city status) and N = M minus paid actions already used this session. Updates in real time after each action.
- [ ] **AC3 — Character picker**: Typeahead picker using the existing `charPicker` component. Self-excluded (`excludeIds: [char._id]`). Lists all non-retired characters by display name.
- [ ] **AC4 — Paid actions (Raise / Lower)**: Buttons appear when a target is selected. Raise increments `status.city` by 1 (disabled when target is at max or budget is exhausted). Lower decrements by 1 (disabled when target is at min ≥1 or budget exhausted). Each target may only receive one paid action per session from this actor.
- [ ] **AC5 — Free actions (Grant First / Strip Last)**: "Grant First Dot" button appears when target's effective city status is 0. "Strip Last Dot" button appears when target's effective city status is 1. Both are free — they do not consume budget and have no per-target uniqueness constraint.
- [ ] **AC6 — Server atomicity**: The `POST /api/office_actions` endpoint records the action AND updates the target character's `status.city` in a single handler. Returns the updated character and action record.
- [ ] **AC7 — Paid action uniqueness enforced server-side**: Server rejects a second paid (raise/lower) action on the same target by the same actor in the same session with `409 CONFLICT`.
- [ ] **AC8 — Status tab public log**: `GET /api/office_actions?game_session_id=X` is called by the Status tab after the carousel. The "City Status Changes" log section lists all actions for the session (actor → target, action type, timestamp) visible to all authenticated users.
- [ ] **AC9 — Free actions are publicly logged**: Grant First and Strip Last appear in the status tab log with their own display labels.
- [ ] **AC10 — Office tab CSS loads in the unified app**: All office tab styles visible in `index.html` (which loads `suite.css`, not `player-layout.css`).

## Background: Rules

From `public/js/tabs/office-data.js` `OFFICE_DATA['Head of State'].statusPower`:

> "Each session, you can raise or lower another's City Status by 1. You can do this a number of times per session equal to your own Effective City Status. You cannot raise or lower the same character more than once per session [...] You can strip a character's last dot of City Status, casting them out of the domain. You can grant the first dot of City Status to newcomers at no cost."

Phase 1 scope: HoS only. Socialite has an identical per-game budget power (per `OFFICE_DATA['Socialite'].statusPower`) — that is a future story.

## Dev Notes

### T1 — Branch sync

```
git fetch origin
git log HEAD..origin/dev --oneline   # check what's on dev
git merge origin/dev
```

Resolve any conflicts (sprint-status.yaml: keep all entries from both sides).

---

### T2 — New collection & API

#### 2a. Schema file: `server/schemas/office_action.schema.js`

```js
export const officeActionSchema = {
  type: 'object',
  required: ['game_session_id', 'actor_id', 'target_id', 'action_type'],
  additionalProperties: false,
  properties: {
    game_session_id: { type: 'string' },
    actor_id:        { type: 'string' },
    target_id:       { type: 'string' },
    action_type:     { type: 'string', enum: ['grant_first', 'raise', 'lower', 'strip_last'] },
  },
};
```

#### 2b. Route file: `server/routes/office-actions.js`

Full route. Endpoints:

**`GET /api/office_actions/latest_session`**
Returns the most recent game session (`session_date <= today`) to let the client determine the active budget scope. Returns `{ _id, title, session_date, game_number }` or `null`.

```js
import { Router } from 'express';
import { getCollection } from '../db.js';
import { ObjectId } from 'mongodb';
import { validate } from '../middleware/validate.js';
import { officeActionSchema } from '../schemas/office_action.schema.js';

const TITLE_STATUS_BONUS = {
  'Head of State': 3, 'Primogen': 2, 'Socialite': 1, 'Enforcer': 1, 'Administrator': 1,
};
const PAID_TYPES = new Set(['raise', 'lower']);

const router = Router();
const col    = () => getCollection('office_actions');

// GET /api/office_actions/latest_session
router.get('/latest_session', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const session = await getCollection('game_sessions').findOne(
    { session_date: { $lte: today } },
    { sort: { session_date: -1 }, projection: { _id: 1, title: 1, session_date: 1, game_number: 1 } },
  );
  res.json(session || null);
});

// GET /api/office_actions?game_session_id=X[&actor_id=Y]
router.get('/', async (req, res) => {
  const { game_session_id, actor_id } = req.query;
  if (!game_session_id) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'game_session_id required' });
  const filter = { game_session_id };
  if (actor_id) filter.actor_id = actor_id;
  const docs = await col().find(filter).sort({ timestamp: 1 }).toArray();
  res.json(docs);
});

// POST /api/office_actions
router.post('/', validate(officeActionSchema), async (req, res) => {
  const { game_session_id, actor_id, target_id, action_type } = req.body;

  if (actor_id === target_id)
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Cannot target yourself' });

  // Load actor
  const actor = await getCollection('characters').findOne({ _id: new ObjectId(actor_id) });
  if (!actor) return res.status(404).json({ error: 'NOT_FOUND', message: 'Actor not found' });
  if (!actor.court_category)
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Actor holds no court office' });

  // Budget check for paid actions
  if (PAID_TYPES.has(action_type)) {
    const budget = (actor.status?.city || 0) + (TITLE_STATUS_BONUS[actor.court_category] || 0);
    const used = await col().countDocuments({ game_session_id, actor_id, action_type: { $in: ['raise', 'lower'] } });
    if (used >= budget)
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Budget exhausted for this session' });
    // Uniqueness: paid action on this target already?
    const dup = await col().findOne({ game_session_id, actor_id, target_id, action_type: { $in: ['raise', 'lower'] } });
    if (dup)
      return res.status(409).json({ error: 'CONFLICT', message: 'Target already acted on this session' });
  }

  // Load target, compute status change
  const target = await getCollection('characters').findOne({ _id: new ObjectId(target_id) });
  if (!target) return res.status(404).json({ error: 'NOT_FOUND', message: 'Target not found' });

  const old_status = target.status?.city || 0;
  let new_status;
  if (action_type === 'grant_first') {
    if (old_status !== 0) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Target already has City Status' });
    new_status = 1;
  } else if (action_type === 'raise') {
    if (old_status >= 10) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Target is at max City Status' });
    new_status = old_status + 1;
  } else if (action_type === 'lower') {
    if (old_status <= 1) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Use strip_last to remove the final dot' });
    new_status = old_status - 1;
  } else { // strip_last
    if (old_status !== 1) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Target must be at exactly 1 City Status' });
    new_status = 0;
  }

  // Atomic: record action + mutate target's status.city
  const timestamp = new Date().toISOString();
  const doc = {
    game_session_id,
    actor_id,
    actor_name: actor.moniker || actor.name || actor_id,
    target_id,
    target_name: target.moniker || target.name || target_id,
    action_type,
    old_status,
    new_status,
    timestamp,
  };
  const inserted = await col().insertOne(doc);
  await getCollection('characters').updateOne(
    { _id: new ObjectId(target_id) },
    { $set: { 'status.city': new_status, updated_at: timestamp } },
  );

  res.status(201).json({ action: { ...doc, _id: inserted.insertedId }, new_status });
});

export default router;
```

#### 2c. Mount in `server/index.js`

Add import at the top (with other router imports, around line 9-25):
```js
import officeActionsRouter from './routes/office-actions.js';
```

Add mount after existing routes (around line 174, before "// Start server"):
```js
app.use('/api/office_actions', requireAuth, noCache(), officeActionsRouter);
```

**Auth note**: `requireAuth` only — no role gate. Any authenticated player may POST (server validates `actor.court_category`). This lets HoS players exercise their own power from the player-facing app.

---

### T3 — Office tab: interactive Status Actions section

#### 3a. Update `public/js/tabs/office-tab.js`

Change signature from `(el, char)` to `(el, char, chars = [])` so the character picker has the full roster.

Import additions at top:
```js
import { apiGet, apiPost } from '../data/api.js';
import { calcCityStatus } from '../data/accessors.js';
import { charPicker, setCharPickerSources } from '../components/character-picker.js';
import { displayName } from '../data/helpers.js';
```

After the `STATUS_POWER` section is rendered and before Manoeuvres, inject a new section **only for HoS**:

```js
// For HoS: render the interactive status actions section (others get static text only)
if (char.court_category === 'Head of State') {
  h += `<div class="office-section office-actions-section">`;
  h += `<div class="office-section-hd">Status Actions — this session</div>`;
  h += `<div class="office-budget-line">Loading…</div>`;
  h += `<div class="office-picker-mount"></div>`;
  h += `<div class="office-action-btns"></div>`;
  h += `<div class="office-action-msg" aria-live="polite"></div>`;
  h += `</div>`;
}
```

After `el.innerHTML = h`, wire the interactive section:

```js
if (char.court_category === 'Head of State') {
  _wireHosActions(el, char, chars);
}
```

#### 3b. New private function `_wireHosActions(el, char, chars)`

```js
async function _wireHosActions(el, char, chars) {
  const budgetLine  = el.querySelector('.office-budget-line');
  const pickerMount = el.querySelector('.office-picker-mount');
  const btnArea     = el.querySelector('.office-action-btns');
  const msgEl       = el.querySelector('.office-action-msg');

  // 1. Fetch current game session
  let session = null;
  try { session = await apiGet('/api/office_actions/latest_session'); } catch { /* ignore */ }
  const sessionId = session ? String(session._id) : null;

  // 2. Load prior actions for this actor in this session
  let priorActions = [];
  if (sessionId) {
    try { priorActions = await apiGet(`/api/office_actions?game_session_id=${encodeURIComponent(sessionId)}&actor_id=${encodeURIComponent(String(char._id))}`); }
    catch { /* ignore */ }
  }

  // Compute budget
  const budget    = calcCityStatus(char);           // inherent + title + regent bonus
  const paidUsed  = priorActions.filter(a => a.action_type === 'raise' || a.action_type === 'lower').length;
  const remaining = Math.max(0, budget - paidUsed);

  function renderBudget() {
    const r = Math.max(0, budget - priorActions.filter(a => a.action_type === 'raise' || a.action_type === 'lower').length);
    if (!sessionId) {
      budgetLine.textContent = 'No active game session found.';
    } else {
      budgetLine.textContent = `${r} of ${budget} actions remaining this session`;
      budgetLine.className = 'office-budget-line' + (r === 0 ? ' exhausted' : '');
    }
  }
  renderBudget();

  // 3. Character picker
  const activeId = String(char._id);
  const nonRetired = chars.filter(c => !c.retired);
  setCharPickerSources({ all: nonRetired, attendees: [] });

  let selectedChar = null;

  const picker = charPicker({
    scope: 'all',
    cardinality: 'single',
    initial: null,
    placeholder: 'Search character…',
    excludeIds: [activeId],
    onChange: (sel) => {
      selectedChar = sel ? nonRetired.find(c => String(c._id) === sel.id) : null;
      renderButtons();
    },
  });
  pickerMount.appendChild(picker);

  // 4. Action buttons
  function renderButtons() {
    btnArea.innerHTML = '';
    if (!selectedChar || !sessionId) return;

    const targetStatus = selectedChar.status?.city || 0;
    // Check if this target already had a paid action from this actor
    const alreadyPaid = priorActions.some(
      a => a.target_id === String(selectedChar._id) && (a.action_type === 'raise' || a.action_type === 'lower'),
    );
    const paidRemaining = budget - priorActions.filter(a => a.action_type === 'raise' || a.action_type === 'lower').length;

    const makeBtn = (label, actionType, disabled, title) => {
      const btn = document.createElement('button');
      btn.className = 'btn office-action-btn';
      btn.textContent = label;
      btn.disabled = !!disabled;
      if (title) btn.title = title;
      btn.addEventListener('click', () => doAction(actionType));
      return btn;
    };

    // Paid actions
    const raiseDisabled = alreadyPaid || paidRemaining <= 0 || targetStatus >= 10;
    const lowerDisabled = alreadyPaid || paidRemaining <= 0 || targetStatus <= 1;
    if (targetStatus > 0) {  // only show Raise/Lower when target has status
      btnArea.appendChild(makeBtn('Raise', 'raise', raiseDisabled,
        alreadyPaid ? 'Already acted on this character this session' : undefined));
      btnArea.appendChild(makeBtn('Lower', 'lower', lowerDisabled,
        alreadyPaid ? 'Already acted on this character this session' : undefined));
    }

    // Free actions
    if (targetStatus === 0) {
      btnArea.appendChild(makeBtn('Grant First Dot', 'grant_first', false));
    }
    if (targetStatus === 1) {
      btnArea.appendChild(makeBtn('Strip Last Dot', 'strip_last', false));
    }
  }

  async function doAction(actionType) {
    if (!selectedChar || !sessionId) return;
    msgEl.textContent = 'Saving…';
    try {
      const result = await apiPost('/api/office_actions', {
        game_session_id: sessionId,
        actor_id: String(char._id),
        target_id: String(selectedChar._id),
        action_type: actionType,
      });
      // Update local selected char status so buttons re-render correctly
      if (selectedChar.status) selectedChar.status.city = result.new_status;
      else selectedChar.status = { city: result.new_status };
      // Record in local priorActions for budget display
      priorActions.push(result.action);
      msgEl.textContent = `Done — ${displayName(selectedChar)} is now status ${result.new_status}.`;
      renderBudget();
      renderButtons();
    } catch (err) {
      msgEl.textContent = err.message || 'Action failed.';
    }
  }
}
```

#### 3c. Update call site in `public/js/app.js` (line ~420)

Change:
```js
if (el && char) renderOfficeTab(el, char);
```
To:
```js
if (el && char) renderOfficeTab(el, char, suiteState.chars || []);
```

---

### T4 — Status tab: public log

#### 4a. New `appendOfficeActionsLog(slotEl)` function in `public/js/suite/status.js`

Add as a private async function. Call it after `appendRankingSection` at the bottom of `renderSuiteStatusTab`. Add the required `apiGet` import if not already present.

```js
async function appendOfficeActionsLog(slotEl) {
  if (!slotEl) return;
  let session = null;
  try { session = await apiGet('/api/office_actions/latest_session'); } catch { return; }
  if (!session) return;

  let actions = [];
  try { actions = await apiGet(`/api/office_actions?game_session_id=${encodeURIComponent(String(session._id))}`); }
  catch { return; }

  if (!actions.length) return;

  const ACTION_LABELS = {
    grant_first: 'Granted first dot',
    raise:       'Raised',
    lower:       'Lowered',
    strip_last:  'Stripped last dot',
  };

  const sessionTitle = session.title || (session.game_number ? `Game ${session.game_number}` : 'This session');
  let h = `<div class="office-log-section status-ranking-section">`;
  h += `<div class="status-section-head">`;
  h += `<span class="status-section-title">City Status Changes — ${esc(sessionTitle)}</span>`;
  h += `</div>`;
  h += `<div class="office-log-list">`;
  for (const a of actions) {
    const label = ACTION_LABELS[a.action_type] || a.action_type;
    const ts = new Date(a.timestamp).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true });
    h += `<div class="office-log-row">`;
    h += `<span class="office-log-actor">${esc(a.actor_name)}</span>`;
    h += `<span class="office-log-verb">${label}</span>`;
    h += `<span class="office-log-target">${esc(a.target_name)}</span>`;
    h += `<span class="office-log-status">${a.old_status} → ${a.new_status}</span>`;
    h += `<span class="office-log-time">${ts}</span>`;
    h += `</div>`;
  }
  h += `</div></div>`;

  const wrap = document.createElement('div');
  wrap.innerHTML = h;
  const node = wrap.firstElementChild;
  if (node) slotEl.appendChild(node);
}
```

Add import at top of `status.js` if `apiGet` isn't already imported:
```js
import { apiGet } from '../data/api.js';
```

#### 4b. Add slot and call in `renderSuiteStatusTab`

In the HTML template string (in `h`), after the carousel div, add:
```js
h += `<div id="office-log-slot"></div>`;
```

After `el.innerHTML = h` and the carousel wiring block (after line 386 where `appendRankingSection` is called):
```js
appendOfficeActionsLog(el.querySelector('#office-log-slot'));
```

Note: no `await` — log loads asynchronously without blocking carousel interaction.

---

### T5 — CSS: suite.css

The existing office tab CSS lives in `player-layout.css` (line 2160+). `index.html` loads `suite.css` only — so the office tab has no styles in the unified app today. This story must add them.

Add a new section to `public/css/suite.css`:

```css
/* ── Office tab (suite app) ── */

.office-tab { padding: 20px; max-width: 680px; }
.office-header { margin-bottom: 20px; }
.office-title { font-family: var(--fh); font-size: 22px; color: var(--gold); letter-spacing: .06em; }
.office-role  { font-family: var(--fl); font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: var(--txt2); margin-top: 2px; }

.office-section { margin-bottom: 24px; }
.office-section-hd { font-family: var(--fl); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--gold2); border-bottom: 1px solid var(--bdr); padding-bottom: 4px; margin-bottom: 12px; }

.office-status-power { font-family: var(--fb); font-size: 14px; color: var(--txt); line-height: 1.7; padding: 14px 16px; background: rgba(224,196,122,.06); border: 1px solid var(--gold2); border-radius: 6px; }

.office-manoeuvre-list { display: flex; flex-direction: column; gap: 10px; }
.office-manoeuvre { padding: 10px 14px; background: var(--surf2); border-radius: 5px; }
.office-manoeuvre-name { font-family: var(--fl); font-size: 13px; color: var(--accent); letter-spacing: .04em; margin-bottom: 4px; }
.office-manoeuvre-effect { font-family: var(--fb); font-size: 13px; color: var(--txt2); line-height: 1.5; }

.office-merit-list { display: flex; flex-wrap: wrap; gap: 6px; }
.office-merit-chip { font-family: var(--fl); font-size: 12px; color: var(--txt2); background: var(--surf2); border: 1px solid var(--bdr); border-radius: 4px; padding: 3px 8px; }

/* Interactive status-actions section (HoS) */
.office-budget-line { font-family: var(--fb); font-size: 14px; color: var(--txt); margin-bottom: 12px; }
.office-budget-line.exhausted { color: var(--crim); }

.office-action-btns { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.office-action-btn  { /* inherits from .btn */ }

.office-action-msg { font-family: var(--fb); font-size: 13px; color: var(--txt2); margin-top: 8px; min-height: 20px; }

/* Office log on status tab */
.office-log-section { margin-top: 16px; }
.office-log-list { display: flex; flex-direction: column; gap: 6px; }
.office-log-row  { display: flex; align-items: center; gap: 10px; font-family: var(--fb); font-size: 13px; padding: 6px 10px; background: var(--surf2); border-radius: 4px; }
.office-log-actor  { color: var(--gold2); font-weight: 600; min-width: 90px; }
.office-log-verb   { color: var(--txt2); }
.office-log-target { color: var(--txt); flex: 1; }
.office-log-status { color: var(--txt2); font-size: 12px; white-space: nowrap; }
.office-log-time   { color: var(--txt2); font-size: 11px; opacity: .7; white-space: nowrap; }
```

---

### T6 — Vitest static-grep contracts

Add or update contracts in `server/tests/feature.691.hos-city-status-power.test.js`:

```js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROUTE   = fs.readFileSync('server/routes/office-actions.js', 'utf8');
const TAB     = fs.readFileSync('public/js/tabs/office-tab.js', 'utf8');
const STATUS  = fs.readFileSync('public/js/suite/status.js', 'utf8');
const CSS     = fs.readFileSync('public/css/suite.css', 'utf8');

describe('feature.691 — office actions route', () => {
  it('route has latest_session GET handler', () => expect(ROUTE).toContain("'/latest_session'"));
  it('route validates actor !== target', () => expect(ROUTE).toContain('actor_id === target_id'));
  it('route enforces budget via countDocuments', () => expect(ROUTE).toContain('countDocuments'));
  it('route enforces paid uniqueness via findOne', () => expect(ROUTE).toContain("action_type: { $in: ['raise', 'lower'] }"));
  it('route atomically updates status.city', () => expect(ROUTE).toContain("'status.city'"));
  it('route handles all four action types', () => {
    expect(ROUTE).toContain('grant_first');
    expect(ROUTE).toContain('strip_last');
  });
});

describe('feature.691 — office tab', () => {
  it('accepts chars as third parameter', () => expect(TAB).toMatch(/function renderOfficeTab\s*\(el,\s*char,\s*chars/));
  it('gates interactive section on Head of State', () => expect(TAB).toContain("court_category === 'Head of State'"));
  it('wires HoS actions after innerHTML set', () => expect(TAB).toContain('_wireHosActions'));
  it('uses charPicker component', () => expect(TAB).toContain('charPicker'));
  it('posts to office_actions endpoint', () => expect(TAB).toContain('/api/office_actions'));
});

describe('feature.691 — status tab log', () => {
  it('has office-log-slot in template', () => expect(STATUS).toContain('office-log-slot'));
  it('calls appendOfficeActionsLog', () => expect(STATUS).toContain('appendOfficeActionsLog'));
  it('fetches latest_session for log', () => expect(STATUS).toContain('/api/office_actions/latest_session'));
});

describe('feature.691 — CSS', () => {
  it('office tab base styles present in suite.css', () => expect(CSS).toContain('.office-tab'));
  it('budget exhausted state styled', () => expect(CSS).toContain('.office-budget-line.exhausted'));
  it('office log row styled', () => expect(CSS).toContain('.office-log-row'));
});
```

---

## Implementation Tasks

- [x] **T1** — Branch sync: `git merge origin/dev` (resolve conflicts)
- [x] **T2a** — Create `server/schemas/office_action.schema.js`
- [x] **T2b** — Create `server/routes/office-actions.js` (3 endpoints: GET /latest_session, GET /, POST /)
- [x] **T2c** — Mount route in `server/index.js` at `requireAuth, noCache()`
- [x] **T3a** — Update `public/js/tabs/office-tab.js`: add `chars` param, conditional HoS section, call `_wireHosActions`
- [x] **T3b** — Implement `_wireHosActions(el, char, chars)` in `office-tab.js`
- [x] **T3c** — Update `app.js` line ~420: pass `suiteState.chars || []` to `renderOfficeTab`
- [x] **T4a** — Implement `appendOfficeActionsLog(slotEl)` in `status.js`
- [x] **T4b** — Add `#office-log-slot` to status tab HTML template; call `appendOfficeActionsLog` after `appendRankingSection`
- [x] **T5** — Add office CSS block to `public/css/suite.css`
- [x] **T6** — Create `server/tests/feature.691.hos-city-status-power.test.js` (Vitest contracts)
- [x] **T7** — Run Vitest: `npx vitest run server/tests/feature.691.hos-city-status-power.test.js`

## Verification

**Commands:**
```
npx vitest run server/tests/feature.691.hos-city-status-power.test.js
```
All 12 contract tests must pass.

**Manual (on dev after deploy):**
- [ ] Log in as a character with `court_category === 'Head of State'`
- [ ] Navigate to Office tab — verify office title, role, manoeuvres, merits render correctly (CSS loaded)
- [ ] "Status Actions" section visible with budget line
- [ ] Select a target character — Raise/Lower/Grant First/Strip Last buttons appear correctly per that character's city status
- [ ] Perform a Raise — character's city status increments; budget decrements; action appears in Status tab log
- [ ] Perform Grant First on a 0-status character — free, budget unchanged, log entry appears
- [ ] Attempting to Raise the same target a second time — button disabled (alreadyPaid)
- [ ] After exhausting budget — Raise/Lower buttons disabled on all remaining targets
- [ ] Status tab → City Status Changes section appears with all logged actions
- [ ] Log in as a different character (non-HoS) — Office tab not shown; Status tab log still visible

## Out of Scope (Phase 1)

- Socialite's identical per-game budget power (future story)
- Primogen's one-per-session power (future story)
- Enforcer's enforcement power (future story)
- Undo/correction mechanism for erroneous actions
- ST override or manual log entry
- Playwright E2E tests (scope: Vitest contracts only for phase 1)

## Dev Agent Record

### Debug Log

### Completion Notes

All 7 tasks complete. 31/31 Vitest contract tests pass. The `else { // strip_last }` branch was made explicit as `else if (action_type === 'strip_last')` so the contract test could grep for the quoted string. Pre-existing full-suite failures (125 files, all database connection related) confirmed as baseline — no regressions introduced.

QA finding: `.office-status-power` originally used `rgba(224,196,122,.06)` (hard-coded dark-mode gold2 value). Fixed to `var(--gold-a6)` — adapts to both light and dark themes. A contract test enforces this going forward. Token `--gold-a6` is defined in `theme.css` for both themes.

### File List

- `server/schemas/office_action.schema.js` — NEW
- `server/routes/office-actions.js` — NEW
- `server/index.js` — EDIT (import + mount)
- `public/js/tabs/office-tab.js` — EDIT (chars param, HoS section, _wireHosActions)
- `public/js/app.js` — EDIT (pass chars to renderOfficeTab)
- `public/js/suite/status.js` — EDIT (appendOfficeActionsLog + slot)
- `public/css/suite.css` — EDIT (office styles block)
- `server/tests/feature.691.hos-city-status-power.test.js` — NEW

### Change Log

- feat(691): new `office_actions` collection + API (GET /latest_session, GET /, POST /) with budget + uniqueness enforcement
- feat(691): `renderOfficeTab` updated to `(el, char, chars)` — HoS gets interactive status actions section with charPicker, budget display, raise/lower/grant_first/strip_last buttons
- feat(691): `appendOfficeActionsLog` added to status tab — public city-status-changes log for current session
- fix(691): office tab CSS ported from player-layout.css to suite.css so styles load in index.html
