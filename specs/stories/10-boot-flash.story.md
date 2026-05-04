---
id: issue-10
issue: 10
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/10
branch: issue-10-boot-flash
status: ready-for-review
priority: high
depends_on: []
---

# Story #10: Hide `#app` until boot mode + first tab render are committed

As a player or ST hard-reloading the suite or admin app,
I should see the login screen → app reveal — never a transient phone-layout shell with empty content,
So that the boot experience feels intentional and the layout doesn't visibly snap into place.

---

## Context

On hard reload, the post-auth boot sequence in `public/js/app.js:1202-1244` reveals `#app` *before* the body has its `desktop-mode` class set and *before* any tab content is rendered. The result is a visible flash of two transient states:

1. **Wrong-layout chrome** (200–800ms): `#app` is shown without `body.desktop-mode`, so default CSS renders the phone/game layout regardless of viewport. Persists until `_initDesktopMode()` (line 1218) toggles the body class.
2. **Empty content area**: between reveal (`:1206`) and the first `goTab(...)` (`:1242`), `#app` exists but main content is blank.

Both are user-visible on every reload.

The HTML scaffolding already gives us the right starting point — both `index.html:43` and `admin.html` (whatever line) declare `<div id="app" style="display:none">`. The bug is the premature unhide at `app.js:1206`.

### Code surface

`public/js/app.js`:

- `:1184` — `loginScreen` and `app` element refs
- `:1202` — auth-check entry
- `:1205-1206` — **the bug surface**: login hidden + app revealed before any content/mode is set
- `:1207-1217` — role/data/header/menu setup (synchronous + the `loadAllData` await at 1211)
- `:1216-1217` — comment flagging the desktop-mode-before-sheet-render dependency
- `:1218` — `_initDesktopMode()` (body class flip)
- `:1233-1237` — optional `openChar`/`pickChar` for previously-saved character
- `:1242-1244` — first `goTab(...)` (first content render); WS init + non-blocking helpers
- `:1262-1264` — login-screen fallback when not authenticated
- `:1771-1800` — `_initDesktopMode` + `_applyDesktopMode`

### Files in scope

- `public/js/app.js` — boot sequence reordering (the function containing `:1202-1266`).
- (Verify only) `public/index.html:43` and `public/admin.html` `#app` initial state — should remain `display: none`.

### Files NOT in scope

- `loadAllData()` — no refactor to data fetch; the issue explicitly says don't optimise data loading
- WebSocket bring-up / pollers — leave timing as-is
- `_initDesktopMode` / `_applyDesktopMode` internals — call them in the same way, just at the right time
- The login screen flow itself (`:1262-1264`) — keep symmetric

### Constraints

- `_initDesktopMode()` MUST run before any sheet render that depends on knowing desktop vs phone mode (per the comment at `:1216-1217` and confirmed by `openChar` → sheet rendering logic).
- If the boot sequence fails between auth-check and reveal (auth invalid, data load throws), the user must end up on the login screen or an error state — never a permanently-hidden `#app`.
- The fix must not introduce a perceptibly longer "blank" phase. If data loading is the long part, surface a minimal loading indicator. (A spinner inside the still-visible login screen is the recommended approach below.)

---

## Acceptance Criteria

**Given** a player on desktop hard-reloads the suite app (cold cache)
**When** authenticated, the boot sequence runs
**Then** the user sees the login screen until the app is fully laid out, then the app appears with the correct desktop chrome and first tab content already rendered. No transient phone-layout header or empty bottom-nav shell.

**Given** an ST on desktop hard-reloads the admin app
**When** authenticated, the boot sequence runs
**Then** the same applies — no transient default-layout chrome.

**Given** any user on phone or phablet hard-reloads
**When** the app boots
**Then** the layout is stable from the moment `#app` becomes visible (no transient desktop chrome on a phone, no empty content).

**Given** the boot sequence fails (auth invalid)
**When** the failure path runs
**Then** the user lands on the login screen (existing behaviour at `:1262-1264`); `#app` is never permanently hidden with the user stuck on a blank page.

**Given** the boot sequence fails mid-flight (e.g. `loadAllData()` throws)
**When** the error surfaces
**Then** the user sees an error state or falls back to the login screen — the boot promise rejects cleanly and the UI is in a defined state.

**Given** a slow network (data load takes 800ms+)
**When** the user is between login and app reveal
**Then** the login screen remains visible with a non-jarring loading indicator (e.g. spinner or "Loading…" replacing the login button), so the screen does not look frozen.

**Given** the boot path completes successfully
**When** `#app` reveals
**Then** the first tab's content is already painted (no second flash from empty content area).

---

## Implementation Notes

### Recommended shape: defer reveal + keep login visible during boot

Reorder `:1202-1258` so that:

1. The auth check runs as today.
2. **Do NOT unhide `#app` and do NOT hide `loginScreen` at the start of the success branch.**
3. Replace the login button text/area with a "Loading…" indicator (and disable the button to prevent re-clicks during boot).
4. Run all the existing setup: `applyRoleRestrictions()`, `loadAllData()`, `renderList()`, `renderImportBanner()`, `renderUserHeader()`, `_buildCharMenu()`, `_initDesktopMode()`, `_updateThemeIcon()`, `openChar`/`pickChar`, `goTab(...)`.
5. **At the end** (after `goTab` paints the first tab):
   - `loginScreen.style.display = 'none'`
   - `app.style.display = ''`
6. Continue with the non-blocking helpers (`renderLifecycleCards`, `checkMoreBadge`, `startChallengePoller`, `initWS`).

Wrap step 4 in a `try { … } catch (err) { … }` so a mid-flight failure can:
- Restore the login button
- Surface the error (existing toast / console)
- Leave the user on the login screen — `#app` stays hidden

### Sketch

```js
if (isLoggedIn()) {
  const valid = await validateToken();
  if (valid) {
    // Keep login screen visible during boot to avoid the flash;
    // swap the login button to a non-interactive loading indicator.
    const loginBtn = document.getElementById('login-btn');
    const originalLoginHTML = loginBtn?.outerHTML;
    if (loginBtn) {
      loginBtn.disabled = true;
      loginBtn.textContent = 'Loading…';
    }

    try {
      applyRoleRestrictions();
      if (localStorage.getItem('tm_auth_token') === 'local-test-token') {
        await import('./dev-fixtures.js');
      }
      await loadAllData();
      renderList();
      renderImportBanner();
      renderUserHeader();
      _buildCharMenu();
      // Desktop mode must be initialised before rendering so sheet.js
      // knows whether to render into the full sheet or split tabs.
      _initDesktopMode();
      _updateThemeIcon();

      const isDesktop = DESKTOP_MQ.matches;
      const isST = getRole() === 'st';
      if (editorState.chars.length > 0) {
        const savedCharId = localStorage.getItem('tm_active_char');
        const savedIdx = savedCharId
          ? editorState.chars.findIndex(c => String(c._id) === savedCharId)
          : -1;
        const charIdx = !isST ? (savedIdx >= 0 ? savedIdx : 0) : savedIdx;
        if (charIdx >= 0) {
          await ensureTrackerLoaded(editorState.chars[charIdx]);
          openChar(charIdx);
          pickChar(editorState.chars[charIdx]);
        }
      }
      const hasChar = !!suiteState.sheetChar;
      goTab(isDesktop
        ? (!isST && hasChar ? 'sheets' : 'chars')
        : (hasChar ? 'stats' : 'dice'));

      // Atomic reveal — first paint already committed.
      loginScreen.style.display = 'none';
      app.style.display = '';

      renderLifecycleCards();
      checkMoreBadge();
      if (getRole() !== 'st') startChallengePoller();
      initWS({
        onTrackerUpdate: (charId) => {
          refreshTrackerCard(charId);
          if (String(suiteState.sheetChar?._id) === charId) repaintSheetTrackers();
        },
      });
      return;
    } catch (err) {
      console.error('[boot] post-auth setup failed', err);
      // Restore login button, leave the user on the login screen.
      if (loginBtn && originalLoginHTML) loginBtn.outerHTML = originalLoginHTML;
      const restored = document.getElementById('login-btn');
      if (restored) restored.addEventListener('click', login);
      // (Optional) surface the error via existing toast helper if available.
      return;
    }
  }
}

// Show login screen (unauthenticated path)
loginScreen.style.display = '';
app.style.display = 'none';
document.getElementById('login-btn').addEventListener('click', login);
```

### Key behaviours to preserve

- The order `_initDesktopMode()` → `openChar/pickChar` → `goTab(...)` is unchanged.
- The unauthenticated fallback at the bottom of the function (`:1262-1264`) is unchanged.
- `loadAllData()`, `initWS`, pollers all run exactly as before.
- Role-restrictions still applied early enough to gate visible elements (it runs on the still-hidden `#app`, so any DOM tweaks happen before reveal).

### Why login-stays-visible (not a separate loading screen)

- Avoids introducing new DOM that has to be styled for both apps (suite + admin).
- The login screen is already styled, themed, and present in HTML — repurposing the button slot as a loading indicator is the smallest possible change.
- No flash between login dismiss and app reveal because there's no intermediate state.

### Edge cases to verify

- **Failed `loadAllData`**: caught by `try/catch`, login button restored, user can retry.
- **No characters available** (`editorState.chars.length === 0`): the `if` guard at the existing site protects this; `goTab` still runs with the appropriate fallback tab.
- **Re-entry**: the auth-check function should not be called twice in a single page lifecycle, but if it is, the second call will see `#app` revealed and `loginScreen` hidden — the early-return on the success path is still reached.

---

## Test Plan

Manual verification (project has no test framework). Test on **both** the player suite and the admin app, on **both** desktop and phone viewport.

1. **Cold reload — player desktop.** Hard-reload (Cmd+Shift+R) the suite at desktop width. Watch carefully: should see login screen → "Loading…" briefly → fully-laid-out desktop app with correct sidebar/header/content. **No transient phone bottom-nav.**
2. **Cold reload — player phone.** Resize browser to phone width or use device emulation. Hard-reload. Should see login screen → "Loading…" briefly → phone layout with bottom nav and content. **No transient desktop chrome.**
3. **Cold reload — ST admin.** Hard-reload `admin.html` at desktop width (logged in as ST). Should see login → loading → admin app with correct chrome. No transient default layout.
4. **Slow-network sim.** DevTools → Network → Throttle to "Slow 3G". Reload. The "Loading…" state should be visibly active for the duration of `loadAllData()`. No frozen screen.
5. **Failed boot.** Manually break `loadAllData` (e.g. temporarily throw at the top of it, or disconnect network mid-boot). Confirm: error logged, login button restored to clickable state, user can attempt login again.
6. **Already-logged-in fast path.** Reload with valid cached token and warm cache. Boot should be near-instant; "Loading…" might flash but should not be jarring.
7. **No regression — login flow.** Log out, then log in fresh. Login screen → click login → Discord OAuth → callback → "Loading…" → app reveal. Same path, same UX.

---

## Definition of Done

- [ ] All 7 manual tests pass on both apps × both viewports *(QA — browser-only)*
- [x] `git diff` is contained to `public/js/app.js` (no CSS changes needed; reused existing login-button styling)
- [x] No regression in the unauthenticated login path *(unauthenticated fallback at the bottom of the function unchanged)*
- [x] Failure paths leave the user on a usable login screen, never on permanently-hidden `#app` *(catch restores button + attaches click handler)*
- [ ] PR opened by `tm-gh-pr-for-branch` into `dev`, body closes #10 *(SM step after QA)*

---

## Dev Agent Record

**Agent Model Used:** claude-opus-4-7 (James / DEV / Ptah)

**Files Changed:**
- `public/js/app.js` (+78/-51) — single function, post-auth boot path:
  - Loginscreen reveal hide and `#app` show **deferred** until after `_initDesktopMode()` and `goTab(...)` have committed body classes + first paint
  - Login button repurposed in-place as a "Loading…" indicator (`disabled = true`, `textContent = 'Loading…'`); `outerHTML` snapshot captured for restoration
  - All existing setup (`applyRoleRestrictions`, `loadAllData`, render helpers, `_initDesktopMode`, `openChar`/`pickChar`, `goTab`) wrapped in `try { ... }`
  - **Atomic reveal**: `loginScreen.style.display = 'none'; app.style.display = ''` happens immediately after `goTab` and before non-blocking helpers (`renderLifecycleCards`, `checkMoreBadge`, `startChallengePoller`, `initWS`)
  - `catch (err)` path logs the error, sets `#login-error` text, restores the original login button via `outerHTML`, re-attaches the `login` click handler, and returns — leaving the user on a usable login screen rather than a permanently-hidden `#app`

**Constraint compliance:**
- `_initDesktopMode()` order vs `openChar`/`pickChar`/`goTab` — preserved exactly (lines 1228, 1244-1247, 1252-1254)
- `loadAllData()` — not refactored
- WebSocket `initWS` and `startChallengePoller` — same call sites, same args, same timing relative to reveal
- Login fallback at end of function — symmetric, unchanged

**Verification:**
- ACs are visual; no server smoke applies. Browser smoke is QA's step.
- `node --input-type=module --check < public/js/app.js` — clean (no syntax errors).
- Static reasoning against the sketch: the atomic reveal pair is now immediately after `goTab(...)`, so when `#app` becomes visible: body has `desktop-mode` class set, first tab content is painted, role restrictions applied. No transient state can paint.

**Completion Notes:**
- Followed the story sketch verbatim; the only deviation is adding a user-visible error string in `#login-error` on the catch path (`'Could not load app. Please try again.'`). This piggy-backs on the existing `errorEl` captured at the top of the function and surfaces the failure without requiring a new toast helper. Console log still happens for engineer debugging.
- The catch path's `outerHTML` swap creates a fresh DOM node and loses the original element's listeners (there are none on first render — `addEventListener('click', login)` is only attached on the unauthenticated fallback path), so the explicit re-attach inside the catch is correct, not redundant.
- One subtle behaviour: the auth-check `try/catch` at line 1188-1192 around `handleCallback()` is unchanged. That's a separate concern (callback URL parsing), not the boot flash.
- The unauthenticated bottom-of-function path (`:1289-1292`) is reached when `isLoggedIn()` is false OR `validateToken()` returns falsy. Neither path touches the new try/catch. The catch only fires on success-path mid-flight failure.

**Change Log:**
- 2026-05-04 — Implemented per Story #10. Single commit `835b98a` on `issue-10-boot-flash` (app.js + this Dev Agent Record together, per SM standing instruction).
- 2026-05-04 — Follow-up commit: fix QA Concerns A & B. The `#login-screen` element ships with inline `display:none` in both `index.html:34` and `admin.html:26`, and the `#login-screen { display: flex }` CSS rule has no `!important`, so the inline style wins. The original sketch implicitly assumed loginScreen was visible by default — it isn't. Without an explicit unhide at boot, the Loading… indicator and the catch-path error message both render against an invisible element. Two-line fix: `loginScreen.style.display = ''` at the top of the success branch (primary), and the same at the top of the catch (belt-and-braces against future refactors). Both Concerns close: Loading… is now visible during slow-network boot, and the catch-path error message is reachable.

---

## Note for QA (Ma'at)

This story's ACs are **inherently visual** — the bug is "user sees a flash". Hard to verify computationally. The verification path is browser-driven. Suggested approach:

1. Static-review the diff against the implementation sketch above; confirm the order of operations and the try/catch.
2. If browser smoke is feasible from your terminal, do as much of the 7-step plan as possible.
3. Append your QA Results section as a **new commit on this branch BEFORE the PR is opened** (lesson from #14, applied successfully on #4).

---

## QA Results

**Reviewer:** Quinn (Ma'at / QA), claude-opus-4-7
**Date:** 2026-05-04
**Commit reviewed:** 835b98a
**Method:** Static review of the diff against the implementation contract; failure-mode walkthrough on paper; HTML/CSS audit of the login-screen visibility model. Browser smoke (Test Plan steps 1–7) NOT executed — this terminal has no browser harness; deferred to user/SM.

### Gate decision: **CONCERNS** (recommend ship with one-line follow-up; primary bug fix is solid)

### Diff structure review (Khepri's checklist)

| Item | Verdict | Evidence |
|---|---|---|
| Reveal pair AFTER `goTab(...)`, not at start of success branch | PASS | `loginScreen.style.display='none'` + `app.style.display=''` at `app.js:1257-1258`, immediately after `goTab(...)` at `:1252-1254`. Old code's `:1205-1206` reveal pair removed. |
| Setup calls present in same order | PASS | applyRoleRestrictions (1217) → dev-fixtures (1218-1220) → loadAllData (1221) → renderList (1222) → renderImportBanner (1223) → renderUserHeader (1224) → _buildCharMenu (1225) → _initDesktopMode (1228) → _updateThemeIcon (1229) → openChar/pickChar (1245-1246) → goTab (1252-1254). Identical order to pre-fix. |
| `_initDesktopMode → openChar/pickChar → goTab` ordering | PASS | 1228 → 1245-1246 → 1252-1254. Constraint preserved. |
| Try/catch wraps the whole boot, not just one call | PASS | `try` at 1216 spans through `initWS` and `return` at 1273; `catch` at 1274-1285. |
| Catch: restores login button, re-attaches click, leaves #app hidden, returns | PASS-with-caveat (see Concern A) | 1278: errorEl text. 1280-1282: outerHTML restore + re-attach. 1284: return. #app stays hidden because catch fires before line 1258 in realistic failure window. |
| Unauthenticated fallback path (line 1289-1292) unchanged | PASS | Diff shows the success-branch is the only edit; `:1289-1292` is byte-identical (`loginScreen.style.display = ''; app.style.display = 'none'; addEventListener('click', login)`). |

### Ptah's deviation (errorEl in catch)

`errorEl` is captured at `app.js:1186` (`document.getElementById('login-error')`), inside the `boot()` function and in scope at the catch at `:1274-1285`. The message string `'Could not load app. Please try again.'` is sensible and user-actionable. Mechanism is correct; visibility is the issue (Concern A).

### Concerns

**Concern A — Catch-path UI is invisible.** *(severity: medium; one-line fix)*

`<div id="login-screen" style="display:none">` is the initial HTML state in both `public/index.html:34` and `public/admin.html:26`. The CSS rule (`public/css/player-layout.css:14`, `public/css/admin-layout.css:215`) sets `#login-screen { display: flex; }` without `!important`, so the inline `display:none` wins. The login screen is invisible until something explicitly sets `loginScreen.style.display = ''`.

The catch path at `app.js:1274-1285` does NOT do that. It restores the login button's HTML and re-attaches the click handler, and sets `errorEl.textContent`, but all of that lives inside `#login-screen` which remains `display:none`. Net user experience on a mid-flight failure (e.g. `loadAllData()` throws):

- Blank page (200-600ms validating)
- `loadAllData()` rejects → catch fires → `console.error` logged (visible in DevTools, not to user)
- errorEl set, login button restored — both inside hidden container, **not visible**
- User sees: blank page with no UI, no error indication, and no obvious recovery action besides Cmd+R reload

This is a regression from the pre-fix behaviour: previously the catch didn't exist and the user saw a partially-painted #app (broken but at least confirms something happened). Now they see nothing.

**Recommended fix (one line):** add `loginScreen.style.display = '';` near the top of the catch block, e.g. before the `if (errorEl)` line. Then errorEl, restored login button, and "Loading…" text replacement (if any) all become visible.

**Concern B — "Loading…" loading indicator is dead code on hard-reload.** *(severity: low; AC #6 not actually satisfied)*

Story AC #6: "the login screen remains visible with a non-jarring loading indicator". Implementation at `:1209-1214` disables `#login-btn` and sets its text to `'Loading…'`. But `#login-screen` starts hidden and is never made visible during the success path until the post-`goTab` reveal at `:1257`, which then immediately hides it. So:

- **Hard reload of authenticated user:** loginScreen stays `display:none` throughout. User sees blank page → app reveal. Loading indicator never visible. Strictly better than the old flash bug (no wrong-mode chrome), but the loading-indicator UX claimed by AC #6 doesn't actually appear.
- **OAuth callback return:** same flow — loginScreen never unhidden post-callback in the new code path.
- **Genuine unauthenticated state:** falls to `:1289-1292` which unhides loginScreen for the login-attempt UX. Pre-existing, unaffected.

The story sketch (lines 119-189) implicitly assumed loginScreen was visible by default. It is not. Ptah followed the sketch faithfully; the gap is upstream of his implementation.

If AC #6 is a hard requirement, the success path needs `loginScreen.style.display = ''` after capturing `originalLoginHTML` at `:1210`. If AC #6 is aspirational (UX nice-to-have), ship as-is — the primary flash bug *is* fixed.

### Failure-mode walkthrough

| Scenario | Outcome | Verdict |
|---|---|---|
| `loadAllData()` throws | Catch fires; #app hidden (initial state never overridden in success path); login restored but invisible (Concern A). | PASS for "no permanently-hidden #app" criterion *(it stays at its initial hidden state, never gets a stuck `display:''`)*; FAIL for the "user can retry" UX without Concern A fix. |
| `validateToken()` returns false | Falls through to `:1289-1292`; loginScreen unhidden, #app hidden. | PASS — pre-existing behaviour preserved. |
| `openChar()` throws (bad character data) | Catch fires; same as Scenario A. | PASS for #app state; FAIL for visible recovery without Concern A fix. |
| `handleCallback()` throws | Caught by its own `try/catch` at `:1188-1192`, errorEl set. Pre-existing path. | PASS — unchanged. |
| Post-reveal helper throws synchronously (`renderLifecycleCards`/`initWS`) | Catch fires AFTER atomic reveal; #app already revealed, login restored but `loginScreen` still hidden by `:1257`. User sees revealed app + the (invisible) restored login button. Effectively a no-op visible to user. | PASS-by-coincidence. Worth noting that a post-reveal throw still triggers the full catch-path side effects, including the dead-code login button restoration. |

### AC verdicts (verified statically vs deferred to browser)

| AC | Static verdict | Browser smoke required? |
|---|---|---|
| 1. Player desktop hard reload — no transient phone chrome | PASS by static reasoning (atomic reveal AFTER `_initDesktopMode + goTab`, body class committed) | Test 1 — defer to user |
| 2. ST admin desktop hard reload — same | PASS by static reasoning (admin uses same `boot()` function) | Test 3 — defer to user |
| 3. Phone hard reload — no transient desktop chrome | PASS by static reasoning (same atomic reveal path; `DESKTOP_MQ` evaluated and `_initDesktopMode` runs before reveal) | Test 2 — defer to user |
| 4. Auth-invalid → login screen, no permanent-hidden #app | PASS — `:1289-1292` unchanged | — |
| 5. Mid-flight failure → user lands on usable login screen | **CONCERNS** (Concern A) — catch path leaves login screen hidden | Test 5 — defer to user; expect blank page until Concern A fixed |
| 6. Slow network → loading indicator visible | **CONCERNS** (Concern B) — loading indicator code is dead on hard-reload because loginScreen stays hidden | Test 4 — defer to user; expect blank page during await rather than visible "Loading…" |
| 7. Atomic reveal — first tab content already painted | PASS by static reasoning (`goTab` runs BEFORE the reveal pair) | Test 1/2/3/6 — defer to user |

### Lint / parse

`node --input-type=module --check < public/js/app.js` → clean. No syntax errors.

### Recommendation

**Ship if Concern A is treated as a follow-up issue; fix-required if catch-path UX is part of the merge bar for #10.**

The primary flash bug is correctly fixed: atomic reveal after `_initDesktopMode + goTab` eliminates the wrong-layout chrome flash and the empty-content window. ACs 1-4 and 7 are met by construction. Concerns A and B both relate to UX states the user will rarely hit, but Concern A is a one-line addition (`loginScreen.style.display = '';` at the top of the catch) that closes a real gap in the failure UX without revisiting the design.

If the SM prefers a minimal merge, ship as-is and open a follow-up issue for "boot catch path: surface error UI to user". If the SM prefers a clean close on #10, request the one-line addition before merge.
