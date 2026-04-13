# Downtime Helper

A browser-based Storyteller tool for processing Terra Mortis downtime submissions. Upload a Google Forms CSV export, review and search all character actions, and track cycle-over-cycle changes -- no server required.

## Usage

Open `index.html` directly in a browser (Chrome or Firefox recommended). No build step, no dependencies, no network connection needed after the fonts load.

1. Drop a Google Forms CSV export onto the upload zone, or use the Browse button.
2. The tool parses all rows, saves them to the local IndexedDB, and renders the dashboard.
3. Re-upload the same CSV at any time as more players submit -- existing characters are updated in place and the report shows new / updated / unchanged counts.
4. Use **New Cycle** when a downtime period ends and a fresh one begins.
5. Use **Export JSON** to dump the active cycle's submissions to a file.

---

## Architecture

### File structure

```
downtime_helper/
  index.html        -- Single-page shell; loads all scripts as plain <script> tags
  css/
    style.css       -- Dark-theme CSS with custom properties; no framework
  js/
    parser.js       -- CSV tokeniser + parseDowntimeCSV() → submission objects
    db.js           -- IndexedDB persistence layer
    dashboard.js    -- All rendering: tabs, charts, territory panels, player detail
    main.js         -- Entry point: wires file upload UI to parser, DB, and dashboard
  ../schemas/
    downtime_v1.schema.json  -- JSON Schema for one submission object
```

Scripts are loaded as plain globals (no ES modules) so the tool works on `file://` URLs without a local server.

---

## IndexedDB database

The database is named **`terra_mortis_downtime`** and lives in the browser's local storage, scoped to the file path. It persists across sessions automatically and is viewable in DevTools → Application → IndexedDB.

### Current schema version: 3

A version bump wipes and recreates all stores. This has been used twice during early development when the stored object shape changed. Any re-import of the CSV fully restores the data.

### Object stores

The database normalises submissions into five related stores:

```
cycles
  id (PK, auto)
  label          -- "April 2026" etc.
  loaded_at      -- ISO timestamp
  status         -- "active" | "closed"
  submission_count

submissions
  id (PK, auto)
  cycle_id       -- FK → cycles
  character_name
  player_name
  timestamp
  attended
  is_regent
  regent_territory
  has_rituals
  has_acquisitions
  xp_spend
  st_notes
  updated_at
  _raw           -- full parsed submission object (the entire schema tree)
  _rawHash       -- JSON.stringify(_raw), used for unchanged detection

projects
  id (PK, auto)
  cycle_id       -- FK → cycles
  submission_id  -- FK → submissions
  character_name
  action_type
  primary_pool   -- DicePool { expression, size }
  secondary_pool -- DicePool { expression, size }
  desired_outcome
  description

sphere_actions
  id (PK, auto)
  cycle_id
  submission_id
  character_name
  merit_type
  action_type
  desired_outcome
  description

contacts
  id (PK, auto)
  cycle_id
  submission_id
  character_name
  contact_type
  request
```

### Indexes

Every foreign key and commonly filtered field has a dedicated index. The most important is the compound unique index on `submissions`:

```
submissions.cycle_char  →  [cycle_id, character_name]  (unique: true)
```

This is the upsert key. When a CSV is uploaded, each row is looked up by `[active_cycle_id, character_name]`. If found and the hash matches, nothing is written. If found and changed, the record is updated and its child rows in `projects`, `sphere_actions`, and `contacts` are deleted and re-inserted wholesale. If not found, a new record is inserted. This means re-uploading a growing CSV is safe at any point before deadline.

Full index list:

| Store | Index name | Field(s) | Unique |
|---|---|---|---|
| cycles | loaded_at | loaded_at | no |
| cycles | status | status | no |
| submissions | cycle_id | cycle_id | no |
| submissions | character_name | character_name | no |
| submissions | player_name | player_name | no |
| submissions | attended | attended | no |
| submissions | cycle_char | [cycle_id, character_name] | yes |
| projects | cycle_id | cycle_id | no |
| projects | submission_id | submission_id | no |
| projects | character_name | character_name | no |
| projects | action_type | action_type | no |
| sphere_actions | cycle_id | cycle_id | no |
| sphere_actions | submission_id | submission_id | no |
| sphere_actions | character_name | character_name | no |
| sphere_actions | merit_type | merit_type | no |
| contacts | cycle_id | cycle_id | no |
| contacts | submission_id | submission_id | no |
| contacts | character_name | character_name | no |
| contacts | contact_type | contact_type | no |

---

## Search and filtering

### How IndexedDB searches work

IndexedDB does not support SQL `WHERE` clauses or full-text search. Instead, all queries use one of three patterns:

**1. Index range scan** -- retrieves all records matching a specific key value via `index.getAll(value)`. Used everywhere a foreign key filter is needed, e.g. `getAllByIndex('submissions', 'cycle_id', cycleId)`. This is fast because IndexedDB maintains a B-tree on the indexed field.

**2. Full store scan + JS filter** -- loads all records from a store with `getAll()` and filters in JavaScript. Used for text search (substring match across multiple fields) since IndexedDB has no `LIKE` operator. Acceptable at downtime scale (tens of submissions, hundreds of action records).

**3. Compound index lookup** -- retrieves a single record by a multi-field key using `index.get([v1, v2])`. Used exclusively for the upsert lookup: `index('cycle_char').get([cycleId, characterName])`.

### Current search capabilities

**Action search** (Summary tab) scans across three stores in real time as you type:

- `projects` -- matches `action_type`, `desired_outcome`, `description`
- `sphere_actions` -- matches `action_type`, `desired_outcome`, `description`, `merit_type`
- `contacts` -- matches the raw request text

Results can be narrowed by a dropdown filter: All / Projects / Sphere / Ambience changes / Patrol+Scout / Contacts.

**Territory search** (Territories tab) uses regex matching against freetext `desired_outcome` and `description` fields to assign each sphere action (and any project with an ambience action type) to a canonical territory. The matcher handles common spelling variants:

| Territory | Matched by |
|---|---|
| The Academy | `academ` |
| The Harbour | `harbou?r` (handles Harbor/Harbour) |
| The Docklands | `\bdocks?\b` or `dockland` |
| The Second City | `\b2nd\s+city\b` or `second\s+city` |
| The Northern Shore | `north(?:ern)?\s+shore` (checked before Shore) |
| The Shore | `\bshore\b` |
| The Barrens | `\bbarren` |

Actions that do not match any territory appear in an "unidentified" bucket.

**Ambience score** aggregates all matched actions by territory and sums `+1` for each Increase action and `-1` for each Decrease action, producing a net score card per territory. Both sphere actions and projects with an ambience action type contribute.

---

## Dice pool parsing

Player-entered pool expressions are parsed into structured `DicePool` objects at CSV import time:

```js
{ expression: "Presence 4 + Empathy 3 + Obfuscate 5 = 12", size: 12 }
{ expression: "Allies 3 (Finance)",                         size: 3  }
{ expression: "Wits + Occult",                              size: null }
```

`parseDicePool()` in `parser.js` resolves `size` as follows:
1. If the expression contains `= N`, use N (player-stated total).
2. Otherwise sum all integer tokens in the string.
3. If no integers are found, `size` is `null`.

`size` is stored in the DB and displayed in the Players tab alongside the expression. When `size` is known but the expression does not already contain `=`, the UI appends `· N dice` so the ST can see the pool count at a glance without re-adding the numbers.

---

## Cycle management

A **cycle** represents one downtime period (typically one month between games). Only one cycle is `active` at a time. The workflow is:

1. The first CSV upload for a period auto-creates an active cycle named after the filename.
2. Re-uploading the same or updated CSV upserts into the same active cycle.
3. **New Cycle** closes the active cycle (status → `closed`) and creates a fresh one.
4. All historical cycles remain in the DB and could be queried directly via DevTools.
5. **Clear Database** wipes all stores (confirmation required).

This means the DB accumulates a full history of downtime cycles across the life of the campaign.

---

## Known limitations and future work

- **Full-text search is a JS filter over all records.** At 50+ submissions with 4 projects each this is still fast, but an external search index would be needed for large datasets.
- **Roll resolution** -- the schema has `DicePoolResult` fields (`dice_string`, `successes`, `rolled_at`) but the UI for entering roll results is not yet built. The DB stores `_raw` with any `roll` data once added.
- **No multi-cycle comparison view** -- the DB contains all historical cycles but the dashboard only renders the active one.
- **Territory matching is regex over freetext.** Actions that name a territory ambiguously or use unusual abbreviations land in the unidentified bucket and must be reviewed manually.
