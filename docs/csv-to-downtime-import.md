# CSV → Downtime Import Guide

Quick process for converting Google Forms CSV exports into structured downtime submissions and importing them into MongoDB.

---

## 1. Export the CSV

- Open the Google Form responses spreadsheet
- **File → Download → CSV** (`.csv`)
- Drop the file somewhere accessible (e.g. `data/dt_cycle_N.csv`)

## 2. Feed it to the agent

Give the agent:

1. **The CSV file**
2. **The schema**: `server/schemas/downtime_submission.schema.js` — this is the authoritative field map
3. **The markdown spec**: `schemas/downtime_submission.schema.md` — human-readable reference with action-specific field visibility rules and XP spending logic

### Prompt template

```
Parse the attached CSV of downtime submissions. Map each row to a
downtime_submissions document following the JSON Schema in
server/schemas/downtime_submission.schema.js.

Key rules:
- Each row = one submission. Match character_name to the characters collection.
- All response fields go inside the `responses` object as flat string keys.
- JSON-encoded fields (feeding_territories, influence_spend, xp_spend,
  cast, merits, blood_types) must be serialised as JSON strings.
- Project actions map to project_1_action through project_4_action.
  Decompose the old monolithic description into title, territory, cast,
  merits, and description where possible.
- Sphere actions map to sphere_1 through sphere_5, pre-matched to the
  character's Allies/Status merits.
- Contacts use contact_N_info + contact_N_request (plus contact_N for
  backwards compat).
- Retainers use retainer_N_type + retainer_N_task (plus retainer_N for
  backwards compat).
- Set status to "submitted" and submitted_at to the form timestamp.
- Output as a JSON array of submission documents ready for MongoDB insert.
```

## 3. Match characters to Discord IDs

The agent needs to resolve `character_name` → `character_id` and link to the right player:

```js
// Look up character by name (or moniker)
const char = await db.collection('characters').findOne({
  $or: [{ name: charName }, { moniker: charName }]
});

// character_id = char._id
// The player's discord_id is on the players collection:
const player = await db.collection('players').findOne({
  character_ids: char._id
});
// player.discord_id is the Discord snowflake
```

## 4. Import to MongoDB

### Option A: Via API (preferred)

```bash
# For each submission document in the JSON array:
curl -X POST https://tm-suite-api.onrender.com/api/downtime_submissions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ST_TOKEN>" \
  -d @submission.json
```

### Option B: Direct MongoDB insert

```js
const docs = JSON.parse(fs.readFileSync('submissions.json', 'utf8'));
// Ensure character_id and cycle_id are ObjectIds
for (const doc of docs) {
  doc.character_id = new ObjectId(doc.character_id);
  if (doc.cycle_id) doc.cycle_id = new ObjectId(doc.cycle_id);
}
await db.collection('downtime_submissions').insertMany(docs);
```

### Option C: Use the existing CSV import UI

The admin app has a CSV import flow at **Downtime → Import CSV** which uses `downtime/db.js` `upsertCycle()`. This creates/updates a cycle and upserts submissions matched by character name. It stores the parsed data in `_raw` alongside the flat responses.

## 5. Verify

```js
// Check submissions landed
const subs = await db.collection('downtime_submissions')
  .find({ cycle_id: cycleObjectId })
  .toArray();
console.log(`${subs.length} submissions for this cycle`);

// Spot-check a submission
const s = subs.find(s => s.character_name === 'Mammon');
console.log(s.status, Object.keys(s.responses).length, 'response fields');
```

---

## Field mapping cheat sheet

| CSV column (typical) | Response key | Notes |
|---|---|---|
| Character Name | `character_name` (wrapper) | Match to characters collection |
| Timestamp | `submitted_at` (wrapper) | ISO format |
| Travel | `travel` | |
| Game Recount | `game_recount` | |
| Shoutouts | `rp_shoutout` | Convert to JSON array of IDs |
| Feeding Method | `_feed_method` | Map to enum: seduction/stalking/force/familiar/intimidation/other |
| Feeding Territory | `feeding_territories` | Convert to JSON object |
| Project 1 Action | `project_1_action` | Map to enum |
| Project 1 Description | Split into `project_1_title`, `project_1_description`, `project_1_territory`, `project_1_cast` | |
| Allies/Status actions | `sphere_N_action`, `sphere_N_outcome`, `sphere_N_description` | Match merit to `sphere_N_merit` |
| Contacts | `contact_N_info`, `contact_N_request` | Split "Supporting Info / Request" |
| Retainers | `retainer_N_type`, `retainer_N_task` | Split "Area / Task" |
| XP Spend | `xp_spend` | Convert to JSON array of `{ category, item, dotsBuying }` |
| Vamping | `vamping` | |
| Lore Request | `lore_request` | |
