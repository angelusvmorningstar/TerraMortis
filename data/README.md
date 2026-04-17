# data/

**MongoDB is the live data source. Files here are seed/reference only.**

| File | Purpose |
|------|---------|
| `chars_v2.json` | v2 schema seed — used by `server/migrate.js` to drop+reseed MongoDB |
| `chars_v3.json` | v3 schema working copy — reference only |
| `chars_v2_backup.json` | Safety backup of v2 seed |
| `backup/` | Point-in-time backups |
| `imports/` | Raw import source files |
| `exports/` | Dated character exports from MongoDB (read-only snapshots) |
| `Terra Mortis Character Master (v3.0).xlsx` | Master spreadsheet reference |
| `TM Characters.pdf` | Print reference |

**Do not treat any file in this directory as a substitute for querying the live database.**
