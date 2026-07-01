# Code review — options to move ST-gated functions into the unified app

**Date:** 2026-06-21
**Author:** Angelus (via Claude)
**Scope:** Architecture review of moving ST-only functionality into the unified app (`index.html` → `app.js`), using the **character editor** as the worked example ("when an ST views a sheet, give them an Edit option"). Read-only investigation; no code changed.

---

## Headline

Most of the machinery is **already in the unified app**. This is a wiring + boundary-policy question, not a rebuild. The server already enforces ST writes correctly, and an ST-inline-edit pattern already ships in production (the Chronicle editor in `story-tab.js`).

---

## What already exists in the unified app

- **Auth parity.** `index.html` and `admin.html` share the same bearer token (`localStorage.tm_auth_token`) and role object. `isSTRole()` works in the unified app today (`public/js/auth/discord.js:41-43`). `admin.html` is simply hard-gated at boot — non-ST are redirected to `/` (`public/js/admin.js:180-186`).
- **Editor code is already bundled.** `app.js` imports the render engine and most edit handlers: `editor/sheet.js`, `editor/edit.js`, `editor/identity.js`, `editor/attrs-tab.js`, `editor/print.js`, `editor/mci.js`, rules cache, ST-mod popover (`public/js/app.js:16-109`).
- **Editor tabs already in the DOM.** `index.html` contains `t-editor` (sheet view, `:113-126`), `t-edit` (Identity + Attributes & Skills, `:128-144`), and `t-sheets` (ST opens a character sheet, `:225-228`).
- **Working ST-inline-edit precedent.** `tabs/story-tab.js` gates inline section editing with `editable = isSTRole() && (cycleStatus closed/complete)` and persists via `apiPut`. ST-only tracker box edits already live in `suite/sheet.js:814`. Other `isSTRole()` gates already in the unified app: `archive-tab.js:203`, `downtime-form.js:1589`, `feeding-tab.js:597`, `questionnaire-form.js:172`, `relationships-tab.js:30`.
- **Server already enforces it.** `PUT /api/characters/:id` is `requireRole('st')` (`server/routes/characters.js:451`). `st`/`dev` elevate correctly in `server/middleware/auth.js`.

### Security note
Shipping editor code to the player bundle is **not** a risk. Auth is bearer-token (no CSRF surface), every write endpoint is role-gated server-side, and the edit UI embeds no secrets. Client-side hiding is UX only. A player calling `apiPut('/api/characters/...')` from DevTools is rejected with 403.

---

## The actual gap (character editor example)

To let an ST edit a character while viewing the sheet in the unified app, only these are missing:

1. **No API save path in `app.js`.** It only has localStorage `saveDB` (`editor/export.js`). The real save — `buildSaveBody()` + `apiPut('/api/characters/:id')` + partner-cascade (`getDirtyPartners`) — lives **only in `admin.js:956-1024`**.
2. **No Edit affordance.** The sheet topbar (`index.html:114-122`) has Rules / PDF / JSON but no Edit button, and there is no edit-mode toggle equivalent to admin's `cd-edit-toggle`.
3. **`app.js` omits the admin-only handlers** by design: all of `edit-domain.js` (domain merits, MCI tier grants, styles/manoeuvres, White Ants / Trap Door, partner tracking), plus rites / pacts / covenant-standing handlers from `edit.js`.
4. **Overlay-strip correctness (ADR-004).** The suite sheet *applies* the ST-mod overlay; admin strips it before editing (`renderSheetWithOverlay` / `stripOverlay`). Any unified-app edit surface must strip first, or it will write modded values back as canonical. This is a correctness constraint, not optional.
5. **Two parallel sheet renderers.** `editor/sheet.js` (full, edit-capable, used by `t-editor`/`sh-content`) vs `suite/sheet.js` (read-only, reuses *some* editor merit renderers via `shRenderInfluenceMerits` etc., used by `t-sheets`). Which one becomes the edit surface is the central design choice.

---

## Options

### Option A — Inline "Edit" on the suite sheet (`t-sheets`), story-tab style
Add an `isSTRole()`-gated Edit button to `suite/sheet.js`, mutate in place, save via a ported `saveCharToApi`.
- **Pros:** smallest visible change; matches the existing `story-tab.js` precedent exactly.
- **Cons / trap:** `suite/sheet.js` is read-only and only reuses *some* editor renderers. Full field editing pulls you into re-implementing or calling `editor/sheet.js` anyway — risking a **third** sheet variant and more of the fragmentation the data-hygiene campaign is trying to kill.

### Option B — Expose the editor that's already there
Unhide `t-editor`/`t-edit` for ST role, port the API save, import the omitted handlers.
- **Pros:** maximum reuse of the genuine editor; no new render surface; the code already ships.
- **Cons:** the unified app visibly gains the full admin edit UI for STs; blurs the ST-Admin boundary (see decision below).

### Option C — Extract a shared save module, then deliver via B  *(recommended target)*
Factor `buildSaveBody` / `saveCharToApi` / partner-cascade out of `admin.js` into a shared `editor/save.js`, consumed by **both** `admin.js` and `app.js`. Then expose the existing editor tabs to STs behind `isSTRole()`, honoring overlay-strip.
- **Pros:** directly retires the "`editor/edit.js` has two importers — admin.js + app.js must stay in sync" fragility already flagged in project memory; gives the unified app a correct save for free; avoids Option A's fork.
- **Cons:** higher upfront cost (an extraction + the wiring), touches `admin.js` save path so needs careful regression checking.

---

## The decision that actually gates this

The standing **three-product vision** is "Game App + Player Portal unified; **ST Admin separate**; no new entry points." Moving the editor — and, by the same recipe, other ST functions (Engine / session log, ST-mods management, territory / court admin, DT processing) — into the unified app **partially merges ST Admin into it**.

Every ST function is already auth-capable in the unified app, so the engineering recipe is the same for all of them: shared mutation/save path + an `isSTRole()`-gated affordance + server enforcement (already present). The real question is **how far the ST-Admin boundary should move**, not whether any single function *can* move.

That is an architecture-direction call. Per project convention: **Angelus owns the decision; Peter advises.**

---

## Recommendation

1. Decide the boundary first: is the goal "convenience edit affordances in the unified app for STs" (narrow) or "fold ST Admin into the unified app over time" (broad)? This changes everything downstream.
2. If proceeding with the editor: target **Option C** — extract the shared save module, then reuse the real editor (Option B) rather than growing a second edit surface on `suite/sheet.js` (avoid Option A's fork).
3. Honor ADR-004: strip the ST-mod overlay on edit-mode entry in the unified app exactly as admin does.
4. Treat the editor as the pilot. If it lands cleanly, the same shared-mutation + gated-affordance pattern generalises to the other ST functions.

---

## Key file references

- Unified app editor imports: `public/js/app.js:16-109`
- Editor tabs in DOM: `public/index.html:113-144, 225-228`
- Admin save path (to extract): `public/js/admin.js:956-1024`
- Admin edit-mode + overlay strip: `public/js/admin.js:121-151, 631-708`
- ST-inline-edit precedent: `public/js/tabs/story-tab.js:193-234`
- Read-only suite sheet: `public/js/suite/sheet.js:178` (`renderSheet`), tracker gate `:814`
- Client auth: `public/js/auth/discord.js:19-55`
- Server write gate: `server/routes/characters.js:451`; middleware `server/middleware/auth.js:82-127`
