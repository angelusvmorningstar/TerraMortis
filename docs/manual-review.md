# Manual Review List

Running log of data issues and deferred tasks requiring human attention.
Items are grouped by type. Tick off as resolved.

---

## Open Tickets (24)
*Pulled from Atlas 2026-04-06. All status: open.*

### Bugs (21)

- [ ] **Character CSV** — Columns go wrong from MK onwards
- [ ] **Ordeals** — Ordeals marked and signed off are flagging as In Progress or Unmarked
- [ ] **Cannot Edit Notes/Tags on Sheet** — Tags imported from CSV cannot be deleted or edited
- [ ] **Cannot Delete Merits** — Cannot delete some merits from Ballsack's sheet
- [x] **Viral Mythology** — Should be 2 dots, not 3 (errata change not applied)
- [ ] **MCI not appearing in Spheres of Influence** — MCI should be a useable narrow Mortal Influence in DT
- [ ] **MCI not appearing in Applicable Merits** — MCI missing from Project section Applicable Merits
- [ ] **Characters Involved section missing** — Missing from Personal Projects Misc action
- [x] **PT Free Skill** — Additional Skill dot from PT is hollow and not counted in pools (pools.js now includes _pt_dot4_bonus_skills and _mci_dot3_skills in skill dice)
- [x] **Shout Out PC names** — Names appear as ObjectIDs (e.g. `69cf7da860b712b5eb99625d`) in ST DT review section
- [ ] **Edit Regency** — Cannot edit Regency section
- [ ] **Ritual DT Section** — Mandragora Garden rituals need an "already paid" checkbox for sustained rituals
- [x] **Vitae Budget** — Colour scheme makes it unreadable
- [ ] **Mandragora Garden** — (1) Incorrect bonus dice displaying in Ritual section; (2) Incorrect blood fruit count in Vitae Budget
- [ ] **DT Feeding** — (1) Doesn't include Feeding Grounds; (2) Optional field doesn't allow situational bonuses or specs
- [x] **Rituals** — Cannot select or search for any rituals (dynamic rite selector built; sorcery section now shows character's rites)
- [ ] **Oath of the Scapegoat** — Each dot should give 2 free Fighting Style dots (currently not working)
- [ ] **Hollow Dots** — Hollow dots not passed on correctly via shared merits
- [ ] **Professional Training** — XP refund is at tier 3 not 4; refund not behaving correctly *(needs more info — the 2 free specs ARE correctly at tier 3 per rules; the tier 4 free dot is ephemeral and adds no XP cost; suspect this may be about the XP breakdown not showing a PT4 credit row, or about skill_creation data entry for the free dot)*
- [x] **Professional Training** — Not picking up 3rd Asset Skill (mci.js was slicing to first 2; now all asset skills get 9-Again)
- [x] **The Taste of Things Lived** — Bloodline benefit should be 0 XP cost

### Features (3)

- [ ] **Edit Tickets** — Submitted tickets cannot have title or content edited after submission
- [ ] **Feeding Pool Alteration** — No way for STs to edit or approve DT pools in ST DT section
- [ ] **Attribute Bumps** — No way to add Mantle of Amorous Fire dots to Presence

---

## MCI Grant Mismatches
*Merits listed in `benefit_grants` that could not be automatically matched or allocated.*

### Missing merits — need to be added to the character's merits array in the editor
These merits appear in the MCI grant record but don't exist as a merit entry for the character.
Once added, re-run `node scripts/migrate-chars.js --write` to set `free_mci` automatically.

- [ ] **Charlie Ballsack** — MCI dot 5: `Stronger Than You ●●●` missing from merits
- [ ] **Eve Lockridge** — MCI dot 2: `Contacts ●` missing from merits
- [ ] **Ivana Horvat** — MCI dot 2: `Quick Reload ●` missing from merits
- [ ] **Ivana Horvat** — MCI dot 4: `Intercept Shot ●●●` missing from merits
- [ ] **Jack Fallow** — MCI dot 5: `Gettin' Up ●●●` missing from merits
- [ ] **Livia** — MCI dot 1: `Holistic Awareness ●` missing from merits (has ●●● but match failed — check category)
- [ ] **Ludica Lachramore** — MCI dot 2: `Contacts ●` missing from merits
- [ ] **Yusuf Kalusicj** — MCI dot 1: `Contacts ●` missing from merits

### Ambiguous Allies grants — two MCI dots both point to the same Allies entry
These characters have multiple Allies grants from MCI that map to the same merit entry.
Need to either split into two separate Allies merit entries (different areas), or manually set `free_mci` to the correct combined value.

- [ ] **Charles Mercer-Willows** — MCI dots 3 + 5 both target `Allies ●●●` (Occult and Media) — verify if two separate entries are needed; set `free_mci` manually
- [ ] **Yusuf Kalusicj** — MCI dots 2 + 4 both target `Allies` (Underworld ●, Finance ●●●) — verify if two separate entries are needed; set `free_mci` manually

---

## Data Entry — Missing Influence Areas
*Allies and Contacts entries with no `area` or `qualifier` set.*

- [ ] **Alice Vunder** — `Contacts ●●●` has no area
- [ ] **Carver** — `Contacts` has no area
- [ ] **Charlie Ballsack** — `Contacts` has no area
- [ ] **René St. Dominique** — `Allies ●` has no area
- [ ] **René St. Dominique** — `Contacts ●●●` has no area
- [ ] **Eve Lockridge** — `Contacts` (if added above) — set area at same time

---

## Incomplete Characters
*Characters with core identity fields missing -- cannot derive willpower conditions without these.*

- [ ] **Eve Lockridge** — `mask` and `dirge` are both null; willpower conditions empty. Set Mask + Dirge in the editor.
- [ ] **Julia** — `mask` and `dirge` are both null; willpower conditions empty. Set Mask + Dirge in the editor.

---

## Known XP Anomaly
- [ ] **Kirk Grimm** — `Intelligence` attr_creation.xp = 5 (not divisible by 4). Likely a partial refund or data entry error from Excel migration. Confirm with records and correct or document as intentional.

---

## Schema / Architecture Decisions Needed

- [ ] **Willpower stale text** — `willpower.mask_1wp / mask_all / dirge_1wp / dirge_all` is stored per-character but derived from Mask/Dirge selection. Peter confirmed it did not update when Yusuf's Dirge changed. Decision needed: strip from storage and derive at render time (preferred, matches "derive don't store" principle), or enforce a re-sync on Mask/Dirge save.

- [ ] **`"rite"` power category** — Cruac rites are stored with `category: "rite"` which is not in the schema's valid set (`discipline / devotion / pact`). Either add `"rite"` as a valid category in the schema and validator, or migrate rite entries to `category: "power"` or similar. 14 powers across multiple characters affected.

- [ ] **`merits` / `merit_creation` tech debt** — Peter flagged these as two parallel arrays that should eventually be a single unified object (merit + purchase receipt). Deferred; log here as a future refactor target.

---

## Save Hygiene (Code Fixes)

- [ ] **Ephemeral fields persisted to DB** — `_gameXP` and `_grant_pools` are runtime-computed values being written back to MongoDB on character save. Strip these server-side before persisting (in the PUT `/api/characters/:id` handler). 20 documents affected across most characters.

- [ ] **`fighting_styles[].up` legacy field** — The `up` field (old Excel import artifact) is being migrated in memory by `mci.js` on each load but never written back. Migration runs on every render, which is wasteful. Either write a one-time data migration to rename `up` → `cp` in all fighting style entries, or strip it on save. 19 entries across multiple characters.

---

## Rites — Data Entry Needed
*These characters have Cruac/Theban disciplines but no rites on their sheet. Their sorcery DT section shows "No rites on your character sheet."*

- [ ] **Alice Vunder** — Cruac 1, no rites
- [ ] **Conrad Sondergaard** — Theban 4, no rites
- [ ] **Edna Judge** — Theban 1, no rites
- [ ] **Magda** — Theban 4, no rites

---

## Post-Atlas Seed
*Run after `node server/migrate.js` imports the fixed `chars_v2.json` to Atlas.*

- [ ] Verify Yusuf's MCI section renders correctly in the admin editor (pool counter, grant display)
- [ ] Verify characters with newly appended `merit_creation` entries (Magda, Reed Justice, René StD, Tegan, etc.) show correct point breakdowns in the sheet editor
- [ ] Re-run `node scripts/validate-chars.js` against a live Atlas export to confirm no regressions
