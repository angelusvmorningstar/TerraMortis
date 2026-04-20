# Story CR-3: Status & Power Visualisation (Player)

Status: complete

## Story

As a player viewing the Status tab,
I want to see a clear hierarchical view of city, clan, and covenant standing with defined apex slots that loom visually,
so that I can immediately understand where I and others stand in the power structure.

## Acceptance Criteria

1. Status tab displays three views: City Status (scale 1–10), Clan Status (1–5), Covenant Status (1–5)
2. City Status section spans full width above the clan/covenant columns
3. Each view uses the shared slot architecture:
   - **Apex slot** (city rank 10 / clan+cov rank 5): full-width prominent card, large typography, gold border — renders even when vacant
   - **High seats** (city ranks 9–8 / clan+cov rank 4): two cards side by side, imposing but smaller than apex — renders even when vacant (2 placeholders)
   - **Open floor** (city rank ≤7 / clan+cov rank ≤3): compact character rows, scrollable
4. City Status slot caps visible in section header: 1@10 | 2@9 | 2@8 | 3@7 | 3@6 | 4@5 | 4@4 | open
5. Clan/Covenant slot caps: 1@5 | 2@4 | open
6. Composite dot display on City Status only:
   - Solid gold ● for each innate (`status.city`) dot
   - Half/outlined ◐ for each title-derived bonus dot
   - Clan/Covenant use plain ● only (no title bonus applies)
7. Active player's character highlighted in all three views (existing `.status-row-me` behaviour)
8. Vacant apex and high-seat slots render as placeholder cards labelled "Vacant" — not hidden
9. City Status shows all active non-retired characters; Clan/Covenant filter to the active character's clan/covenant (same as current behaviour)

## Tasks / Subtasks

- [ ] Task 1: Extend `/api/characters/status` projection (AC: 6, 9)
  - [ ] In `server/routes/characters.js` ~line 162, add `status.city`, `court_title` to the projection object:
    ```js
    projection: {
      name: 1, honorific: 1, moniker: 1,
      clan: 1, covenant: 1,
      'status.clan': 1, 'status.covenant': 1,
      'status.city': 1,    // ADD
      court_title: 1,      // ADD
    },
    ```

- [ ] Task 2: Add title bonus helper and effective city status (AC: 6)
  - [ ] At the top of `public/js/player/status-tab.js`, add:
    ```js
    // City status bonus granted by court title (Damnation City rules)
    const COURT_TITLE_BONUS = {
      'Premier':       3, // Head of State
      'Seneschal':     3, // Head of State variant
      'Primogen':      2,
      'Harpy':         1, // Socialite
      'Enforcer':      1,
      'Sheriff':       1, // Enforcer variant
      'Hound':         1, // Enforcer sub-role
      'Administrator': 1,
      'Notary':        1, // Administrator variant
      'Regent':        0,
    };

    function titleBonus(c) { return COURT_TITLE_BONUS[c.court_title] || 0; }
    function effectiveCityStatus(c) { return (c.status?.city || 0) + titleBonus(c); }
    ```

- [ ] Task 3: Composite dot helper for city (AC: 6)
  - [ ] Replace the existing `statusDots(n)` function with two variants:
    ```js
    // Plain dots — for clan and covenant views
    function statusDots(n, max = 5) {
      const v = Math.max(0, Math.min(max, n | 0));
      return '\u25CF'.repeat(v) + '\u25CB'.repeat(max - v);
    }

    // Composite dots for city — innate (●) + title bonus (◐) split
    function cityStatusDots(c) {
      const innate  = Math.max(0, Math.min(10, c.status?.city || 0));
      const bonus   = Math.min(10 - innate, titleBonus(c));
      const empty   = 10 - innate - bonus;
      return (
        '<span class="status-dot-innate">' + '\u25CF'.repeat(innate) + '</span>' +
        '<span class="status-dot-bonus">'  + '\u25D0'.repeat(bonus)  + '</span>' +
        '<span class="status-dot-empty">'  + '\u25CB'.repeat(empty)  + '</span>'
      );
    }
    ```

- [ ] Task 4: Build slot architecture render helpers (AC: 3, 4, 5, 8)
  - [ ] Add the following render helpers. Slot cards are reused by all three views.

    ```js
    function renderApexCard(c, activeId, valFn, dotsFn) {
      if (!c) {
        return `<div class="status-apex status-vacant"><span class="status-vacant-label">Vacant</span></div>`;
      }
      const isMe = String(c._id) === activeId;
      return `<div class="status-apex${isMe ? ' status-slot-me' : ''}">
        <img class="status-apex-avatar" src="${esc(avatarUrl(c))}" alt="" loading="lazy">
        <div class="status-apex-name">${esc(displayName(c))}</div>
        ${c.player ? `<div class="status-apex-player">${esc(redactPlayer(c.player))}</div>` : ''}
        ${c.court_title ? `<div class="status-apex-title">${esc(c.court_title)}</div>` : ''}
        <div class="status-apex-dots">${dotsFn(c)}</div>
        <div class="status-apex-val">${valFn(c)}</div>
      </div>`;
    }

    function renderHighSeatCard(c, activeId, valFn, dotsFn) {
      if (!c) {
        return `<div class="status-high status-vacant"><span class="status-vacant-label">Vacant</span></div>`;
      }
      const isMe = String(c._id) === activeId;
      return `<div class="status-high${isMe ? ' status-slot-me' : ''}">
        <img class="status-high-avatar" src="${esc(avatarUrl(c))}" alt="" loading="lazy">
        <div class="status-high-name">${esc(displayName(c))}</div>
        ${c.player ? `<div class="status-high-player">${esc(redactPlayer(c.player))}</div>` : ''}
        ${c.court_title ? `<div class="status-high-title">${esc(c.court_title)}</div>` : ''}
        <div class="status-high-dots">${dotsFn(c)}</div>
        <div class="status-high-val">${valFn(c)}</div>
      </div>`;
    }
    ```

- [ ] Task 5: Rewrite City Status section (AC: 1, 2, 3, 4, 6, 7, 8)
  - [ ] Replace city status rendering in `renderStatusTab`. City section goes full-width above the clan/covenant split.
  - [ ] Sort all active chars by `effectiveCityStatus` descending. Split into tiers:
    - apex = chars with effectiveCityStatus === 10 (take first 1 only)
    - highSeats = chars with effectiveCityStatus >= 8 && < 10 (up to 4: 2 at rank 9, 2 at rank 8)
    - floor = remaining, sorted descending

    ```js
    function renderCitySection(chars, activeId) {
      const sorted = [...chars].sort((a, b) =>
        effectiveCityStatus(b) - effectiveCityStatus(a) ||
        sortName(a).localeCompare(sortName(b))
      );

      const apexChar   = sorted.find(c => effectiveCityStatus(c) === 10) || null;
      const highChars  = sorted.filter(c => { const v = effectiveCityStatus(c); return v >= 8 && v < 10; }).slice(0, 4);
      const floorChars = sorted.filter(c => effectiveCityStatus(c) < 8);

      // Pad high seats to even count for layout (pairs)
      const highSlots = highChars.length % 2 === 0 ? highChars : [...highChars, null];
      // Always show at least 2 high-seat placeholders
      while (highSlots.length < 2) highSlots.push(null);

      const cityDots = c => cityStatusDots(c);
      const cityVal  = c => effectiveCityStatus(c);

      let h = `<div class="status-city-section">`;
      h += `<div class="status-section-head">`;
      h += `<span class="status-section-title">City Status</span>`;
      h += `<span class="status-section-caps">1@10 · 2@9 · 2@8 · 3@7 · 3@6 · 4@5 · 4@4 · open</span>`;
      h += `</div>`;

      // Apex
      h += `<div class="status-apex-row">`;
      h += renderApexCard(apexChar, activeId, cityVal, cityDots);
      h += `</div>`;

      // High seats (pairs)
      h += `<div class="status-high-row">`;
      for (const c of highSlots) {
        h += renderHighSeatCard(c, activeId, cityVal, cityDots);
      }
      h += `</div>`;

      // Open floor
      if (floorChars.length) {
        h += `<div class="status-floor">`;
        floorChars.forEach((c, i) => {
          h += renderRow(c, effectiveCityStatus(c), i + 1, String(c._id) === activeId);
        });
        h += `</div>`;
      }

      h += `</div>`;
      return h;
    }
    ```

- [ ] Task 6: Rewrite Clan and Covenant sections with slot architecture (AC: 1, 3, 5, 7, 8)
  - [ ] Replace `renderColumn` with a slot-aware version for clan/covenant:

    ```js
    function renderStatusSection(heading, headingIcon, rows, activeId, placeholder) {
      // rows = [{c, val}] sorted desc already
      const apexChar  = rows.find(r => r.val === 5)?.c || null;
      const highChars = rows.filter(r => r.val === 4).map(r => r.c);
      const floorRows = rows.filter(r => r.val < 4);

      const dots = c => {
        const r = rows.find(x => String(x.c._id) === String(c._id));
        return statusDots(r?.val || 0, 5);
      };
      const val = c => {
        const r = rows.find(x => String(x.c._id) === String(c._id));
        return r?.val || 0;
      };

      // Pad high seats: always show 2 slots
      const highSlots = [...highChars];
      while (highSlots.length < 2) highSlots.push(null);

      let h = `<div class="status-col">`;
      h += `<div class="status-col-head">${headingIcon} <span>${esc(heading)}</span>`;
      h += `<span class="status-section-caps">1@5 · 2@4 · open</span></div>`;

      if (!rows.length) {
        h += `<p class="placeholder-msg status-empty">${esc(placeholder)}</p>`;
      } else {
        // Apex
        h += `<div class="status-apex-row status-apex-row--col">`;
        h += renderApexCard(apexChar, activeId, val, dots);
        h += `</div>`;

        // High seats
        h += `<div class="status-high-row">`;
        for (const c of highSlots) {
          h += renderHighSeatCard(c, activeId, val, dots);
        }
        h += `</div>`;

        // Floor
        if (floorRows.length) {
          h += `<div class="status-floor">`;
          floorRows.forEach((r, i) => {
            h += renderRow(r.c, r.val, i + 1, String(r.c._id) === activeId);
          });
          h += `</div>`;
        }
      }

      h += `</div>`;
      return h;
    }
    ```

  - [ ] Update the main `renderStatusTab` function to call `renderCitySection` then `renderStatusSection` twice (clan, covenant) inside the `.status-split` div.

- [ ] Task 7: Add CSS for slot architecture (AC: 3, 6, 8)
  - [ ] In `public/css/player-layout.css`, after the existing `.status-*` block (~line 3481), add:

    ```css
    /* CR-3: slot architecture */
    .status-city-section {
      padding: 16px;
      border-bottom: 1px solid var(--bdr);
    }

    .status-section-head {
      display: flex;
      align-items: baseline;
      gap: 12px;
      margin-bottom: 12px;
    }

    .status-section-title {
      font-family: var(--fl);
      font-size: 13px;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: var(--accent);
    }

    .status-section-caps {
      font-size: 11px;
      color: var(--txt3);
      font-style: italic;
    }

    /* Apex slot */
    .status-apex-row {
      margin-bottom: 10px;
    }

    .status-apex {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 16px 20px;
      background: var(--surf2);
      border: 1px solid var(--gold2);
      border-radius: 6px;
      min-height: 72px;
    }

    .status-apex.status-vacant {
      justify-content: center;
      border-style: dashed;
      border-color: var(--bdr);
      opacity: .6;
    }

    .status-apex-avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      flex-shrink: 0;
      background: var(--surf3);
      object-fit: cover;
    }

    .status-apex-name {
      font-family: var(--fl);
      font-size: 15px;
      color: var(--txt);
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .status-apex-title {
      font-size: 11px;
      color: var(--gold2);
      letter-spacing: .04em;
      text-transform: uppercase;
    }

    .status-apex-player {
      font-size: 11px;
      color: var(--txt3);
      font-style: italic;
    }

    .status-apex-dots {
      letter-spacing: 1.5px;
      font-size: 12px;
      flex-shrink: 0;
    }

    .status-apex-val {
      font-family: var(--fl);
      font-size: 18px;
      color: var(--accent);
      width: 28px;
      text-align: right;
      flex-shrink: 0;
    }

    /* High seat slots */
    .status-high-row {
      display: flex;
      gap: 10px;
      margin-bottom: 10px;
    }

    .status-high {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      background: var(--surf);
      border: 1px solid var(--bdr);
      border-radius: 6px;
      min-height: 52px;
    }

    .status-high.status-vacant {
      justify-content: center;
      border-style: dashed;
      opacity: .5;
    }

    .status-high-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      flex-shrink: 0;
      background: var(--surf3);
      object-fit: cover;
    }

    .status-high-name {
      font-family: var(--fl);
      font-size: 13px;
      color: var(--txt);
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .status-high-title {
      font-size: 10px;
      color: var(--gold2);
      letter-spacing: .04em;
      text-transform: uppercase;
    }

    .status-high-player { font-size: 10px; color: var(--txt3); font-style: italic; }

    .status-high-dots { letter-spacing: 1.5px; font-size: 11px; flex-shrink: 0; }

    .status-high-val {
      font-family: var(--fl);
      font-size: 15px;
      color: var(--accent);
      width: 24px;
      text-align: right;
      flex-shrink: 0;
    }

    /* Open floor */
    .status-floor {
      background: var(--surf);
      border: 1px solid var(--bdr);
      border-radius: 6px;
      overflow: hidden;
    }

    /* Slot me — highlight */
    .status-slot-me {
      background: rgba(224, 196, 122, .10);
      box-shadow: inset 3px 0 0 var(--accent);
    }
    .status-slot-me .status-apex-name,
    .status-slot-me .status-high-name { color: var(--accent); }

    /* Vacant label */
    .status-vacant-label {
      font-size: 12px;
      color: var(--txt3);
      font-style: italic;
      letter-spacing: .04em;
    }

    /* Composite city dots */
    .status-dot-innate { color: var(--accent); }
    .status-dot-bonus  { color: var(--gold2); opacity: .65; }
    .status-dot-empty  { color: var(--txt3); }

    /* Clan/covenant apex-row inside a column is constrained */
    .status-apex-row--col .status-apex-avatar { width: 36px; height: 36px; }
    .status-apex-row--col .status-apex-name   { font-size: 13px; }
    .status-apex-row--col .status-apex-val    { font-size: 15px; }

    @media (max-width: 720px) {
      .status-high-row { flex-direction: column; }
    }
    ```

## Dev Notes

### Court Title Bonus Mapping

From Damnation City rules (canonical):

| Court Position     | Common Title       | City Status Bonus |
|--------------------|--------------------|:-----------------:|
| Head of State      | Premier / Seneschal | +3               |
| Primogen           | Primogen           | +2                |
| Socialite          | Harpy              | +1                |
| Enforcer           | Enforcer / Sheriff | +1                |
| Administrator      | Administrator      | +1                |
| Regent             | Regent             | +0                |

**Effective city status** = `status.city` (innate, stored in DB) + `COURT_TITLE_BONUS[court_title]`.

The composite dot display (●innate ◐bonus) lets players see how much of their rank is from title vs. earned standing.

### API — court_category dependency

`court_category` is NULL for all characters in the live DB — `server/migrate-court-titles.js` has been written but not yet run. The title bonus lookup uses `court_title` directly (string map), so **no dependency on `court_category`** for CR-3.

### Current data range

With the COURT_TITLE_BONUS applied, the effective city status spread currently is:

| Character | Innate | Bonus | Effective |
|-----------|-------:|------:|----------:|
| Eve Lockridge (Premier) | 3 | +3 | 6 |
| Brandy LaRoux (Harpy) | 4 | +1 | 5 |
| Edna Judge (Primogen) | 2 | +2 | 4 |
| René St. Dominique (Primogen) | 1 | +2 | 3 |
| Margaret Kane (Enforcer) | 2 | +1 | 3 |
| Most others | 1–2 | +0 | 1–2 |

Apex (city 10) and high seats (9–8) will all be vacant — this is intentional and creates the desired "aspirational looming" effect.

### Existing renderRow compatibility

The existing `renderRow(c, val, rank, isMe)` function is kept for the open floor. `val` passed in for city rows should be `effectiveCityStatus(c)`.

### No rank numbers in apex/high cards

The large apex and high-seat cards do not display a numeric rank position — the value itself (the large number bottom-right) is sufficient. Rank numbers are kept in the compact floor rows for quick scanning.

### CSS tokens in use

- `--gold2`: `#E0C47A` — apex border, title badges, dot bonus colour
- `--fl`: Cinzel heading font
- `--surf` / `--surf2`: surface tiers
- `--bdr`: border
- `--accent`: primary gold accent (same as gold2 effectively)
- `--txt3`: dimmed text (vacant label, player names)

### Responsive

Below 720px the high-seat pair stacks vertically. The existing `@media (max-width: 720px) { .status-split { flex-direction: column; } }` rule handles the outer split; only the inner `.status-high-row` needs a new responsive rule.

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes List

- API /status projection extended to include `status.city` and `court_title`
- COURT_TITLE_BONUS map added (Premier/Seneschal +3, Primogen +2, Harpy/Enforcer/Admin +1, Regent +0); effectiveCityStatus() = stored city + titleBonus()
- cityStatusDots(): ● innate (U+25CF), ◐ title-derived (U+25D0), ○ empty (U+25CB) — city view only
- renderApexCard() and renderHighSeatCard() handle null (vacant) gracefully with dashed placeholder
- renderCitySection(): full-width, always shows apex + 2 high-seat slots even when all vacant; open floor for effective city < 8
- renderStatusSection(): clan/covenant columns, apex at rank 5, high seats at rank 4 (padded to 2 slots minimum)
- All new CSS under /* CR-3: slot architecture */ comment block; responsive: high-row stacks at 720px
- court_category is null in DB (migrate-court-titles.js not yet run) — bonus lookup via court_title string works without it

### File List

- `server/routes/characters.js`
- `public/js/player/status-tab.js`
- `public/css/player-layout.css`
- `specs/stories/cr.3.status-power-visualisation.story.md`
