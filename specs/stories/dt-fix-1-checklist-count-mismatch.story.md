# Story DT-Fix-1: Submission Checklist Count Mismatch

## Status: ready-for-dev

## Story

**As an** ST reviewing submission progress,
**I want** the checklist count badge ("N / M processed") to accurately reflect how many submissions have all resource and skill requests sighted,
**so that** I can trust the progress indicator without manually counting.

## Background

The submission checklist in DT Processing shows a "N / M processed" badge. Reports indicate the count does not match the number of submissions where all resource/skill request sections are fully sighted. The mismatch may stem from:

1. Resource or skill request checklist sections not being included in the `CHK_SECTIONS` array
2. `_chkState()` returning an unexpected value for resource/skill sections that causes the `allDone` check to fail
3. The `sorted` array including characters who have no submission (which would never increment `fullySighted`)

---

## Known Data Discrepancies (DT2 audit — 2026-04-15)

A manual review of the DT matrix against the submission checklist revealed the following gaps. These are real submissions that the checklist either missed or miscounted:

### Resource acquisitions — 6 submitted, only 2 checkmarked
The checklist shows 2 resource checkmarks. These correspond to the two **retainer** actions submitted in DT2. The remaining 6 resource acquisitions were not ingested:
- **Reed** — narrative-only resource, not ingested (should be)
- **Yusuf-NFC** — not ingested (should be)
- **Etsy** — ingested but details blank
- **Keeper** — not ingested
- **Eve** — not ingested
- **Ballsack** — not ingested

**Root cause hypothesis:** "Resources" checkmark is mapping to retainer submissions, not resource acquisition submissions. The two categories are conflated.

### Anichka — projects miscounted
All of Anichka's project actions have action type "no action taken", but 4 actions were actually taken. The checklist counted 0 processed for her projects.

### Eve — A4 skipped
A3 was blank; A4 was not ingested. A5 has an asset type (LGL) then "no action taken" — A5 was not ingested.

### Keeper — A5 not ingested

### Contacts — correct (no issues found)

---

## Relevant Code

**File:** `public/js/admin/downtime-views.js`
**Function:** `renderSubmissionChecklist()` (~line 7657)

```js
const CHK_SECTIONS = [
  { key: 'travel',    label: 'Travel' },
  { key: 'feeding',   label: 'Feeding' },
  { key: 'project_1', label: 'P1' },
  { key: 'project_2', label: 'P2' },
  { key: 'project_3', label: 'P3' },
  // ... more sections?
];

let fullySighted = 0;
for (const char of sorted) {
  const sub = subByCharId.get(String(char._id)) || null;
  if (!sub) continue;
  const allDone = CHK_SECTIONS.every(sec => {
    const st = _chkState(sub, sec.key);
    return st === 'empty' || st === 'sighted' || st === 'no_action' || st === 'dice_validated'
        || st === 'drafted' || st === 'confirmed';
  });
  if (allDone) fullySighted++;
}

h += `<span class="domain-count">${fullySighted} / ${sorted.length} processed</span>`;
```

**Note:** `sorted.length` includes all characters, not just those with submissions. A character with no submission always passes (`sub` is null → `continue` → not counted in `fullySighted` but still in denominator).

---

## Investigation Steps

1. **Audit `CHK_SECTIONS`** — read the full array in the file. Do resource acquisition sections appear separately from retainer sections? The audit shows retainer actions are being counted as "resources" — these may be the same key or the resource acquisition key is missing entirely.

2. **Check `_chkState()` for action type "no action taken"** — Anichka's projects all have this action type but were real actions. Confirm what `_chkState` returns for a project section where `action_type === 'no_action_taken'` — if it returns a non-terminal state the section will block the `allDone` check.

3. **Check skipped/blank action slots** — Eve A3 blank → A4 not ingested; Keeper A5 not ingested. Confirm whether blank intermediate action slots block the checklist or are treated as `empty` (acceptable).

4. **Denominator issue** — `sorted.length` includes characters without submissions. Should the denominator be `sorted.filter(c => subByCharId.has(String(c._id))).length`?

5. **Confirm denominator logic** — determine whether `sorted` should be filtered to characters with submissions before computing the count. Adjust and document the finding in completion notes.

---

## Acceptance Criteria

1. The "N / M processed" count matches the number of characters whose submissions have all sections sighted.
2. The denominator reflects only characters who have a submission for the current cycle — characters without a submission are excluded. Dev agent to confirm correct behaviour and adjust if needed.
3. Resource and skill request sections are included in the sighted check if they exist as checklist sections.
4. `_chkState()` returns a terminal state for sighted resource/skill sections.

---

## Tasks / Subtasks

- [ ] Task 1: Read full `CHK_SECTIONS` array — identify if resource/skill sections are present
- [ ] Task 2: Log `_chkState()` for a known resource submission — confirm return value
- [ ] Task 3: Determine correct denominator (chars with submissions vs. all chars)
- [ ] Task 4: Fix whichever issue is the root cause
- [ ] Task 5: Verify count matches manual count across a real cycle's submission list

---

## Dev Notes

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-views.js` | Investigate + fix `renderSubmissionChecklist` and/or `CHK_SECTIONS` |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Angelus + Bob (SM) |

## Dev Agent Record

### Agent Model Used
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_

### File List
- `public/js/admin/downtime-views.js`
