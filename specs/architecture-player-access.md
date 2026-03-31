---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-04-01'
inputDocuments:
  - specs/architecture.md
  - specs/architecture-st-admin.md
  - specs/prd/epic-restructure-proposal.md
  - specs/prd/epic-3-player-portal.md
  - conversation/google-forms-screenshots (16 sections)
  - conversation/google-drive-player-folder-screenshot
workflowType: 'architecture'
project_name: 'TM Suite — Player Access Layer'
user_name: 'Angelus'
date: '2026-04-01'
---

# Architecture Decision Document — Player Access Layer

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

The Player Access Layer introduces role-based access to the existing TM Suite, transforming a single-role ST application into a multi-role platform. Four functional streams:

**Stream 1: Identity and Access (4 FRs)**
- FR-PA-01: Role-based authentication — same Discord OAuth, three roles: ST (full admin), Player (own character + submissions), Public (landing page only)
- FR-PA-02: Player-to-character mapping — `discord_id` on player record, one player to potentially many characters
- FR-PA-03: ST/Player mode switching — STs who are also players (Symon/Keeper, Kurtis/Charlie) can toggle between admin and player views
- FR-PA-04: Player whitelist — Discord server membership gates access (players + STs), distinct from ST whitelist

**Stream 2: Player Character Area (7 FRs)**
- FR-PA-05: Read-only character sheet — player sees their character(s), locked after ST approval, no editing
- FR-PA-06: Character creator wizard — guided creation flow with dynamic dropdowns (filtered merits, clan-appropriate options), archetype guidance ("combat character? talk to Kurtis"), first character auto-approved, subsequent require ST sign-off
- FR-PA-07: Character approval gate — submitted character is locked; ST reviews and approves; once approved, character is permanently read-only to the player
- FR-PA-08: Ordeal tracking — 5 ordeals (Questionnaire, History, Setting, Covenant, Rules), each worth 3 XP, ST-approved. Rules ordeal unlocks game app dice/rules features
- FR-PA-09: XP request submission — player requests XP spends, cannot exceed available XP, ST approves before character is modified
- FR-PA-10: Published downtime outcomes — player sees ST-authored write-ups and character changes only after the ST publishes them
- FR-PA-11: Archived characters — retired/dead characters remain visible to player as read-only archive

**Stream 3: Downtime Submission (3 FRs)**
- FR-PA-12: Character-aware downtime form — replaces Google Forms. 11 submission domains (Court, Regency, City/Feeding, Projects x4, Spheres x5, Contacts x6, Retainers x5, Acquisitions, Blood Sorcery, Vamping, Admin). Sections shown/hidden based on character data. Dice pools auto-calculated from character dots.
- FR-PA-13: Submission lifecycle — player can edit until deadline. Soft deadline (communicated, e.g. midnight 8 April) + hard deadline (actual cutoff, typically +1 day). Late submissions accepted but not guaranteed processing.
- FR-PA-14: XP spend in downtime — structured request per project, validated against available XP budget

**Stream 4: ST Publish Workflow (4 FRs)**
- FR-PA-15: Downtime review pipeline — ST receives all submissions, reviews macro-to-micro (territory impact, global actions, individual projects, mechanical resolution, response drafting)
- FR-PA-16: ST notes — per-submission notes with `visibility: 'st_only'`, never shown to players. Internal ST coordination notes.
- FR-PA-17: Publish gate — single action publishes all approved outcomes for a cycle: makes write-ups visible to players, applies character mutations (XP, merits, status changes). Requires confirmation safeguard ("Are you sure?")
- FR-PA-18: Post-publish corrections — ST can update individual downtime outcomes and spot-edit characters after publish

**Non-Functional Requirements:**

- **NFR-PA-01 (Security):** API enforces role-based access — not just UI hiding. Player token on `GET /api/characters` returns only their characters. Player token cannot access ST notes. All boundaries server-enforced.
- **NFR-PA-02 (Mobile):** Player area is mobile-friendly for text-heavy sections (downtime narrative, outcomes). Character creator and XP submission may need a more capable layout — responsive rather than mobile-only.
- **NFR-PA-03 (Data integrity):** Character mutations from publish are atomic — all approved changes for a cycle apply together or not at all.
- **NFR-PA-04 (Extensibility):** Auth model designed so Facebook login can be added later without restructuring the identity layer. Player identity sits above auth provider.
- **NFR-PA-05 (Backwards compatibility):** Existing ST workflow must not break. Current admin features continue to work as-is.

**Scale and Complexity:**

- Primary domain: Full-stack (new API routes, new frontend views, new data model layer)
- Complexity level: High — this is the most architecturally significant change since the backend was introduced
- Estimated architectural components: ~12 new/modified modules (players collection, role middleware, player shell, character creator, downtime form, ordeal tracker, publish workflow, submission API, character-aware form engine, XP request flow, archive view, mode switcher)

### Technical Constraints and Dependencies

| Constraint | Source | Implication |
|---|---|---|
| Existing ST auth must not break | NFR-PA-05 | Role expansion must be additive, not a rewrite of `auth.js` |
| Thin API, fat client | Architecture v1 | Character-aware form logic (showing/hiding sections, pool calculation) lives in browser JS, not server |
| Character data is v2 schema | Architecture v1 | Player-facing sheet and creator must use same `accessors.js` layer |
| No build step | Inherited | Character creator wizard is vanilla JS + ES modules |
| 500-line file limit | Coding standards | Complex character creator and downtime form will need careful module decomposition |
| Free tier hosting | Render/Atlas | Rate limiting becomes relevant with 30+ player users (vs 3 STs) |

### Cross-Cutting Concerns Identified

1. **Identity layer** — Currently Discord ID maps directly to "is this an ST?". Now it needs a `players` collection that maps Discord ID to player profile, which links to character(s). This sits between auth and data access.

2. **API access filtering** — Every existing API route needs role-aware query filtering. `GET /api/characters` for an ST returns all; for a player, returns only theirs. This is a middleware concern that touches every route.

3. **Publish atomicity** — The publish action writes to multiple collections (characters, downtime_submissions visibility flags). Needs to be reliable. MongoDB transactions or careful sequential writes with rollback.

4. **Form-to-character bridge** — The downtime form needs live access to character data to filter sections, pre-fill values, calculate pools, and validate XP. This is the same accessor layer the ST admin uses, but read-only and scoped to one character.

5. **Dual-role users** — Symon and Kurtis are both STs and players. The UI needs a clean mode switch that doesn't require logging out and back in.

6. **Submission data model** — The current downtime submission schema (from the CSV parser) needs to be redesigned as a structured document that the form writes to directly, rather than parsing from CSV. The 11 domains map to subdocuments.

## Starter Template Evaluation

### Primary Technology Domain

Brownfield extension of an existing vanilla JS + Express + MongoDB application. No starter template applies.

### Foundation: Existing Codebase

All technology decisions are inherited from the approved architecture documents (v1.0 and ST Admin):

| Decision | Choice | Status |
|---|---|---|
| Language | Vanilla JavaScript (ES2020+) | Established |
| Module system | ES modules (`type="module"`) | Established |
| Styling | CSS3 with custom properties on `:root` | Established |
| Build tooling | None (edit file, refresh browser) | Established |
| Testing | Manual, browser-based | Established |
| Persistence | MongoDB Atlas via Express API | Established |
| Auth | Discord OAuth2 with server-side exchange | Established |
| Hosting | Netlify (frontend), Render (API), Atlas (DB) | Established |

### What's New for the Player Access Layer

No new frameworks, build tools, or dependencies. The player access layer extends the existing codebase with:

1. **`players` collection** — new MongoDB collection for identity/role mapping
2. **Role middleware** — extension of existing `auth.js` to support player role
3. **Player shell** — separate `player.html` entry point, mobile-first layout
4. **Character creator** — new wizard module using existing `accessors.js` and merit/discipline data
5. **Downtime submission form** — new form module replacing Google Forms, character-aware
6. **Publish workflow** — new ST-side action, writes to multiple collections

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (block implementation):**

1. `players` collection with split ordeal tracking
2. Separate `player.html` entry point (mobile-first)
3. Player shell layout: top nav + tabs (Sheet, Downtime, Ordeals, Story, Archive)
4. Domain-based submission subdocuments with `st_review` section
5. MongoDB transaction for atomic publish
6. Progressive form enhancement (Level 1 → 2 → 3)

**Important Decisions (shape architecture):**

- Auth redirect routes by role: player → `player.html`, ST → `admin.html`
- Story tab contains published narrative write-ups + historical downtime submissions
- Downtime tab is current cycle only (submit, edit, check status)
- Bidirectional role switching for dual-role users (no re-login)

**Deferred Decisions (post-launch):**

- Facebook auth (design `players` collection to support it, don't build it)
- Player-visible city/territory info (careful curation needed)
- Player notes/document uploads (low priority text field)
- Real-time notifications (Discord ping when downtime published)

### Decision 1: Identity Model — `players` Collection

**Decision:** New `players` collection for identity, role, and ordeal tracking.

**Rationale:** The player is not the character. Auth, ordeals, and role belong to the person. Characters are what they play. This cleanly supports multiple characters per player, future Facebook auth, and the dual-role ST/player pattern.

**Ordeal split:**

Player-level ordeals (persist across characters):
- **Setting ordeal** — 3 XP granted to all of that player's characters
- **Rules ordeal** — 3 XP granted to all of that player's characters. Unlocks game app dice/rules features.
- **Covenant ordeal** — tagged with covenant name. 3 XP granted to all of that player's characters in that covenant.

Character-level ordeals (tied to specific character):
- **Questionnaire ordeal** — 3 XP to that character only
- **History ordeal** — 3 XP to that character only

When a player creates a new character, retroactive XP is granted for any already-approved player-level ordeals that apply.

**`players` document schema:**

```json
{
  "_id": "ObjectId",
  "discord_id": "694104767298797618",
  "display_name": "Symon G",
  "role": "st",
  "character_ids": ["ObjectId(...)"],
  "ordeals": {
    "setting": { "status": "approved", "approved_at": "2026-03-15T00:00:00Z" },
    "rules": { "status": "approved", "approved_at": "2026-03-20T00:00:00Z" },
    "covenant": {
      "covenant_name": "Circle of the Crone",
      "status": "approved",
      "approved_at": "2026-04-01T00:00:00Z"
    }
  },
  "created_at": "2026-03-01T00:00:00Z",
  "last_login": "2026-04-01T12:00:00Z"
}
```

**Character document extension (existing schema, new fields):**

```json
{
  "ordeals": {
    "questionnaire": { "status": "approved", "approved_at": "2026-03-10T00:00:00Z" },
    "history": { "status": "pending" }
  },
  "approval_status": "approved"
}
```

**Affects:** `server/routes/players.js` (new), `server/middleware/auth.js` (extended), `server/config.js` (ST whitelist moves to DB), `public/js/auth/discord.js` (role-aware redirect)

### Decision 2: Separate `player.html` Entry Point

**Decision:** Three HTML entry points sharing the same JS module layer.

| Entry | Target | Layout | Auth |
|---|---|---|---|
| `admin.html` | Desktop (ST tool) | Sidebar nav, multi-column | Discord OAuth2, ST role |
| `player.html` | Mobile-first (player portal) | Top nav + tabs, responsive | Discord OAuth2, Player role |
| `index.html` | Tablet (live game) | Bottom nav, 600px max | None (local use) |

**Rationale:** ST admin is desktop-first with no responsive breakpoints. Player portal is mobile-first. These are fundamentally different CSS layouts. Separate entry points follow the existing pattern (`admin.html` vs `index.html`) and keep each file simple.

**Auth redirect flow:**
- Discord callback checks `players` collection for role
- `role: "st"` → redirect to `admin.html`
- `role: "player"` → redirect to `player.html`
- Dual-role users land on `admin.html` with bidirectional switching:
  - `admin.html` shows "My Character" link → opens `player.html`
  - `player.html` shows "ST Admin" link → opens `admin.html`
  - Same auth token, no re-login required. Links only appear if user has both roles.

**Affects:** `public/player.html` (new), `public/css/player-layout.css` (new), `public/js/player.js` (new entry script), `public/js/auth/discord.js` (role-aware redirect)

### Decision 3: Player Shell Layout

**Decision:** Top navigation with character selector and five tabs.

```
+-----------------------------------------------+
|  Terra Mortis     [Keeper v]    [Symon G >]    |
+-----------------------------------------------+
|  Sheet | Downtime | Ordeals | Story | Archive  |
+-----------------------------------------------+
|                                                |
|  (tab content)                                 |
|                                                |
+-----------------------------------------------+
```

**Tabs:**

- **Sheet** — read-only character sheet (reuses `editor/sheet.js` with edit controls stripped)
- **Downtime** — current cycle submission form + status. Player submits and edits here until deadline.
- **Ordeals** — ordeal status dashboard. Submit questionnaire/history content. View approved/pending status for all five ordeals.
- **Story** — dossier, character profile, blood-ties, published downtime narrative write-ups, historical downtime submissions. The character's narrative archive.
- **Archive** — retired/dead characters (only visible if player has any). Read-only nostalgia view.

**Character selector** dropdown appears if player has multiple characters.

**New player flow:** Player with no approved characters lands directly in the character creator wizard instead of empty tabs.

**Affects:** `public/js/player.js` (shell routing), `public/js/player/` directory (new modules per tab), `public/css/player-layout.css`

### Decision 4: Downtime Submission Data Model

**Decision:** Domain-based subdocuments matching the 11 form sections, with `st_review` subdocument for ST-only data.

**Rationale:** Mirrors how both the player (filling in the form) and the ST (reviewing submissions) think about the data. Arrays for repeating sections (projects, spheres, contacts, retainers). The `st_review` subdocument is a clean security seam — the API strips it from player responses.

**Submission document schema:**

```json
{
  "_id": "ObjectId",
  "cycle_id": "ObjectId",
  "character_id": "ObjectId",
  "player_id": "ObjectId",
  "status": "draft | submitted | late | under_review | approved | published",
  "submitted_at": null,
  "updated_at": "2026-04-01T12:00:00Z",
  "court": {
    "travel": "",
    "game_recount": "",
    "rp_shoutout": "",
    "correspondence": "",
    "trust": "",
    "harm": "",
    "aspirations": ""
  },
  "regency": {
    "is_regent": false,
    "territory": null,
    "residency_grants": [],
    "residency_count": 0,
    "regency_action": ""
  },
  "feeding": {
    "description": "",
    "territories": [
      { "name": "The Academy", "type": "resident" }
    ],
    "influence_spend": [
      { "territory": "The Academy", "amount": 3 }
    ]
  },
  "projects": [
    {
      "action_type": "Investigate",
      "primary_pool": "Intelligence 3 + Investigation 2",
      "secondary_pool": null,
      "desired_outcome": "",
      "description": "",
      "xp_spend": null
    }
  ],
  "spheres": [
    {
      "merit_type": "Allies 3 (Police)",
      "action_type": "Block",
      "desired_outcome": "",
      "description": ""
    }
  ],
  "contacts": [
    { "request": "" }
  ],
  "retainers": [
    { "action": "" }
  ],
  "acquisitions": {
    "resources": "",
    "skill": ""
  },
  "blood_sorcery": {
    "casting": ""
  },
  "vamping": "",
  "admin": {
    "xp_spend": "",
    "lore_request": "",
    "form_rating": null,
    "form_feedback": ""
  },
  "st_review": {
    "notes": [
      { "author": "Angelus", "text": "...", "visibility": "st_only", "created_at": "..." }
    ],
    "outcome_text": "",
    "outcome_visibility": "draft | published",
    "character_mutations": [
      { "field": "xp_spent", "operation": "add", "value": 4, "description": "Occult 2 -> 3" }
    ],
    "feeding_result": null,
    "approval_status": "pending | approved | modified | rejected"
  }
}
```

**API behaviour by role:**
- ST token: full document including `st_review`
- Player token: document with `st_review` stripped entirely (unless `outcome_visibility` is `"published"`, in which case `outcome_text` is included but `notes` and `character_mutations` remain hidden)

**Affects:** `server/routes/downtime.js` (extended), `public/js/downtime/db.js` (extended), `public/js/player/downtime-form.js` (new)

### Decision 5: Atomic Publish via MongoDB Transaction

**Decision:** Single MongoDB transaction wraps the entire publish action.

**Publish sequence (within transaction):**
1. Set all approved submissions' `st_review.outcome_visibility` to `"published"`
2. Apply all `st_review.character_mutations` to their respective character documents
3. Set cycle status to `"published"` with `published_at` timestamp

All succeed or all roll back. No partial publishes.

**Confirmation safeguard:** Before the transaction fires, the UI shows a modal:
> "Publish Cycle [label]? This will make [X] outcomes visible to players and apply [Y] character changes. This action cannot be undone."
>
> [Cancel] [Publish]

**Post-publish corrections:** ST can still edit individual submissions and spot-edit characters after publish. These are normal CRUD operations outside the transaction — the transaction is only for the bulk publish action.

**Affects:** `server/routes/downtime.js` (publish endpoint), `public/js/admin/downtime-views.js` (publish button + confirmation modal)

### Decision 6: Progressive Form Enhancement

**Decision:** Build the downtime form in three levels, shipping Level 1 first.

| Level | Capability | Dependencies |
|---|---|---|
| **Level 1** | Section gating based on character data (has Contacts? show Contacts section. Is Regent? show Regency.) Player types everything manually. | Character data loaded via API |
| **Level 2** | Smart dropdowns populated from character data. Merit picker, territory list, pool builder with actual attribute/skill dots. | `accessors.js`, `MERITS_DB`, territory data |
| **Level 3** | Auto-calculated pool totals, real-time XP budget validation, influence spend caps, cross-submission validation (e.g. residency count vs other submissions). | Additional API endpoints for cross-submission queries |

Each level is additive — the data model and form structure don't change, only the UI assistance layer grows.

**Affects:** `public/js/player/downtime-form.js` (new, iterates through levels), `public/js/player/form-helpers.js` (Level 2+), `server/routes/downtime.js` (Level 3 validation endpoints)

### Decision Impact Analysis

**Implementation sequence:**
1. `players` collection + role middleware (everything depends on this)
2. `player.html` shell + auth redirect (proves the entry point works)
3. Read-only character sheet in player view (reuses existing `sheet.js`)
4. Downtime submission form Level 1 (core player-facing feature)
5. ST publish workflow (completes the loop)
6. Ordeals, Story tab, Archive (can be parallelised)
7. Character creator wizard (complex, can be built independently)
8. Form Levels 2 and 3 (iterative improvement)

**Cross-component dependencies:**
- Decisions 1 + 2 must be implemented together (role determines which entry point)
- Decision 4 (submission schema) must be in place before Decision 5 (publish) or Decision 6 (form)
- Decision 3 (player shell) is independent of backend decisions — can be built with mock data

## Implementation Patterns and Consistency Rules

### Inherited Patterns (from Architecture v1.0 + ST Admin)

All existing patterns remain in force — see `specs/architecture-st-admin.md` for the full set:

- British English throughout
- `snake_case` for data (MongoDB, API), `camelCase` for JS, `kebab-case` for files
- BEM-lite CSS, all colours via `theme.css` custom properties
- Data access through `accessors.js`, API calls through `api.js`
- Direct response bodies, no envelope wrapper
- ISO 8601 dates, 500-line file limit, comment the why

### New Patterns for the Player Access Layer

#### 1. Role-Based API Filtering

The existing auth middleware validates tokens and checks the ST whitelist. The new pattern extends this:

```js
// server/middleware/auth.js — extended pattern
// req.user is populated by token validation (existing)
// req.user.role is now 'st' | 'player' (new)
// req.user.player_id is the ObjectId from players collection (new)
// req.user.character_ids is an array of ObjectIds (new)
```

**Route-level filtering pattern:**

```js
// ST-only route — rejects player tokens
router.delete('/api/characters/:id', requireRole('st'), async (req, res) => { ... });

// Role-aware route — returns different data based on role
router.get('/api/characters', async (req, res) => {
  if (req.user.role === 'st') {
    // return all characters
  } else {
    // return only characters in req.user.character_ids
  }
});

// Submission route — ST sees st_review, player does not
router.get('/api/downtime_submissions', async (req, res) => {
  const submissions = await getSubmissions(query);
  if (req.user.role === 'player') {
    submissions.forEach(s => stripStReview(s));
  }
  res.json(submissions);
});
```

**`requireRole()` middleware:**
```js
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Insufficient role' });
    }
    next();
  };
}
```

#### 2. `st_review` Stripping Pattern

When serving submission data to a player, the `st_review` subdocument must be handled consistently:

```js
// server/helpers/strip-st-review.js
export function stripStReview(submission) {
  if (!submission.st_review) return submission;

  const { outcome_text, outcome_visibility } = submission.st_review;

  // Published outcome text is visible to the player
  if (outcome_visibility === 'published') {
    submission.published_outcome = outcome_text;
  }

  // Always remove the full st_review object
  delete submission.st_review;
  return submission;
}
```

**Rule:** The `st_review` field never leaves the server for player tokens. Published outcome text is promoted to a top-level `published_outcome` field. This way the player-side code never needs to know about `st_review` at all.

#### 3. Player Shell Module Organisation

Player-specific frontend modules go in `public/js/player/`:

```
public/js/player/
├── shell.js              # Tab routing, character selector, nav rendering
├── sheet-view.js         # Read-only sheet (wraps editor/sheet.js)
├── downtime-form.js      # Submission form — current cycle
├── ordeals-view.js       # Ordeal status and submission
├── story-view.js         # Dossier, history, published outcomes
├── archive-view.js       # Retired characters
├── creator/              # Character creator wizard (sub-modules)
│   ├── wizard.js         # Step flow controller
│   ├── identity-step.js  # Clan, covenant, concept
│   ├── attrs-step.js     # Attribute/skill allocation
│   ├── merits-step.js    # Merit selection (filtered)
│   ├── powers-step.js    # Discipline/devotion selection
│   └── review-step.js    # Summary + submit
└── form/                 # Downtime form sub-modules (Level 2+)
    ├── section-gate.js   # Show/hide sections based on character data
    ├── pool-builder.js   # Dice pool construction helper
    └── xp-validator.js   # XP budget validation
```

**Naming convention:** Player modules use `*-view.js` for tab content (matching `*-views.js` in admin), `*-step.js` for wizard steps.

#### 4. Character Status Lifecycle

Characters move through a strict state machine:

```
draft → submitted → under_review → approved → active → retired
                  → rejected (→ draft, player can resubmit)
```

**`approval_status` field on character documents:**

| Status | Player can edit? | Visible to player? | Visible to ST? |
|---|---|---|---|
| `draft` | Yes (in creator) | Yes | No (not submitted yet) |
| `submitted` | No (locked) | Yes (read-only) | Yes (in review queue) |
| `under_review` | No | Yes (read-only) | Yes |
| `approved` | No | Yes (read-only) | Yes (full edit) |
| `rejected` | Yes (back to creator with ST notes) | Yes | Yes |
| `active` | No | Yes (read-only) | Yes (full edit) |
| `retired` | No | Yes (archive) | Yes (archive) |

**Rule:** Once a character reaches `approved`, the player can never edit it again. All changes go through request/approval flows (XP requests, downtime outcomes). Only STs can directly edit approved characters.

#### 5. Submission Status Lifecycle

```
draft → submitted → late (if after deadline) → under_review → approved | modified | rejected → published
```

**Deadline enforcement:**
```js
// Cycle document has:
{
  "soft_deadline": "2026-04-08T13:00:00Z",  // midnight AEST = 13:00 UTC
  "hard_deadline": "2026-04-09T13:00:00Z",  // +1 day
  "status": "open | closed | published"
}
```

- Before `soft_deadline`: submission status is `"submitted"`
- Between `soft_deadline` and `hard_deadline`: submission status is `"late"`
- After `hard_deadline` or cycle `"closed"`: form is read-only, no new submissions
- **Rule:** the API enforces deadlines, not just the UI. A POST/PUT to submissions after `hard_deadline` returns 403.

#### 6. Dual-Role Detection Pattern

```js
// server/middleware/auth.js
// After validating Discord token and looking up player document:
const player = await getCollection('players').findOne({ discord_id });

req.user = {
  discord_id,
  player_id: player._id,
  role: player.role,
  character_ids: player.character_ids,
  is_dual_role: player.role === 'st' && player.character_ids.length > 0
};
```

**Frontend detection:**
```js
// public/js/auth/discord.js
const isDualRole = user.role === 'st' && user.character_ids.length > 0;
// Show "My Character" / "ST Admin" toggle links accordingly
```

#### 7. XP Grant Cascade Pattern

When an ST approves an ordeal, XP must be granted correctly:

```js
async function approveOrdeal(playerId, ordealType, characterId = null) {
  const player = await getPlayer(playerId);

  switch (ordealType) {
    case 'setting':
    case 'rules':
      // Grant 3 XP to ALL of this player's characters
      await grantXpToCharacters(player.character_ids, 3, `${ordealType} ordeal`);
      break;

    case 'covenant':
      // Grant 3 XP to characters matching the covenant
      const covenantName = player.ordeals.covenant.covenant_name;
      await grantXpToCharactersByCovenant(player.character_ids, covenantName, 3);
      break;

    case 'questionnaire':
    case 'history':
      // Grant 3 XP to the specific character only
      await grantXpToCharacters([characterId], 3, `${ordealType} ordeal`);
      break;
  }
}
```

**Retroactive grant rule:** When a new character is created and approved, the system checks the player's existing ordeals and grants any applicable XP automatically.

### Anti-Patterns

| Do not | Do instead |
|---|---|
| Check role in frontend JS to hide data | Enforce role in API middleware — UI is convenience, not security |
| Include `st_review` in player API responses | Use `stripStReview()` on every player-facing response |
| Let players POST to `/api/characters/:id` | Player edits go through request/approval endpoints |
| Check deadlines only in the form UI | API enforces `hard_deadline` — reject late submissions server-side |
| Store role in localStorage and trust it | Role comes from the server on every request via `req.user` |
| Create separate accessor functions for player vs ST | Same `accessors.js` — the API controls what data is returned |

## Project Structure and Boundaries

### New and Modified Files

The player access layer adds the following to the existing project structure (see `specs/architecture-st-admin.md` for the complete tree):

```
public/
├── player.html                          # NEW — Player portal entry point (mobile-first)
├── css/
│   └── player-layout.css                # NEW — Player portal layout (top nav, tabs, responsive)
└── js/
    ├── player.js                        # NEW — Player app entry: init, auth check, tab routing
    ├── auth/
    │   └── discord.js                   # MODIFIED — role-aware redirect (ST→admin, player→player)
    ├── data/
    │   └── api.js                       # MODIFIED — no changes to interface, just used by new modules
    ├── player/                          # NEW — Player-specific modules
    │   ├── shell.js                     # Tab routing, character selector, nav rendering
    │   ├── sheet-view.js                # Read-only sheet (wraps editor/sheet.js)
    │   ├── downtime-form.js             # Submission form — current cycle
    │   ├── ordeals-view.js              # Ordeal status and submission
    │   ├── story-view.js                # Dossier, published outcomes, historical DTs
    │   ├── archive-view.js              # Retired characters
    │   ├── creator/                     # Character creator wizard
    │   │   ├── wizard.js                # Step flow controller
    │   │   ├── identity-step.js         # Clan, covenant, concept
    │   │   ├── attrs-step.js            # Attribute/skill allocation
    │   │   ├── merits-step.js           # Merit selection (filtered by prerequisites)
    │   │   ├── powers-step.js           # Discipline/devotion selection
    │   │   └── review-step.js           # Summary + submit for approval
    │   └── form/                        # Downtime form sub-modules (Level 2+)
    │       ├── section-gate.js          # Show/hide sections based on character data
    │       ├── pool-builder.js          # Dice pool construction helper
    │       └── xp-validator.js          # XP budget validation
    └── admin/
        └── downtime-views.js            # MODIFIED — publish button + confirmation modal

server/
├── routes/
│   ├── auth.js                          # MODIFIED — role-aware callback, player record lookup
│   ├── players.js                       # NEW — /api/players CRUD, ordeal approval
│   ├── downtime.js                      # MODIFIED — publish endpoint, role-filtered responses
│   └── characters.js                    # MODIFIED — role-filtered queries, approval_status
├── middleware/
│   └── auth.js                          # MODIFIED — player role support, requireRole()
└── helpers/
    └── strip-st-review.js              # NEW — strips st_review from player responses
```

### Architectural Boundaries

**Auth boundary (extended):**
- `discord.js` (client) handles OAuth flow + role-aware redirect
- `auth.js` (middleware) validates token, resolves player record, populates `req.user` with role + character_ids
- `requireRole()` middleware gates ST-only routes
- Role-filtered queries in route handlers gate data access

**Player data boundary:**
- Player can only read characters in their `character_ids` array
- Player can only read/write submissions where `player_id` matches
- `st_review` is stripped from all player responses via `stripStReview()`
- Character edits by players are forbidden — all changes go through request/approval

**Presentation boundary (new):**
- `player.js` owns the player shell (top nav, tabs, character selector)
- `admin.js` owns the admin shell (sidebar, four domains) — unchanged
- `app.js` owns the game shell (bottom nav) — unchanged
- Player modules in `public/js/player/` render into containers provided by the player shell
- Shared modules (`editor/sheet.js`, `data/accessors.js`, `shared/dice.js`) work across all three apps

### Feature to Structure Mapping

**Identity and Access:**
- `server/routes/players.js` — CRUD + ordeal approval
- `server/middleware/auth.js` — role resolution, requireRole()
- `public/js/auth/discord.js` — redirect logic

**Player Character Sheet:**
- `public/js/player/sheet-view.js` — wraps `editor/sheet.js`

**Character Creator:**
- `public/js/player/creator/*.js` — 6 wizard step modules

**Downtime Submission:**
- `public/js/player/downtime-form.js` — form controller
- `public/js/player/form/*.js` — progressive enhancement modules
- `server/routes/downtime.js` — submission CRUD + deadline enforcement

**Ordeal Tracking:**
- `public/js/player/ordeals-view.js` — player UI
- `server/routes/players.js` — ordeal approval endpoint + XP cascade

**Story Archive:**
- `public/js/player/story-view.js` — narrative content display

**ST Publish Workflow:**
- `server/routes/downtime.js` — publish endpoint (transaction)
- `public/js/admin/downtime-views.js` — publish button + modal

### Data Flow

```
Player browser (player.html)
  |
  +-- player.js (shell, auth check, tab routing)
  |     |
  |     +-- player/shell.js -> character selector -> loads character via api.js
  |     |
  |     +-- player/sheet-view.js -> editor/sheet.js -> accessors.js -> cached char data
  |     |
  |     +-- player/downtime-form.js -> api.js -> POST /api/downtime_submissions
  |     |                                        (API enforces deadline + player ownership)
  |     |
  |     +-- player/story-view.js -> api.js -> GET /api/downtime_submissions?published=true
  |                                          (st_review stripped, published_outcome promoted)
  |
  +-- auth/discord.js -> /api/auth/discord/callback -> players collection lookup -> redirect

ST browser (admin.html) -- publish flow
  |
  +-- admin/downtime-views.js -> "Publish" button -> confirmation modal
        |
        +-- api.js -> POST /api/downtime_cycles/:id/publish
              |
              +-- server/routes/downtime.js -> MongoDB transaction:
                    1. Update submission visibility
                    2. Apply character mutations
                    3. Set cycle status = "published"
```

## Architecture Validation Results

### Coherence Validation

**Decision Compatibility:** All decisions are compatible. The `players` collection (Decision 1) feeds into the role-aware auth (Pattern 1), which determines the entry point redirect (Decision 2), which loads the appropriate shell (Decision 3). The submission schema (Decision 4) supports both the player form (Decision 6) and the publish workflow (Decision 5). No circular dependencies, no contradictions.

**Pattern Consistency:** All new patterns follow the established conventions — `snake_case` for MongoDB fields, `kebab-case` for files, `camelCase` for JS, British English in error messages. All API calls through `api.js`, all character data through `accessors.js`.

**Structure Alignment:** New `public/js/player/` directory follows the same organisational pattern as `public/js/admin/` and `public/js/suite/`. Server additions follow existing directory conventions.

### Requirements Coverage

| Requirement | Coverage | Module(s) |
|---|---|---|
| FR-PA-01 (Role-based auth) | Full | `middleware/auth.js`, `routes/players.js` |
| FR-PA-02 (Player-character mapping) | Full | `players` collection, `character_ids` array |
| FR-PA-03 (ST/Player switching) | Full | `is_dual_role` detection, bidirectional links |
| FR-PA-04 (Player whitelist) | Full | `players` collection with `role` field |
| FR-PA-05 (Read-only sheet) | Full | `player/sheet-view.js` wrapping `editor/sheet.js` |
| FR-PA-06 (Character creator) | Full | `player/creator/*.js` (6 wizard steps) |
| FR-PA-07 (Approval gate) | Full | `approval_status` lifecycle, Pattern 4 |
| FR-PA-08 (Ordeal tracking) | Full | Split ordeal model, XP cascade pattern |
| FR-PA-09 (XP requests) | Full | Request/approval flow, player cannot edit directly |
| FR-PA-10 (Published outcomes) | Full | `st_review.outcome_visibility`, `stripStReview()` |
| FR-PA-11 (Archived characters) | Full | `retired` status, Archive tab |
| FR-PA-12 (Character-aware form) | Full | Domain subdocuments, progressive enhancement |
| FR-PA-13 (Submission lifecycle) | Full | Deadline enforcement pattern, status lifecycle |
| FR-PA-14 (XP in downtime) | Full | `xp_spend` fields, validation at Level 3 |
| FR-PA-15 (Review pipeline) | Full | Existing ST downtime views + `st_review` |
| FR-PA-16 (ST notes) | Full | `st_review.notes` with `visibility: 'st_only'` |
| FR-PA-17 (Publish gate) | Full | MongoDB transaction, confirmation modal |
| FR-PA-18 (Post-publish corrections) | Full | Normal CRUD after publish |
| NFR-PA-01 (Security) | Full | Server-enforced role filtering on every route |
| NFR-PA-02 (Mobile) | Full | Separate `player.html` with mobile-first CSS |
| NFR-PA-03 (Data integrity) | Full | MongoDB transaction for publish |
| NFR-PA-04 (Extensibility) | Full | `players` collection supports future auth providers |
| NFR-PA-05 (Backwards compat) | Full | All changes additive, existing ST flow untouched |

### Gap Analysis

**No critical gaps.**

**Important gap — Rate limiting:** With 30+ players hitting the API (vs 3 STs currently), the free-tier Render server could see load spikes around deadline time. Add rate limiting on submission endpoints as a pre-launch hardening task.

**Nice-to-have gap — Notification system:** Players want to know when their downtime is published. Delivery mechanism (Discord webhook, email, or check-the-site) deferred. The publish endpoint can trigger a notification hook when the mechanism is decided.

### Architecture Completeness Checklist

- [x] Project context analysed, scale assessed, constraints identified
- [x] All 6 core decisions documented with rationale
- [x] 7 implementation patterns defined with code examples
- [x] Anti-patterns documented
- [x] Complete file structure with new/modified annotations
- [x] All FRs and NFRs mapped to specific modules
- [x] Data flow documented for both player and ST publish paths
- [x] Ordeal split (player-level vs character-level) fully specified
- [x] Submission schema with all 11 domains defined
- [x] Character and submission status lifecycles documented
- [x] Deadline enforcement pattern specified
- [x] Dual-role detection and switching pattern defined

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High

**Key Strengths:**
- Builds on proven existing architecture — no speculative new tech
- Clean security boundary (API enforces everything, UI is convenience)
- `st_review` stripping pattern is elegant — player code never sees ST data
- Progressive form enhancement allows shipping value early and iterating
- Ordeal split correctly models the domain (player knowledge vs character knowledge)

**Areas for Future Enhancement:**
- Rate limiting before player launch
- Notification delivery mechanism for published downtimes
- Facebook auth provider (players collection designed for it)
- Level 3 form cross-submission validation
- Player-visible territory/city information (careful curation)

### Implementation Handoff

**First implementation priority:** Stand up the `players` collection and extend auth middleware with role support. This unblocks everything else. Then build `player.html` shell with the Sheet tab (reusing `editor/sheet.js`) to prove the full stack end-to-end for a player login.

**Implementation sequence:**
1. `players` collection + role middleware
2. `player.html` shell + auth redirect
3. Read-only character sheet in player view
4. Downtime submission form Level 1
5. ST publish workflow
6. Ordeals, Story tab, Archive
7. Character creator wizard
8. Form Levels 2 and 3
