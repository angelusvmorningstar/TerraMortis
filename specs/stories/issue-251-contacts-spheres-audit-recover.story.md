# Story: Audit + Recover Contacts Spheres Truncated by #249 Bug

## Metadata
```yaml
issue: 251
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/251
branch: morningstar-issue-251-contacts-spheres-audit-recover
status: review
created: 2026-05-14
```

---

## User Story

As an ST, I want every character's Contacts spheres array to accurately reflect their full rating so that players can act on all their contact surfaces in the DT form.

---

## Background

PR #250 (issue #249) fixed a null-cache race condition in `mci.js` that was physically truncating `m.spheres` arrays on save. The bug has been patched — no further damage will occur. This story recovers already-damaged production data.

**Root cause recap:**
1. `applyDerivedMerits` (`public/js/editor/mci.js`) cleared `free_pt = 0` on every Contacts merit before applying PT rules.
2. When the rules cache was null (preload race), `applyPTRulesFromDb` no-op'd — `free_pt` stayed 0.
3. `pruneContactsSpheres` (`public/js/editor/domain.js`) computed a too-low rating (PT dots missing) and set `m.spheres.length = r`, physically deleting trailing sphere strings.
4. The next save persisted the truncated array permanently.

**Example:** Yusuf Kalusicj, Contacts 3 (1 free_mci + 2 free_pt). Bug fired → spheres collapsed from `['Legal', 'Street', 'Underworld']` to `['Legal']`.

---

## Scope

This story is **data-recovery only**. No application code changes are required. The fix is already shipped.

---

## Audit Step

Run this query against the **live `tm_suite` MongoDB** (not dev fixtures) to identify affected characters. Use the MongoDB MCP tool or a `server/scripts/` Node script.

```js
// Pseudo — adapt to actual MongoDB driver call
db.characters.find({ "merits.name": "Contacts" }).forEach(c => {
  const contacts = c.merits.find(m => m.name === 'Contacts');
  if (!contacts) return;
  const sum = (contacts.cp || 0) + (contacts.xp || 0)
            + (contacts.free_mci || 0) + (contacts.free_pt || 0)
            + (contacts.free_vm || 0) + (contacts.free_lk || 0)
            + (contacts.free_ohm || 0) + (contacts.free_inv || 0)
            + (contacts.free_mdb || 0) + (contacts.free_sw || 0)
            + (contacts.free_fwb || 0) + (contacts.free_attache || 0);
  const sphereLen = (contacts.spheres || []).length;
  if (sphereLen < sum) {
    print(`AFFECTED: ${c.name} — sum=${sum}, spheres.length=${sphereLen}, missing=${sum - sphereLen}`);
  }
});
```

**Also check for over-count / duplicate spheres** (separate data anomaly — not caused by #249 but worth fixing):

```js
db.characters.find({ "merits.name": "Contacts" }).forEach(c => {
  const contacts = c.merits.find(m => m.name === 'Contacts');
  if (!contacts) return;
  const spheres = contacts.spheres || [];
  const unique = new Set(spheres);
  if (unique.size < spheres.length) {
    print(`DUPLICATES: ${c.name} — spheres=${JSON.stringify(spheres)}`);
  }
});
```

---

## Known Issues in Dev Fixtures

Running the audit against `data/dev-fixtures/characters.json` reveals two pre-existing anomalies. These are **fixtures**, not production — but worth noting:

| Character | Issue | Detail |
|-----------|-------|--------|
| Reed Justice | Missing sphere | sum=1, spheres=[] — 1 sphere slot unset |
| Xavier Boussade | Duplicate + overcounted | spheres has 5 entries for a sum-3 rating; includes duplicate "Police" |

These may or may not reflect production state. The production audit (above) is the authoritative check.

---

## Recovery Process

For each affected character identified in the production audit:

### Step 1 — Confirm missing spheres
- The audit tells you **how many** are missing, not **which** ones.
- Check with the player or ST notes on what spheres they originally held.
- For Yusuf Kalusicj specifically: restore `Street` and `Underworld` (per dev-fixture canonical).

### Step 2 — Re-add via admin sheet
1. Open `admin.html` → Player domain → open character sheet.
2. Scroll to **Influence merits** → **Contacts** block.
3. Each sphere dot renders a `<select class="contacts-sphere-sel">` dropdown (one per dot).
4. Set the missing sphere(s) via the dropdown(s).
5. Save. The handler is `shEditContactSphere(meritIdx, dotIdx, sphere)` in `public/js/editor/edit-domain.js:56` — it sets `m.spheres[dotIdx] = sphere` and marks dirty.

### Step 3 — Fix duplicates (Xavier-type anomaly)
- If a character has `spheres.length > sum`: remove extras by setting trailing dot dropdowns to blank (`— sphere —`), or via a direct MongoDB patch.
- For Xavier: trim to 3 spheres and deduplicate "Police".

### Step 4 — Verify
- After save, re-run the audit query — character should no longer appear.
- Open their DT form and confirm the expected number of contact-action rows appear.

---

## Optional: Recovery Script

If the cohort is large (3+ characters), a one-shot Node script is faster than manual admin UI:

```js
// server/scripts/recover-contacts-spheres.js
// Usage: node recover-contacts-spheres.js
// Edit RECOVERIES array with confirmed sphere choices before running.
import { connectDb, getDb } from '../db.js';

const RECOVERIES = [
  // { characterName: 'Yusuf Kalusicj', spheres: ['Legal', 'Street', 'Underworld'] },
  // Add more after player confirmation
];

await connectDb();
const db = getDb();
for (const { characterName, spheres } of RECOVERIES) {
  const c = await db.collection('characters').findOne({ name: characterName });
  if (!c) { console.log(`NOT FOUND: ${characterName}`); continue; }
  const contacts = c.merits.find(m => m.name === 'Contacts');
  if (!contacts) { console.log(`NO CONTACTS: ${characterName}`); continue; }
  const meritsIdx = c.merits.indexOf(contacts);
  const merits = [...c.merits];
  merits[meritsIdx] = { ...contacts, spheres };
  await db.collection('characters').updateOne({ _id: c._id }, { $set: { merits } });
  console.log(`RECOVERED: ${characterName} → ${JSON.stringify(spheres)}`);
}
process.exit(0);
```

Only build this after the audit reveals cohort size. If it is 1-2 characters, the admin UI is faster.

---

## Acceptance Criteria

- [x] T1: Audit query run against production `tm_suite.characters` — output documented
- [x] T2: All characters where `spheres.length < sum` have been recovered (spheres re-confirmed with player/ST, then re-added)
- [x] T3: Audit query re-run confirms zero affected characters remain
- [x] T4: For each recovered character, their DT form shows the correct number of contact-action rows — Jelle Dunneweld is retired; DT form verification waived
- [x] T5: Xavier Boussade duplicate "Police" sphere resolved (if present in production) — N/A, clean in production
- [x] T6: Reed Justice missing sphere confirmed and added (if present in production) — N/A, clean in production

---

## Key Files (reference only — no code changes needed)

| File | Relevance |
|------|-----------|
| `public/js/editor/sheet.js:833` | Contacts dot-row renderer — sphere select dropdowns |
| `public/js/editor/edit-domain.js:56` | `shEditContactSphere` handler — sets `m.spheres[dotIdx]` |
| `public/js/editor/mci.js` | `applyDerivedMerits` — bug origin (fixed in PR #250) |
| `public/js/editor/domain.js` | `pruneContactsSpheres` — truncation site (fixed in PR #250) |
| `data/dev-fixtures/characters.json` | Yusuf canonical reference |
| `server/scripts/` | Location for optional recovery script if needed |

---

## Dev Notes

- **No application code changes needed.** The fix shipped with PR #250.
- **Do not use dev fixtures as a proxy for production state.** Query live MongoDB.
- **Player confirmation required** for sphere choices before any write. Angelus confirms with each player or uses ST notes.
- The `shEditContactSphere` handler does not call `pruneContactsSpheres` — safe to re-add spheres via UI; no re-truncation risk post-fix.
- If building the recovery script, run against `tm_suite` (live), never against `tm_suite_test`.
