/**
 * E2E coverage for prax.2 - the admin Praxis Claim board.
 *
 * Boot pattern follows tests/cycle-tab.spec.js: a catch-all `[]` API mock
 * registered FIRST so no unmocked boot call escapes, then the specific routes
 * on top (Playwright resolves routes LIFO, so later registrations win).
 *
 * The praxis_sessions mock is a small stateful fake rather than a set of fixed
 * fixtures. Every write action in this board re-reads the board from the server
 * and re-renders from that read, so a stub that always answered the same
 * document would pass the click and prove nothing about the refetch.
 *
 * Character ids are real 24-hex lower-case ids on purpose: both the server's own
 * `attendeePool()` and this board's mirror of it filter the attendance array by
 * exactly that shape, so a friendly id like 'char-1' would silently empty the
 * pool and the whole board would test as broken.
 */

const { test, expect } = require('@playwright/test');

// ── Ids ──────────────────────────────────────────────────────────────────────

/** A valid 24-character lower-case hex id, padded from a small number. */
const cid = n => String(n).padStart(24, 'a');

const CHAPTER_ID = cid(90);
const SESSION_ID = cid(91);
const BOARD_ID = cid(99);

const BRANDY = cid(1);
const MIKAEL = cid(2);
const CORVIN = cid(3);
const WREN = cid(4);
const DESMOND = cid(5);
const PETRA = cid(6);

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001',
  character_ids: [], is_dual_role: false,
};

function buildChar(_id, name, cityStatus, courtCategory) {
  return {
    _id, name, moniker: null, honorific: null,
    clan: 'Mekhet', covenant: 'Invictus', player: 'Someone',
    blood_potency: 1, humanity: 7, humanity_base: 7,
    court_title: null, court_category: courtCategory || null, retired: false,
    status: { city: cityStatus, clan: 0, covenant: {} },
    attributes: {}, skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
  };
}

// City Status = status.city + TITLE_STATUS_BONUS[court_category] (no territories
// are mocked, so no regent-ambience component). Brandy 4+1=5, Mikael 3+2=5,
// Corvin 2, Wren 1, Desmond 3, Petra 2.
const CHARS = [
  buildChar(BRANDY, 'Brandy LaRoux', 4, 'Socialite'),
  buildChar(MIKAEL, 'Mikael Thorne', 3, 'Primogen'),
  buildChar(CORVIN, 'Corvin Adeyemi', 2, null),
  buildChar(WREN, 'Wren Halloway', 1, null),
  buildChar(DESMOND, 'Desmond Okafor', 3, null),
  buildChar(PETRA, 'Petra Voss', 2, null),
];

const CHAPTERS = [
  { _id: cid(80), label: 'Chapter 13', game_number: 13, phase: null, phase_signoff: { projects: true } },
  { _id: CHAPTER_ID, label: 'Chapter 14', game_number: 14, phase: 'game' },
];

const SESSIONS = [{
  _id: SESSION_ID,
  chapter_id: CHAPTER_ID,
  session_date: '2026-08-12',
  attendance: [
    { character_id: BRANDY, attended: true },
    { character_id: MIKAEL, attended: true },
    { character_id: CORVIN, attended: true },
    { character_id: WREN, attended: true },
    { character_id: DESMOND, attended: true },
    { character_id: PETRA, attended: true },
    // Not an attendee - must never appear in the pool.
    { character_id: cid(7), attended: false },
  ],
}];

// Brandy holds the "People's Harpy" seat; the other Socialite seat ('Harpy') is
// held by nobody here, which is what makes the seat_label check load-bearing.
const SEATS = [
  { _id: cid(70), office_category: 'Socialite', seat_label: 'Harpy', holder_id: null, created_at: '2026-01-01' },
  { _id: cid(71), office_category: 'Socialite', seat_label: "People's Harpy", holder_id: BRANDY, created_at: '2026-01-02' },
  { _id: cid(72), office_category: 'Primogen', seat_label: null, holder_id: MIKAEL, created_at: '2026-01-03' },
];

/** The resolve timestamp the fake stamps on every snapshot (prax.4a). */
const RESOLVED_AT = '2026-08-12T03:00:00.000Z';

function emptyBoard() {
  return {
    _id: BOARD_ID,
    chapter_id: CHAPTER_ID,
    praxis: { claims: [], support: {} },
    harpy: { claims: [], support: {} },
    resolved: { praxis: null, harpy: null },
  };
}

function boardWith(claimIds, supportMap) {
  const b = emptyBoard();
  b.praxis.claims = claimIds.map(id => ({ character_id: id, opened_at: '2026-08-12T00:00:00.000Z' }));
  b.praxis.support = { ...(supportMap || {}) };
  return b;
}

/**
 * prax.3: a board with BOTH tallies populated independently. The two sides are
 * deliberately never mirrored in these fixtures - the whole point of the story
 * is that a character can stand in one, both, or neither.
 */
function boardWithTallies(praxis, harpy) {
  const b = emptyBoard();
  const asClaims = ids => (ids || []).map(id => ({ character_id: id, opened_at: '2026-08-12T00:00:00.000Z' }));
  b.praxis.claims = asClaims(praxis?.claims);
  b.praxis.support = { ...(praxis?.support || {}) };
  b.harpy.claims = asClaims(harpy?.claims);
  b.harpy.support = { ...(harpy?.support || {}) };
  return b;
}

// ── Stateful praxis_sessions fake ────────────────────────────────────────────

async function mockPraxis(page, state) {
  await page.route(/\/api\/praxis_sessions/, async (route) => {
    const req = route.request();
    const method = req.method();
    const url = req.url();
    let body = null;
    try { body = req.postData() ? JSON.parse(req.postData()) : null; } catch { body = null; }
    state.calls.push({ method, url, body });

    const json = (status, payload) => route.fulfill({
      status, contentType: 'application/json', body: JSON.stringify(payload === undefined ? null : payload),
    });

    // GET /api/praxis_sessions?chapter_id=…  → the board, or null.
    // `hiddenUntilPost` models the 409 race: this ST's tab read the chapter
    // BEFORE another ST opened the board, so its first GET honestly answers
    // null and only the POST discovers the conflict.
    if (method === 'GET') return json(200, state.hiddenUntilPost ? null : state.board);

    // POST /api/praxis_sessions  → open a board (409 when one already exists)
    if (method === 'POST' && /\/praxis_sessions(\?|$)/.test(url)) {
      if (state.board) {
        state.hiddenUntilPost = false;
        return json(409, {
          error: 'CONFLICT',
          message: 'A praxis session already exists for that chapter',
          existing_id: String(state.board._id),
        });
      }
      state.board = emptyBoard();
      return json(201, state.board);
    }

    // POST /api/praxis_sessions/:id/claims
    if (method === 'POST' && /\/claims$/.test(url)) {
      const t = body.tally;
      state.board[t].claims.push({ character_id: body.character_id, opened_at: '2026-08-12T01:00:00.000Z' });
      return json(201, { ok: true, tally: t, claim: { character_id: body.character_id } });
    }

    // PUT /api/praxis_sessions/:id/support
    if (method === 'PUT' && /\/support$/.test(url)) {
      const t = body.tally;
      if (body.claimant_character_id === null) delete state.board[t].support[body.supporter_character_id];
      else state.board[t].support[body.supporter_character_id] = body.claimant_character_id;
      return json(200, { ok: true, tally: t });
    }

    // POST /api/praxis_sessions/:id/resolve-harpy   (prax.4a)
    //
    // Models the two things the real route guarantees and the client depends
    // on: the snapshot is written ONCE (a second call is a 409, whichever kind
    // it is), and the seat handover happens in the SAME call, so the seat array
    // the client re-reads afterwards names the winner. The claim/support
    // history is deliberately left completely alone, exactly as the route
    // leaves it.
    if (method === 'POST' && /\/resolve-harpy$/.test(url)) {
      if (state.board.resolved.harpy) {
        return json(409, {
          error: 'CONFLICT',
          message: "The People's Harpy vote on this board has already been resolved",
        });
      }
      const winner = body.claimant_character_id;
      const resolved = winner === null
        ? { dismissed: true, resolved_at: RESOLVED_AT }
        : {
          winner_character_id: winner,
          final_tally: Object.values(state.board.harpy.support).filter(v => v === winner).length,
          resolved_at: RESOLVED_AT,
        };
      state.board.resolved.harpy = resolved;
      if (winner !== null) {
        const seat = state.seats.find(s => s.office_category === 'Socialite' && s.seat_label === "People's Harpy");
        if (seat) seat.holder_id = winner;
      }
      return json(200, { ok: true, dismissed: winner === null, resolved });
    }

    // DELETE /api/praxis_sessions/:id/claims/:characterId?tally=praxis
    if (method === 'DELETE') {
      const m = url.match(/\/claims\/([a-f0-9]{24})/);
      const target = m ? m[1] : null;
      const t = new URL(url).searchParams.get('tally');
      const before = state.board[t].support;
      const released = Object.values(before).filter(v => v === target).length;
      state.board[t].claims = state.board[t].claims.filter(c => c.character_id !== target);
      state.board[t].support = Object.fromEntries(
        Object.entries(before).filter(([, v]) => v !== target),
      );
      return json(200, { ok: true, tally: t, character_id: target, supporters_released: released });
    }

    return json(200, null);
  });
}

// ── Boot ─────────────────────────────────────────────────────────────────────

async function loginAsST(page, { chapters = CHAPTERS, sessions = SESSIONS, seats = SEATS } = {}) {
  await page.route('**/api/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/api/auth/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER) }));
  await page.route(/\/api\/characters$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CHARS) }));
  await page.route('**/api/characters/names', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route(/\/api\/chapters$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(chapters) }));
  await page.route(/\/api\/game_sessions$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessions) }));
  await page.route(/\/api\/office_seats$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(seats) }));
  await page.route(/\/api\/territories$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  await page.addInitScript((user) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, ST_USER);
}

async function openPraxis(page) {
  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app:not([style*="display: none"])');
  // admin.js's boot() shows the shell and fires init() WITHOUT awaiting it, so
  // the sidebar is clickable before `chars = await apiGet('/api/characters')`
  // resolves. initPraxisView(chars) is handed that same module-level array
  // (matching initCycleView's own convention), so clicking Praxis before it
  // populates silently hands the board an empty roster - every name renders as
  // its raw id instead of a display name. Wait for the default Player domain's
  // own char-card render, which only happens once chars is populated, so this
  // spec's own click always lands after the real race admin.js has everywhere.
  await page.waitForSelector('#d-player .char-card');
  await page.click('.sidebar-btn[data-domain="praxis"]');
  await expect(page.locator('#d-praxis')).toHaveClass(/active/);
  await page.waitForSelector('#praxis-content .praxis-board');
  await expect(page.locator('#praxis-content .placeholder')).toHaveCount(0);
}

const board = page => page.locator('#praxis-content .praxis-board');
const poolChips = page => board(page).locator('.pool-strip .char-chip');
const cards = page => board(page).locator('.claim-card');
const cardFor = (page, id) => board(page).locator(`.claim-card[data-claimant-id="${id}"]`);
const sheet = page => board(page).locator('.sheet-overlay.open');

// ── prax.3 locators ──────────────────────────────────────────────────────────

const tallyBtn = (page, tally) => board(page).locator(`.tally-switch-btn[data-tally="${tally}"]`);
const summaryFor = (page, tally) => board(page).locator(`.tally-summary-item[data-tally="${tally}"]`);
const chipNamed = (page, name) => board(page).locator('.pool-strip .char-chip', { hasText: name });

/** Switch the board to a tally and wait for the re-render to land. */
async function switchTo(page, tally, title) {
  await tallyBtn(page, tally).click();
  await expect(board(page).locator('.pb-title')).toHaveText(title);
}

/**
 * Assert one pool chip's dual dots. The first dot is Praxis (crimson when set),
 * the second Harpy (gold); an unset dot carries no modifier class at all, which
 * is what the `^chip-dot$` anchors check.
 */
async function expectChipDots(page, name, praxis, harpy) {
  const dots = chipNamed(page, name).locator('.chip-dot');
  await expect(dots).toHaveCount(2);
  await expect(dots.nth(0)).toHaveClass(praxis ? /\bon-praxis\b/ : /^chip-dot$/);
  await expect(dots.nth(1)).toHaveClass(harpy ? /\bon-harpy\b/ : /^chip-dot$/);
}

async function setup(page, initialBoard, opts = {}) {
  const state = {
    board: initialBoard,
    calls: [],
    hiddenUntilPost: !!opts.hiddenUntilPost,
    // prax.4a: the seat array becomes mutable per-test state. A Harpy resolve
    // hands the People's Harpy seat over and the client re-reads
    // /api/office_seats afterwards, so a fixed fixture would keep naming the
    // OUTGOING holder for the rest of the test. Deep-copied so one test's
    // handover cannot leak into the next.
    seats: JSON.parse(JSON.stringify(opts.seats || SEATS)),
  };
  await loginAsST(page, opts);
  // Registered AFTER loginAsST so it wins (Playwright resolves routes LIFO):
  // same payload as before for every pre-prax.4a test, now served from state.
  await page.route(/\/api\/office_seats$/, route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(state.seats),
  }));
  await mockPraxis(page, state);
  return state;
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('prax.2 - admin shell wiring (AC1, AC2)', () => {
  test('the Praxis sidebar button opens the Praxis domain', async ({ page }) => {
    await setup(page, null);
    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app:not([style*="display: none"])');

    await expect(page.locator('.sidebar-btn[data-domain="praxis"]')).toHaveText('Praxis');
    await expect(page.locator('#d-praxis')).toHaveCount(1);
    await expect(page.locator('#d-praxis .domain-header h2')).toHaveText('Praxis');
    await expect(page.locator('#praxis-content')).toHaveCount(1);

    await page.click('.sidebar-btn[data-domain="praxis"]');
    await expect(page.locator('#d-praxis')).toHaveClass(/active/);
    await expect(page.locator('.sidebar-btn[data-domain="praxis"]')).toHaveClass(/on/);
  });
});

test.describe('prax.2 - empty state and opening the board (AC5, AC6, AC7)', () => {
  test('an unopened chapter renders the empty state, and the button opens the board', async ({ page }) => {
    const state = await setup(page, null);
    await openPraxis(page);

    await expect(board(page)).toContainText('No Praxis board is open for this chapter yet.');
    // Chapter 14 is the declared-phase chapter; Chapter 13 (signed-off projects,
    // no phase) must not win the selection.
    await expect(board(page).locator('.pb-chapter')).toContainText('Chapter 14');
    await expect(board(page).locator('.pb-chapter')).toContainText('2026-08-12 session');
    await expect(board(page).locator('.pb-live')).toHaveCount(0);

    await board(page).locator('.btn-open').click();

    await expect(board(page).locator('.pool-strip')).toBeVisible();
    await expect(board(page).locator('.pb-live')).toHaveCount(1);
    await expect(poolChips(page)).toHaveCount(6);
    // The non-attendee never appears.
    await expect(board(page).locator('.pool-strip')).not.toContainText('aaaaa');

    const post = state.calls.find(c => c.method === 'POST');
    expect(post.body).toEqual({ chapter_id: CHAPTER_ID });
  });

  test('a 409 open race falls through to the board with no error state', async ({ page }) => {
    // Another ST opened the board a moment ago; this tab read the chapter before
    // that happened, so it still shows the empty state and its POST loses.
    const state = await setup(page, boardWith([MIKAEL], { [PETRA]: MIKAEL }), { hiddenUntilPost: true });
    await openPraxis(page);
    await expect(board(page)).toContainText('No Praxis board is open for this chapter yet.');

    await board(page).locator('.btn-open').click();

    // The winner's board renders, and no failure line is shown: a 409 is an
    // ordinary Praxis-night race, not an error the ST can act on.
    await expect(cardFor(page, MIKAEL)).toBeVisible();
    await expect(board(page).locator('.pb-status')).toHaveCount(0);
    expect(state.calls.filter(c => c.method === 'GET').length).toBeGreaterThan(1);
  });

  test('a chapter-less install renders a placeholder rather than a dead button', async ({ page }) => {
    await setup(page, null, { chapters: [] });
    await openPraxis(page);
    await expect(board(page)).toContainText('No chapter to open a Praxis board against.');
    await expect(board(page).locator('.btn-open')).toHaveCount(0);
  });
});

test.describe('prax.2 - populated board (AC8, AC9, AC10)', () => {
  test('claimant cards show live tallies, office badges and supporter chips', async ({ page }) => {
    await setup(page, boardWith([BRANDY, MIKAEL, CORVIN], { [PETRA]: BRANDY }));
    await openPraxis(page);

    await expect(cards(page)).toHaveCount(3);

    // Brandy 5 (4 city + 1 Socialite) + Petra 2 = 7.
    await expect(cardFor(page, BRANDY).locator('.claim-name')).toHaveText('Brandy LaRoux');
    await expect(cardFor(page, BRANDY).locator('.claim-tally')).toContainText('7');
    await expect(cardFor(page, BRANDY).locator('.claim-badge.amber'))
      .toHaveText("People’s Harpy · vacates on win");
    await expect(cardFor(page, BRANDY).locator('.support-chip')).toHaveCount(1);
    await expect(cardFor(page, BRANDY).locator('.support-chip')).toContainText('Petra Voss');

    // Mikael 3 city + 2 Primogen = 5, no supporters.
    await expect(cardFor(page, MIKAEL).locator('.claim-tally')).toContainText('5');
    await expect(cardFor(page, MIKAEL).locator('.claim-badge.neutral'))
      .toHaveText('Primogen · keeps seat');
    await expect(cardFor(page, MIKAEL).locator('.claim-empty-supporters')).toHaveText('No supporters yet.');

    // Corvin holds no office at all - no badge line.
    await expect(cardFor(page, CORVIN).locator('.claim-tally')).toContainText('2');
    await expect(cardFor(page, CORVIN).locator('.claim-badge')).toHaveCount(0);

    // Pool = attendees minus assigned supporters minus standing claimants.
    await expect(poolChips(page)).toHaveCount(2);
    await expect(board(page).locator('.pool-strip')).toContainText('Wren Halloway');
    await expect(board(page).locator('.pool-strip')).toContainText('Desmond Okafor');
    await expect(board(page).locator('.pool-strip')).not.toContainText('Petra Voss');
    await expect(board(page).locator('.pool-strip')).not.toContainText('Brandy LaRoux');
  });
});

test.describe('prax.2 - the bottom sheet (AC11, AC12, AC13)', () => {
  test('tapping a pool chip opens the sheet for that attendee', async ({ page }) => {
    await setup(page, boardWith([BRANDY, MIKAEL], {}));
    await openPraxis(page);

    await expect(sheet(page)).toHaveCount(0);
    await board(page).locator('.char-chip', { hasText: 'Wren Halloway' }).click();

    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page).locator('.sheet-sub')).toHaveText('Wren Halloway');
    await expect(sheet(page).locator('.sheet-action'))
      .toHaveText('Open a Praxis claim for Wren Halloway instead');
    // The claimant list, with each claimant's own live tally.
    await expect(sheet(page).locator('.sheet-row')).toHaveCount(2);
    await expect(sheet(page).locator('.sheet-row').first()).toContainText('Brandy LaRoux');
    await expect(sheet(page).locator('.sheet-row').first()).toContainText('5 status');

    await sheet(page).locator('.sheet-close').click();
    await expect(sheet(page)).toHaveCount(0);
  });

  test('"open a claim instead" posts a praxis claim and re-renders from the server', async ({ page }) => {
    const state = await setup(page, boardWith([BRANDY], {}));
    await openPraxis(page);

    await board(page).locator('.char-chip', { hasText: 'Desmond Okafor' }).click();
    await sheet(page).locator('.sheet-action').click();

    await expect(cards(page)).toHaveCount(2);
    await expect(cardFor(page, DESMOND).locator('.claim-tally')).toContainText('3');
    await expect(sheet(page)).toHaveCount(0);
    // Desmond is a claimant now, so he leaves the pool.
    await expect(board(page).locator('.pool-strip')).not.toContainText('Desmond Okafor');

    const claim = state.calls.find(c => c.method === 'POST' && /\/claims$/.test(c.url));
    expect(claim.body).toEqual({ tally: 'praxis', character_id: DESMOND });
  });

  test('tapping a claimant assigns support, moves the chip and updates the tally', async ({ page }) => {
    const state = await setup(page, boardWith([BRANDY, MIKAEL], {}));
    await openPraxis(page);

    await expect(cardFor(page, BRANDY).locator('.claim-tally')).toContainText('5');

    await board(page).locator('.char-chip', { hasText: 'Wren Halloway' }).click();
    await sheet(page).locator('.sheet-row', { hasText: 'Brandy LaRoux' }).click();

    await expect(sheet(page)).toHaveCount(0);
    // 5 + Wren's 1 = 6.
    await expect(cardFor(page, BRANDY).locator('.claim-tally')).toContainText('6');
    await expect(cardFor(page, BRANDY).locator('.support-chip')).toContainText('Wren Halloway');
    await expect(board(page).locator('.pool-strip')).not.toContainText('Wren Halloway');

    const put = state.calls.find(c => c.method === 'PUT');
    expect(put.body).toEqual({
      tally: 'praxis',
      supporter_character_id: WREN,
      claimant_character_id: BRANDY,
    });
  });
});

test.describe('prax.2 - unassign and withdraw (AC14, AC15)', () => {
  test('the supporter chip cross returns them to the pool with an explicit null', async ({ page }) => {
    const state = await setup(page, boardWith([BRANDY], { [PETRA]: BRANDY }));
    await openPraxis(page);

    await expect(cardFor(page, BRANDY).locator('.claim-tally')).toContainText('7');
    await cardFor(page, BRANDY).locator('.withdraw-x').click();

    await expect(cardFor(page, BRANDY).locator('.claim-tally')).toContainText('5');
    await expect(cardFor(page, BRANDY).locator('.claim-empty-supporters')).toBeVisible();
    await expect(board(page).locator('.pool-strip')).toContainText('Petra Voss');

    const put = state.calls.find(c => c.method === 'PUT');
    // The key must be PRESENT and null - prax.1 treats an absent key as a 400.
    expect(Object.keys(put.body).sort()).toEqual(['claimant_character_id', 'supporter_character_id', 'tally']);
    expect(put.body.claimant_character_id).toBeNull();
    expect(put.body.supporter_character_id).toBe(PETRA);
  });

  test('withdrawing a claim reports the released supporter count', async ({ page }) => {
    const state = await setup(page, boardWith([BRANDY, MIKAEL], { [PETRA]: BRANDY, [WREN]: BRANDY, [DESMOND]: MIKAEL }));
    await openPraxis(page);

    await expect(cards(page)).toHaveCount(2);
    await cardFor(page, BRANDY).locator('.claim-withdraw').click();

    await expect(cards(page)).toHaveCount(1);
    await expect(board(page).locator('.pb-status'))
      .toHaveText('Claim withdrawn. 2 supporters returned to the pool.');
    // Brandy's two supporters came back; Mikael's did not move.
    await expect(board(page).locator('.pool-strip')).toContainText('Petra Voss');
    await expect(board(page).locator('.pool-strip')).toContainText('Wren Halloway');
    await expect(board(page).locator('.pool-strip')).toContainText('Brandy LaRoux');
    await expect(cardFor(page, MIKAEL).locator('.support-chip')).toContainText('Desmond Okafor');

    const del = state.calls.find(c => c.method === 'DELETE');
    expect(del.url).toContain(`/claims/${BRANDY}`);
    expect(del.url).toContain('tally=praxis');
  });

  test('withdrawing a claim with no supporters says so in the singular-safe form', async ({ page }) => {
    await setup(page, boardWith([CORVIN], {}));
    await openPraxis(page);
    await cardFor(page, CORVIN).locator('.claim-withdraw').click();
    await expect(board(page).locator('.pb-status'))
      .toHaveText('Claim withdrawn. 0 supporters returned to the pool.');
  });
});

test.describe('prax.2 - WS-driven refetch (AC16)', () => {
  test('a praxis_session frame for this board refetches and re-renders', async ({ page }) => {
    const state = await setup(page, boardWith([BRANDY], {}));
    await openPraxis(page);
    await expect(cards(page)).toHaveCount(1);

    // Another ST opens a claim for Mikael - mutate the fake's state directly,
    // then deliver the frame the way admin.js's onPraxisUpdate wiring does.
    state.board.praxis.claims.push({ character_id: MIKAEL, opened_at: '2026-08-12T02:00:00.000Z' });
    await page.evaluate(async (id) => {
      const mod = await import('/js/admin/praxis-tab.js');
      await mod.onPraxisUpdate(id);
    }, BOARD_ID);

    await expect(cards(page)).toHaveCount(2);
    await expect(cardFor(page, MIKAEL)).toBeVisible();
  });

  test('a frame for a different board is ignored', async ({ page }) => {
    const state = await setup(page, boardWith([BRANDY], {}));
    await openPraxis(page);
    const before = state.calls.length;

    state.board.praxis.claims.push({ character_id: MIKAEL, opened_at: '2026-08-12T02:00:00.000Z' });
    await page.evaluate(async (id) => {
      const mod = await import('/js/admin/praxis-tab.js');
      await mod.onPraxisUpdate(id);
    }, cid(11));

    await expect(cards(page)).toHaveCount(1);
    expect(state.calls.length).toBe(before);
  });
});

// ═══ prax.3 - the second tally ═══════════════════════════════════════════════
//
// Extends this spec rather than forking a prax-3 file: every test below boots
// the SAME component through the SAME mocks the blocks above already set up,
// and a parallel spec would have to duplicate all of it.

test.describe('prax.3 - segmented control (AC5, AC6, AC11)', () => {
  test('the empty state offers a tally-agnostic Open Board and no switch', async ({ page }) => {
    await setup(page, null);
    await openPraxis(page);

    // One document holds both tallies, so before it exists there is nothing to
    // switch between and the action cannot honestly name only Praxis.
    await expect(board(page).locator('.tally-switch')).toHaveCount(0);
    await expect(board(page).locator('.tally-summary')).toHaveCount(0);
    await expect(board(page).locator('.btn-open')).toHaveText('Open Board');

    await board(page).locator('.btn-open').click();

    await expect(board(page).locator('.tally-switch')).toHaveCount(1);
    await expect(board(page).locator('.tally-summary')).toHaveCount(1);
  });

  test('switching tally re-renders in place with no refetch', async ({ page }) => {
    const state = await setup(page, boardWithTallies(
      { claims: [BRANDY], support: { [PETRA]: BRANDY } },
      { claims: [MIKAEL], support: { [WREN]: MIKAEL, [DESMOND]: MIKAEL } },
    ));
    await openPraxis(page);

    await expect(board(page).locator('.pb-title')).toHaveText('Praxis Claim');
    await expect(tallyBtn(page, 'praxis')).toHaveClass(/\bactive\b/);
    await expect(tallyBtn(page, 'harpy')).toHaveText('People’s Harpy');
    await expect(cardFor(page, BRANDY)).toBeVisible();

    const before = state.calls.length;
    await switchTo(page, 'harpy', 'People’s Harpy Vote');

    // The already-loaded document carries both tallies, so nothing is fetched.
    expect(state.calls.length).toBe(before);
    await expect(tallyBtn(page, 'harpy')).toHaveClass(/\bactive\b/);
    await expect(tallyBtn(page, 'praxis')).not.toHaveClass(/\bactive\b/);
    // The Harpy tally's OWN claim list, not the Praxis one.
    await expect(cards(page)).toHaveCount(1);
    await expect(cardFor(page, MIKAEL)).toBeVisible();
    await expect(cardFor(page, BRANDY)).toHaveCount(0);

    await switchTo(page, 'praxis', 'Praxis Claim');
    await expect(cardFor(page, BRANDY)).toBeVisible();
    expect(state.calls.length).toBe(before);
  });

  test('tapping the already-active segment is a no-op', async ({ page }) => {
    const state = await setup(page, boardWithTallies({ claims: [BRANDY] }, { claims: [MIKAEL] }));
    await openPraxis(page);
    const before = state.calls.length;

    await tallyBtn(page, 'praxis').click();

    // No clear-to-neutral toggle here, unlike the Cycle tab's phase buttons.
    await expect(tallyBtn(page, 'praxis')).toHaveClass(/\bactive\b/);
    await expect(board(page).locator('.pb-title')).toHaveText('Praxis Claim');
    await expect(cardFor(page, BRANDY)).toBeVisible();
    expect(state.calls.length).toBe(before);
  });

  test('a fresh domain entry always lands back on Praxis', async ({ page }) => {
    await setup(page, boardWithTallies({ claims: [BRANDY] }, { claims: [MIKAEL] }));
    await openPraxis(page);
    await switchTo(page, 'harpy', 'People’s Harpy Vote');

    await page.click('.sidebar-btn[data-domain="player"]');
    await page.click('.sidebar-btn[data-domain="praxis"]');

    await expect(board(page).locator('.pb-title')).toHaveText('Praxis Claim');
    await expect(tallyBtn(page, 'praxis')).toHaveClass(/\bactive\b/);
  });
});

test.describe('prax.3 - the Harpy tally is an unweighted headcount (AC3, AC4)', () => {
  test('a Harpy card counts supporters, never City Status', async ({ page }) => {
    await setup(page, boardWithTallies(
      { claims: [BRANDY], support: { [PETRA]: BRANDY } },
      // Mikael has three supporters. Their City Status sums to 5+2+1+3 = 11,
      // which is exactly the number a shared Praxis formula would print here.
      { claims: [MIKAEL, CORVIN, BRANDY], support: { [PETRA]: MIKAEL, [WREN]: MIKAEL, [DESMOND]: MIKAEL } },
    ));
    await openPraxis(page);
    await switchTo(page, 'harpy', 'People’s Harpy Vote');

    await expect(cardFor(page, MIKAEL).locator('.claim-tally')).toHaveText('3votes');
    await expect(cardFor(page, MIKAEL).locator('.claim-tally .lbl')).toHaveText('votes');
    await expect(cardFor(page, MIKAEL).locator('.support-chip')).toHaveCount(3);

    // No self-vote is auto-added: a claimant with nobody assigned to them sits
    // at zero, not at their own City Status.
    await expect(cardFor(page, CORVIN).locator('.claim-tally')).toHaveText('0votes');
    await expect(cardFor(page, BRANDY).locator('.claim-tally')).toHaveText('0votes');

    // Praxis is untouched by any of this - same board, other weighting.
    await switchTo(page, 'praxis', 'Praxis Claim');
    await expect(cardFor(page, BRANDY).locator('.claim-tally')).toHaveText('7status');
  });

  test('the Primogen / People’s Harpy badges are Praxis-only', async ({ page }) => {
    await setup(page, boardWithTallies(
      { claims: [BRANDY, MIKAEL] },
      { claims: [BRANDY, MIKAEL] },
    ));
    await openPraxis(page);

    await expect(cardFor(page, BRANDY).locator('.claim-badge.amber')).toHaveCount(1);
    await expect(cardFor(page, MIKAEL).locator('.claim-badge.neutral')).toHaveCount(1);

    await switchTo(page, 'harpy', 'People’s Harpy Vote');

    // Both badges describe a PRAXIS outcome, so neither belongs on this tab.
    await expect(board(page).locator('.claim-badge')).toHaveCount(0);
  });

  test('Harpy claims and support writes carry tally: harpy', async ({ page }) => {
    const state = await setup(page, boardWithTallies({ claims: [BRANDY] }, {}));
    await openPraxis(page);
    await switchTo(page, 'harpy', 'People’s Harpy Vote');

    // Nobody is assigned in Harpy yet, so every attendee is still tappable -
    // including Brandy, who is already standing in Praxis.
    await expect(poolChips(page)).toHaveCount(6);
    await expect(board(page).locator('.pool-strip')).toContainText('Brandy LaRoux');

    await chipNamed(page, 'Corvin Adeyemi').click();
    await expect(sheet(page).locator('.sheet-title')).toHaveText('Assign support · People’s Harpy');
    await expect(sheet(page).locator('.sheet-action'))
      .toHaveText('Open a People’s Harpy claim for Corvin Adeyemi instead');
    await sheet(page).locator('.sheet-action').click();

    await expect(cardFor(page, CORVIN).locator('.claim-tally')).toHaveText('0votes');
    const claim = state.calls.find(c => c.method === 'POST' && /\/claims$/.test(c.url));
    expect(claim.body).toEqual({ tally: 'harpy', character_id: CORVIN });

    // Desmond's City Status is 3, so a weighted tally would read 3 here.
    await chipNamed(page, 'Desmond Okafor').click();
    await expect(sheet(page).locator('.sheet-row')).toContainText('0 votes');
    await sheet(page).locator('.sheet-row', { hasText: 'Corvin Adeyemi' }).click();

    await expect(cardFor(page, CORVIN).locator('.claim-tally')).toHaveText('1votes');
    const put = state.calls.find(c => c.method === 'PUT');
    expect(put.body).toEqual({
      tally: 'harpy',
      supporter_character_id: DESMOND,
      claimant_character_id: CORVIN,
    });

    // The Praxis side never moved.
    await switchTo(page, 'praxis', 'Praxis Claim');
    await expect(cards(page)).toHaveCount(1);
    await expect(cardFor(page, BRANDY)).toBeVisible();
  });

  test('withdrawing a Harpy claim targets the Harpy tally', async ({ page }) => {
    const state = await setup(page, boardWithTallies(
      { claims: [BRANDY], support: { [PETRA]: BRANDY } },
      { claims: [MIKAEL], support: { [WREN]: MIKAEL } },
    ));
    await openPraxis(page);
    await switchTo(page, 'harpy', 'People’s Harpy Vote');

    await cardFor(page, MIKAEL).locator('.claim-withdraw').click();

    await expect(board(page).locator('.pb-status'))
      .toHaveText('Claim withdrawn. 1 supporter returned to the pool.');
    const del = state.calls.find(c => c.method === 'DELETE');
    expect(del.url).toContain('tally=harpy');

    // Praxis kept its own claim and its own supporter.
    await switchTo(page, 'praxis', 'Praxis Claim');
    await expect(cardFor(page, BRANDY).locator('.support-chip')).toContainText('Petra Voss');
  });
});

test.describe('prax.3 - the summary row (AC7, AC8, AC9)', () => {
  test('both leaders show at once, unchanged by which tab is active', async ({ page }) => {
    await setup(page, boardWithTallies(
      { claims: [BRANDY, MIKAEL], support: { [PETRA]: BRANDY } },
      { claims: [MIKAEL, CORVIN], support: { [WREN]: MIKAEL, [DESMOND]: MIKAEL } },
    ));
    await openPraxis(page);

    const assertSummary = async () => {
      // Praxis: Brandy 5 + Petra 2 = 7, ahead of Mikael's 5.
      await expect(summaryFor(page, 'praxis').locator('.tally-summary-label')).toHaveText('Praxis leader');
      await expect(summaryFor(page, 'praxis').locator('.tally-summary-leader')).toContainText('Brandy LaRoux');
      await expect(summaryFor(page, 'praxis').locator('.tally-summary-leader .n')).toHaveText('7');
      // Harpy: Mikael on 2 votes, ahead of Corvin's 0.
      await expect(summaryFor(page, 'harpy').locator('.tally-summary-label')).toHaveText('Harpy leader');
      await expect(summaryFor(page, 'harpy').locator('.tally-summary-leader')).toContainText('Mikael Thorne');
      await expect(summaryFor(page, 'harpy').locator('.tally-summary-leader .n')).toHaveText('2');
    };

    await assertSummary();
    await switchTo(page, 'harpy', 'People’s Harpy Vote');
    await assertSummary();

    // The live dot marks which contest the board below is working.
    await expect(summaryFor(page, 'harpy').locator('.pb-live')).toHaveCount(1);
    await expect(summaryFor(page, 'praxis').locator('.pb-live')).toHaveCount(0);
    await switchTo(page, 'praxis', 'Praxis Claim');
    await expect(summaryFor(page, 'praxis').locator('.pb-live')).toHaveCount(1);
    await expect(summaryFor(page, 'harpy').locator('.pb-live')).toHaveCount(0);
  });

  test('a tally with no claims reads "No claims yet"', async ({ page }) => {
    await setup(page, emptyBoard());
    await openPraxis(page);

    // The row shows the moment a board exists, before either side has a claim.
    await expect(board(page).locator('.tally-summary')).toHaveCount(1);
    await expect(summaryFor(page, 'praxis').locator('.tally-summary-empty')).toHaveText('No claims yet');
    await expect(summaryFor(page, 'harpy').locator('.tally-summary-empty')).toHaveText('No claims yet');

    await chipNamed(page, 'Brandy LaRoux').click();
    await sheet(page).locator('.sheet-action').click();

    await expect(summaryFor(page, 'praxis').locator('.tally-summary-leader')).toContainText('Brandy LaRoux');
    await expect(summaryFor(page, 'harpy').locator('.tally-summary-empty')).toHaveText('No claims yet');
  });

  test('a tie is broken alphabetically, for display only', async ({ page }) => {
    // Both Harpy claimants sit on zero votes, and Corvin is listed FIRST on the
    // document, so first-past-the-post ordering would name him.
    await setup(page, boardWithTallies({}, { claims: [CORVIN, BRANDY] }));
    await openPraxis(page);

    await expect(summaryFor(page, 'harpy').locator('.tally-summary-leader')).toContainText('Brandy LaRoux');
    await expect(summaryFor(page, 'harpy').locator('.tally-summary-leader .n')).toHaveText('0');
  });
});

test.describe('prax.3 - dual-dot pool chips (AC10)', () => {
  test('each chip reports its membership in BOTH tallies', async ({ page }) => {
    await setup(page, boardWithTallies(
      { claims: [BRANDY], support: { [PETRA]: BRANDY } },
      { claims: [MIKAEL], support: { [WREN]: MIKAEL } },
    ));
    await openPraxis(page);

    // Praxis pool: everyone bar Brandy (claimant) and Petra (supporter).
    await expect(poolChips(page)).toHaveCount(4);
    await expectChipDots(page, 'Mikael Thorne', false, true);   // Harpy claimant
    await expectChipDots(page, 'Wren Halloway', false, true);   // Harpy supporter
    await expectChipDots(page, 'Corvin Adeyemi', false, false); // neither
    await expectChipDots(page, 'Desmond Okafor', false, false);

    await switchTo(page, 'harpy', 'People’s Harpy Vote');

    // Harpy pool: everyone bar Mikael (claimant) and Wren (supporter).
    await expect(poolChips(page)).toHaveCount(4);
    await expectChipDots(page, 'Brandy LaRoux', true, false);   // Praxis claimant
    await expectChipDots(page, 'Petra Voss', true, false);      // Praxis supporter
    await expectChipDots(page, 'Corvin Adeyemi', false, false);
    await expectChipDots(page, 'Desmond Okafor', false, false);
  });

  test('a dot lights up as soon as the other tally gains that character', async ({ page }) => {
    await setup(page, boardWithTallies({ claims: [BRANDY] }, {}));
    await openPraxis(page);
    await switchTo(page, 'harpy', 'People’s Harpy Vote');

    await expectChipDots(page, 'Corvin Adeyemi', false, false);

    // Open a Harpy claim for Mikael, then check Corvin supporting him.
    await chipNamed(page, 'Mikael Thorne').click();
    await sheet(page).locator('.sheet-action').click();
    await chipNamed(page, 'Corvin Adeyemi').click();
    await sheet(page).locator('.sheet-row', { hasText: 'Mikael Thorne' }).click();

    // Corvin is assigned in Harpy now, so he leaves the Harpy pool entirely...
    await expect(board(page).locator('.pool-strip')).not.toContainText('Corvin Adeyemi');
    // ...and shows a lit gold dot back on the Praxis tab, where he is still
    // unassigned and therefore still in the pool.
    await switchTo(page, 'praxis', 'Praxis Claim');
    await expectChipDots(page, 'Corvin Adeyemi', false, true);
    await expectChipDots(page, 'Mikael Thorne', false, true);
  });
});

// ═══ prax.4a - resolving the People's Harpy vote ═════════════════════════════
//
// Extends this spec again rather than forking, on the same reasoning prax.3
// gave: every test below drives the SAME component through the SAME stateful
// fake, and that fake now models the resolve route's own two guarantees - the
// snapshot is written once, and the seat changes hands in the same call.

const praxisToast = page => page.locator('.praxis-toast');
const resolvedCard = page => board(page).locator('.resolved-summary');
const declareBtn = (page, id) => cardFor(page, id).locator('.claim-resolve');
const dismissBtn = page => board(page).locator('.dismiss-vote');

/** A board whose Harpy tally is already resolved when the tab first loads. */
function resolvedBoard(harpyResolved, praxis, harpy) {
  const b = boardWithTallies(praxis, harpy);
  b.resolved.harpy = harpyResolved;
  return b;
}

test.describe('prax.4a - declaring a winner (AC8, AC11, AC12)', () => {
  test('Declare Winner posts the claimant id and replaces the live section with the result', async ({ page }) => {
    const state = await setup(page, boardWithTallies(
      { claims: [BRANDY], support: { [PETRA]: BRANDY } },
      { claims: [MIKAEL, CORVIN], support: { [WREN]: MIKAEL, [DESMOND]: MIKAEL } },
    ));
    await openPraxis(page);
    await switchTo(page, 'harpy', 'People’s Harpy Vote');

    // Both actions are live while resolved.harpy is still null.
    await expect(declareBtn(page, MIKAEL)).toHaveText('Declare Winner');
    await expect(declareBtn(page, CORVIN)).toHaveCount(1);
    await expect(dismissBtn(page)).toHaveCount(1);

    await declareBtn(page, MIKAEL).click();

    const post = state.calls.find(c => c.method === 'POST' && /\/resolve-harpy$/.test(c.url));
    expect(post.body).toEqual({ claimant_character_id: MIKAEL });

    // AC11: the frozen result, read off the snapshot rather than recounted.
    await expect(resolvedCard(page)).toHaveClass(/\bwon\b/);
    await expect(resolvedCard(page).locator('.icon')).toHaveText('Resolved');
    await expect(resolvedCard(page).locator('.winner-name')).toHaveText('Mikael Thorne');
    await expect(resolvedCard(page).locator('.winner-tally'))
      .toHaveText('People’s Harpy · 2 votes · 12 Aug 2026');

    // AC12: nothing left to assign, and no sheet trigger left to tap.
    await expect(board(page).locator('.pool-strip')).toHaveCount(0);
    await expect(cards(page)).toHaveCount(0);
    await expect(board(page).locator('.claim-resolve')).toHaveCount(0);
    await expect(dismissBtn(page)).toHaveCount(0);
    await expect(sheet(page)).toHaveCount(0);

    // The header and the summary row above it are untouched (AC11).
    await expect(board(page).locator('.pb-title')).toHaveText('People’s Harpy Vote');
    await expect(board(page).locator('.tally-switch')).toHaveCount(1);
    await expect(summaryFor(page, 'harpy').locator('.tally-summary-leader')).toContainText('Mikael Thorne');
  });

  test('a losing claimant can be declared, and their OWN headcount is what freezes', async ({ page }) => {
    // Nothing on this screen obeys the leader; the ST decides. Corvin sits on
    // one vote against Mikael's two.
    await setup(page, boardWithTallies({}, {
      claims: [MIKAEL, CORVIN],
      support: { [WREN]: MIKAEL, [DESMOND]: MIKAEL, [PETRA]: CORVIN },
    }));
    await openPraxis(page);
    await switchTo(page, 'harpy', 'People’s Harpy Vote');

    await declareBtn(page, CORVIN).click();

    await expect(resolvedCard(page).locator('.winner-name')).toHaveText('Corvin Adeyemi');
    await expect(resolvedCard(page).locator('.winner-tally'))
      .toHaveText('People’s Harpy · 1 vote · 12 Aug 2026');
  });

  test('a board that is ALREADY resolved on load renders the summary and no actions', async ({ page }) => {
    // The 409 is the server's backstop; the client's job is never to offer the
    // action a second time in the first place.
    await setup(page, resolvedBoard(
      { winner_character_id: PETRA, final_tally: 3, resolved_at: RESOLVED_AT },
      { claims: [BRANDY] },
      { claims: [PETRA, CORVIN] },
    ));
    await openPraxis(page);
    await switchTo(page, 'harpy', 'People’s Harpy Vote');

    await expect(resolvedCard(page).locator('.winner-name')).toHaveText('Petra Voss');
    await expect(resolvedCard(page).locator('.winner-tally'))
      .toHaveText('People’s Harpy · 3 votes · 12 Aug 2026');
    await expect(board(page).locator('.claim-resolve')).toHaveCount(0);
    await expect(dismissBtn(page)).toHaveCount(0);
    await expect(cards(page)).toHaveCount(0);
  });
});

test.describe('prax.4a - dismissing the vote (AC9, AC11)', () => {
  test('Dismiss vote sends an explicit null and records no winner', async ({ page }) => {
    const state = await setup(page, boardWithTallies({}, { claims: [MIKAEL], support: { [WREN]: MIKAEL } }));
    await openPraxis(page);
    await switchTo(page, 'harpy', 'People’s Harpy Vote');

    await expect(dismissBtn(page)).toHaveText('Dismiss vote (no winner)');
    await dismissBtn(page).click();

    const post = state.calls.find(c => c.method === 'POST' && /\/resolve-harpy$/.test(c.url));
    // The key must be PRESENT and null: an absent key is a 400 server-side, and
    // the two mean genuinely different things.
    expect(Object.keys(post.body)).toEqual(['claimant_character_id']);
    expect(post.body.claimant_character_id).toBeNull();

    await expect(resolvedCard(page)).toHaveClass(/\babandoned\b/);
    await expect(resolvedCard(page).locator('.icon')).toHaveText('Dismissed');
    await expect(resolvedCard(page).locator('.winner-name')).toHaveText('No winner declared');
    await expect(resolvedCard(page).locator('.winner-tally')).toHaveText('People’s Harpy · 12 Aug 2026');

    // The claim history is not wiped server-side, and the summary row above
    // still reads it: only the LIVE section below is gone.
    await expect(cards(page)).toHaveCount(0);
    await expect(summaryFor(page, 'harpy').locator('.tally-summary-leader')).toContainText('Mikael Thorne');
  });
});

test.describe('prax.4a - the confirmation toast (AC10)', () => {
  test('names the winner and the outgoing holder, on two lines', async ({ page }) => {
    // Brandy holds the People's Harpy seat in the seat fixtures, so she is the
    // one vacating. The client reads that BEFORE the write, because the
    // response deliberately carries no seat data at all.
    await setup(page, boardWithTallies({}, { claims: [MIKAEL], support: { [WREN]: MIKAEL } }));
    await openPraxis(page);
    await switchTo(page, 'harpy', 'People’s Harpy Vote');

    await declareBtn(page, MIKAEL).click();

    await expect(praxisToast(page)).toBeVisible();
    await expect(praxisToast(page)).toContainText('Mikael Thorne is now People’s Harpy.');
    await expect(praxisToast(page)).toContainText('Brandy LaRoux vacated.');
    // Message-only: the locked design dropped Undo entirely, so the toast
    // carries no button of any kind.
    await expect(praxisToast(page).locator('button')).toHaveCount(0);
  });

  test('omits the vacated line when the seat had no holder', async ({ page }) => {
    const vacantSeats = SEATS.map(s => (s.seat_label === "People's Harpy" ? { ...s, holder_id: null } : s));
    await setup(page, boardWithTallies({}, { claims: [MIKAEL] }), { seats: vacantSeats });
    await openPraxis(page);
    await switchTo(page, 'harpy', 'People’s Harpy Vote');

    await declareBtn(page, MIKAEL).click();

    await expect(praxisToast(page)).toContainText('Mikael Thorne is now People’s Harpy.');
    await expect(praxisToast(page)).not.toContainText('vacated');
  });

  test('the dismiss toast says no winner was recorded', async ({ page }) => {
    await setup(page, boardWithTallies({}, { claims: [MIKAEL] }));
    await openPraxis(page);
    await switchTo(page, 'harpy', 'People’s Harpy Vote');

    await dismissBtn(page).click();

    await expect(praxisToast(page)).toHaveText('People’s Harpy vote dismissed. No winner recorded.');
  });

  test('nothing dismisses it early, and it auto-dismisses on its own', async ({ page }) => {
    await setup(page, boardWithTallies({ claims: [BRANDY] }, { claims: [MIKAEL] }));
    await openPraxis(page);
    await switchTo(page, 'harpy', 'People’s Harpy Vote');

    await declareBtn(page, MIKAEL).click();
    await expect(praxisToast(page)).toBeVisible();

    // A mis-tap on the board underneath must not swallow the one confirmation
    // the ST gets - not even a tap that rebuilds the whole board's markup.
    await switchTo(page, 'praxis', 'Praxis Claim');
    await expect(praxisToast(page)).toBeVisible();
    await board(page).locator('.char-chip').first().click();
    await expect(praxisToast(page)).toBeVisible();

    // Then it goes on its own. The timer is 6s; the generous window here is for
    // the test's own scheduling, not a claim about the duration.
    await expect(praxisToast(page)).toBeHidden({ timeout: 15000 });
  });
});

test.describe('prax.4a - the Praxis tally is untouched (AC8, AC11)', () => {
  test('neither resolve action ever appears on the Praxis tab', async ({ page }) => {
    await setup(page, boardWithTallies({ claims: [BRANDY, MIKAEL] }, { claims: [MIKAEL] }));
    await openPraxis(page);

    // prax.4b owns resolving Praxis. Nothing here may offer it.
    await expect(board(page).locator('.claim-resolve')).toHaveCount(0);
    await expect(dismissBtn(page)).toHaveCount(0);

    await switchTo(page, 'harpy', 'People’s Harpy Vote');
    await expect(board(page).locator('.claim-resolve')).toHaveCount(1);
    await expect(dismissBtn(page)).toHaveCount(1);
  });

  test('the Praxis board stays fully live and fully interactive after Harpy resolves', async ({ page }) => {
    const state = await setup(page, boardWithTallies(
      { claims: [BRANDY], support: { [PETRA]: BRANDY } },
      { claims: [MIKAEL], support: { [WREN]: MIKAEL } },
    ));
    await openPraxis(page);
    await switchTo(page, 'harpy', 'People’s Harpy Vote');
    await declareBtn(page, MIKAEL).click();
    await expect(resolvedCard(page)).toHaveCount(1);

    await switchTo(page, 'praxis', 'Praxis Claim');

    // Everything prax.2/prax.3 shipped, unchanged.
    await expect(resolvedCard(page)).toHaveCount(0);
    await expect(cardFor(page, BRANDY).locator('.claim-tally')).toContainText('7');
    await expect(cardFor(page, BRANDY).locator('.support-chip')).toContainText('Petra Voss');
    await expect(poolChips(page)).toHaveCount(4);

    // And still writable: a fresh support assignment lands on the Praxis side.
    await chipNamed(page, 'Corvin Adeyemi').click();
    await sheet(page).locator('.sheet-row', { hasText: 'Brandy LaRoux' }).click();
    await expect(cardFor(page, BRANDY).locator('.claim-tally')).toContainText('9');

    const put = state.calls.find(c => c.method === 'PUT');
    expect(put.body.tally).toBe('praxis');

    // The Harpy side is still resolved, and switching back proves it.
    await switchTo(page, 'harpy', 'People’s Harpy Vote');
    await expect(resolvedCard(page).locator('.winner-name')).toHaveText('Mikael Thorne');
  });

  test('the outgoing holder loses the stale "vacates on win" badge after the handover', async ({ page }) => {
    // The seat array is re-read after a resolve, so Brandy stops being labelled
    // the sitting People's Harpy the moment she stops being it.
    await setup(page, boardWithTallies({ claims: [BRANDY] }, { claims: [MIKAEL] }));
    await openPraxis(page);
    await expect(cardFor(page, BRANDY).locator('.claim-badge.amber')).toHaveCount(1);

    await switchTo(page, 'harpy', 'People’s Harpy Vote');
    await declareBtn(page, MIKAEL).click();
    await switchTo(page, 'praxis', 'Praxis Claim');

    await expect(cardFor(page, BRANDY).locator('.claim-badge.amber')).toHaveCount(0);
  });
});
