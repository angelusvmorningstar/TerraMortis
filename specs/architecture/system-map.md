# TM Suite — System Architecture Map

**Generated:** 2026-04-19 (Exhaustive scan — all source files read)
**Purpose:** Authoritative reference for all stories. Every story touching state, API, or UI must be consistent with this map.

---

## 1. Three-Product Structure

```
terramortissuite.netlify.app/        → public/index.html      Suite app (roll calc, sheet viewer)
terramortissuite.netlify.app/player  → public/player.html     Player portal (sheets, downtime, feeding)
terramortissuite.netlify.app/admin   → public/admin.html      ST admin (characters, attendance, DT processing)
[game app is a tab within admin.html — no separate URL]
tm-suite-api.onrender.com            → server/index.js        Express 5 API
MongoDB Atlas                        → tm_suite database      All persistent data
```

---

## 2. API Layer

### Auth
- `GET/POST /api/auth/discord` — Discord OAuth flow, sets session cookie
- All other routes require `requireAuth` middleware
- ST-only routes additionally require `requireRole('st')`

### MongoDB Collections → API Endpoints

| Collection | Endpoint | Auth | Notes |
|---|---|---|---|
| `characters` | `GET/POST/PUT/DELETE /api/characters` | requireAuth | ST gets all; player gets own only |
| `territories` | `GET/POST/PUT/DELETE /api/territories` | requireAuth | GET open; writes ST-only |
| `tracker_state` | `GET/PUT /api/tracker_state/:character_id` | requireAuth + ST | Upsert only; no delete |
| `game_sessions` | `GET/POST/PUT/DELETE /api/game_sessions` | requireAuth + ST | Stores attendance[] array |
| `downtime_cycles` | `GET/POST/PUT /api/downtime_cycles` | requireAuth | |
| `downtime_submissions` | `GET/POST/PUT /api/downtime_submissions` | requireAuth | |
| `players` | `GET/POST/PUT /api/players` | requireAuth | Emergency contact lives here |
| `investigations` | `/api/downtime_investigations` | requireAuth | |
| `npcs` | `/api/npcs` | requireAuth | |
| `ordeal_submissions` | `/api/ordeal_submissions` | requireAuth | |
| `ordeal_rubrics` | `/api/ordeal_rubrics` | requireAuth | |
| `ordeal_responses` | `/api/ordeal-responses` | requireAuth | |
| `questionnaire` | `/api/questionnaire` | requireAuth | |
| `history` | `/api/history` | requireAuth | |
| `session_logs` | `/api/session_logs` | requireAuth + ST | |
| `territory_residency` | `/api/territory-residency` | requireAuth | |
| `attendance` | `GET /api/attendance` | requireAuth | READ ONLY — no write endpoint |
| `archive_documents` | `/api/archive_documents` | requireAuth | |
| `tickets` | `/api/tickets` | requireAuth | |
| `rules` | `/api/rules` | requireAuth | |
| — | `GET /api/game_sessions/next` | PUBLIC | Website banner next game date |
| — | `GET /api/health` | PUBLIC | DB health check |

### Critical Gap: `/api/attendance` is read-only
The `server/routes/attendance.js` route only implements `GET`. There is no `PUT` or `PATCH` endpoint for saving attendance changes. Attendance writes go through `/api/game_sessions/:id` (PUT entire session document). This is the root cause of the "navigate away and lose data" bug — there is no per-row autosave path.

---

## 3. tracker_state Schema (MongoDB)

```json
{
  "character_id": "string (ObjectId or raw id)",
  "vitae": "integer",
  "willpower": "integer",
  "bashing": "integer",
  "lethal": "integer",
  "aggravated": "integer"
}
```

**Influence and Conditions are NOT in tracker_state.** They are localStorage-only in every current implementation (see Section 5).

---

## 4. Frontend Module Map

### `public/admin.html` — ST Admin App
Tabs: Player | City | Downtime | Attendance & Finance | Engine | [Game App tabs]

Key JS modules loaded:
- `js/admin.js` — top-level init, character grid, sheet editor
- `js/admin/attendance.js` — attendance grid (saves via game_sessions PUT)
- `js/admin/feeding-engine.js` — Engine tab feeding (localStorage, keyed by name)
- `js/admin/session-tracker.js` — Engine tab tracker (localStorage, keyed by name)
- `js/admin/downtime-views.js` — DT processing panel
- `js/admin/dice-engine.js` — dice roller
- `js/game/tracker.js` — canonical game tracker (API + localStorage hybrid)
- `js/player/feeding-tab.js` — feeding roll tab in game app character view

### `public/player.html` — Player Portal
Tabs: Sheet | Feeding | Downtime | Ordeals | Influence | History | etc.

Key JS modules:
- `js/player.js` — top-level init
- `js/player/feeding-tab.js` — feeding roll (API-backed for roll state; influence → localStorage)
- `js/player/downtime-form.js` — downtime submission
- `js/player/influence-tab.js` — influence view (read-only derived)

### `public/index.html` — Suite App (legacy)
Key JS modules:
- `js/suite/tracker.js` — LEGACY tracker (all localStorage, keyed by character NAME)
- `js/suite/tracker-feed.js` — legacy feeding in suite
- `js/suite/sheet.js` — character sheet viewer

---

## 5. State Management — The Fragmentation Problem

This is the core architectural issue identified in the post-game audit.

### Five Separate Storage Implementations

| Implementation | File | Key scheme | Storage | Persisted fields |
|---|---|---|---|---|
| **Game tracker** (canonical) | `js/game/tracker.js` | `_id` | API + localStorage | Vitae/WP/damage → API; Influence/Conditions → localStorage |
| **Suite tracker** (legacy) | `js/suite/tracker.js` | character NAME | localStorage only | Vitae/WP/Influence |
| **Admin Engine tracker** | `js/admin/session-tracker.js` | character NAME | localStorage only | Vitae/WP/Influence |
| **Admin Engine feeding** | `js/admin/feeding-engine.js` | character NAME | localStorage only | Vitae |
| **Player feeding confirm** | `js/player/feeding-tab.js` | `_id` | API (vitae) + localStorage (influence) | Vitae → API; Influence → localStorage |

### Key localStorage Namespaces

| Key | Used by | Content |
|---|---|---|
| `tm_tracker_local_{id}` | game/tracker.js | `{ inf, conditions, vitae_confirmed }` |
| `tm_tracker_{name}` | suite/tracker.js, admin/session-tracker.js, admin/feeding-engine.js | `{ vitae, wp, inf }` |
| `tm_dt_{name}` | suite/tracker.js, admin/session-tracker.js | Downtime expenditure pending |
| `tm_st_feed_{id}` | player/feeding-tab.js | ST feed confirm record `{ vitae, vitaeMax, infSpent, infAfter, infMax }` |
| `tm_tracker_state` | game/tracker.js (legacy migration) | Old bulk tracker state |

### The vitae_confirmed Bridge (Workaround)
When the ST confirms feeding in `player.html`, the code:
1. Writes `vitae` to `/api/tracker_state/{id}` ✓
2. Writes `vitae_confirmed` + `inf` to `localStorage['tm_tracker_local_{id}']` ✗

When the game app tracker tab loads (`initTracker()`), it reads `vitae_confirmed` from localStorage and uses it to override the API value. This is an intentional cross-tab bridge — but it means **influence is never written to the API**, only to localStorage. Switching devices or clearing browser storage destroys influence state.

### The Influence Gap
- `tracker_state` in MongoDB has no `influence` field
- `PUT /api/tracker_state/:id` accepts any body fields, so adding `influence` requires no schema change on the API side
- The game tracker already reads `calcTotalInfluence(c)` as the default — it just never writes it back to the API
- **Fix path:** Add `influence` to `persistedFields()` in `game/tracker.js`, add it to the `tracker_state` upsert, and write it in the feeding confirm instead of localStorage

---

## 6. Feeding Roll Data Flow

### Current (broken) flow:
```
ST opens feeding in player.html
  → feeding-tab.js loads submission from /api/downtime_submissions
  → Player rolls → saved to submission.feeding_roll_player (API ✓)
  → ST confirms feed:
      → vitae written to /api/tracker_state (API ✓)
      → influence written to localStorage tm_tracker_local_{id}.inf (localStorage ✗)
      → vitae_confirmed written to localStorage (localStorage ✗)
  → ST navigates to game app tracker tab
      → game/tracker.js reads API for vitae (picks up vitae_confirmed from localStorage to override)
      → influence read from localStorage.inf (lost if different device or cleared cache)
```

### Required (fixed) flow:
```
ST confirms feed
  → vitae AND influence written to /api/tracker_state (API)
  → No localStorage bridge needed
  → Game tracker reads both from API
  → Player sheet reads both from API
  → All surfaces in sync
```

---

## 7. Attendance Data Flow

### Current (broken) flow:
```
ST opens Attendance tab in admin
  → loads game_sessions via /api/game_sessions
  → renders grid from session.attendance[]
  → ST ticks/unticks boxes → markDirty() sets dirty=true, shows Save button
  → ST must manually click "Save Changes"
      → PUT /api/game_sessions/{id} with entire session body
  → If ST navigates away without saving: ALL changes lost
```

### Required (fixed) flow:
```
ST ticks/unticks any box
  → immediate PUT /api/game_sessions/{id} (debounced, optimistic)
  → no Save button needed
  → navigation is safe
```

---

## 8. Emergency Contact Data Location

Emergency contact information lives in the `players` collection, accessible via `/api/players`.

**Current access path:**
- ST admin → Player tab → player record → scroll to emergency contact field
- There is no shortcut from a character view to that character's player's emergency contact

**Required path:**
- Any character view in ST mode → one tap → emergency contact for that character's linked player
- Data: `/api/players` returns player records with `emergency_contact` field
- Join: `character.player` (name string) → match to `player.name` → show `player.emergency_contact`

---

## 9. Character Schema — Known Validation Issues

The character schema (`server/schemas/character.schema.js`) has `additionalProperties: false` at the top level and on most nested objects. Any field present in MongoDB but absent from the schema will cause a `PUT` validation failure.

**Status.city is defined in the schema** (line 96-100) — the reported validation error needs further investigation. Likely cause: the schema was recently updated to add `status.city` but the deployed Render instance hasn't restarted to pick up the change, OR the client is sending a field outside `status` that is unexpected.

**Known fragile areas:**
- `ordeals[].additionalProperties: true` — intentionally permissive
- `fighting_styles[].up` — legacy Excel field, tolerated
- `merits[].benefit_grants` — legacy MCI format, tolerated

---

## 10. Dice Roller Implementations

| Location | File | Features |
|---|---|---|
| Suite app | `js/suite/roll.js` | Basic pool builder, no modifiers |
| Admin Engine | `js/admin/dice-engine.js` | Character-aware pool builder |
| DT Processing | `js/admin/downtime-views.js` | Smart modifiers (9-Again, specs, Rote) — the gold standard |
| Game app | (missing) | Needs to be built — tasks #2, #3, #4 |

The DT processing dice roller in `downtime-views.js` already has the modifier-aware implementation. New game app roller should extract and reuse this logic rather than implementing it a fourth time.

---

## 11. iOS Dot Rendering Issue

The hollow dot `○` (U+25CB) renders larger than the filled dot `●` (U+25CF) on iOS Safari due to Apple's system font glyph metrics. Current code uses raw Unicode characters.

**Fix path:** Replace `○` with a CSS-rendered hollow dot:
```css
.dot-hollow::before {
  content: '';
  display: inline-block;
  width: 0.7em;
  height: 0.7em;
  border: 2px solid currentColor;
  border-radius: 50%;
  vertical-align: middle;
}
```
This renders identically to `●` in size across all browsers.

---

## 12. Key File Reference for Each Epic

### Epic A — API State Foundation
- `server/routes/tracker.js` — add `influence` field to tracker_state
- `public/js/game/tracker.js` — add influence to `persistedFields()`, remove localStorage bridge
- `public/js/player/feeding-tab.js` — write influence to API not localStorage on confirm
- `public/js/admin/attendance.js` — add per-row autosave, remove explicit Save button
- `server/schemas/character.schema.js` — investigate status.city validation failure

### Epic B — Mobile & Tablet Responsiveness
- `public/css/layout.css`, `public/css/player-layout.css`, `public/css/admin-layout.css`
- `public/js/editor/sheet.js` — character sheet renderer (3-col layout)
- `public/mockups/sheet-col1-mockup.html` — target 1-col layout already built
- `public/js/game/tracker.js` — roll button size
- `public/js/data/helpers.js` — dot rendering helpers

### Epic C — Game App Live Play Features
- `public/js/admin/dice-engine.js` — extract and enhance for game app
- `public/js/admin/downtime-views.js` — modifier logic to reuse
- `public/js/game/tracker.js` — add influence display
- `public/js/data/auspex-insight.js` — Auspex questions already exist as data
- `public/js/player/feeding-tab.js` — source for feeding integration

### Epic D — Admin Housekeeping
- `public/js/admin/rules-view.js` — search bar focus bug
- `server/routes/game-sessions.js` — `getNextSession()` for dynamic dates
- `public/js/admin/next-session.js` — next session display
- `public/admin.html` — Engine tab removal

---

## 13. SSOT Cross-Reference

See also: `specs/reference-data-ssot.md` for domain-to-collection mapping.

Feed methods and territory data: **always import from** `public/js/player/downtime-data.js`.
Do NOT duplicate in `admin/feeding-engine.js` (currently duplicated — task #7 audit should flag this).
