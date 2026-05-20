# Story fix.55: DT form — rename acquisition subsections for clarity

**Story ID:** fix.55
**Epic:** Fixes
**Issue:** 346
**Issue URL:** https://github.com/angelusvmorningstar/TerraMortis/issues/346
**Branch:** ms/issue-346-dt-form-rename-acquisition
**Status:** review
**Date:** 2026-05-18

---

## User Story

As a player filling in the downtime form, I want the Acquisitions section to clearly describe what each subsection is for, so that I do not confuse "Skill Acquisitions" with spending XP on skills or "Resources Acquisitions" with generic resources spending.

---

## Background

The Acquisitions section has two subsections:

- **Resources** — spend Resources merit dots to purchase assets (gear, property, items).
- **Skills** — use a skill roll to *make, create, or directly obtain* a physical asset.

Players have been reading "Skill Acquisitions" as "spending XP to buy a new skill dot." The heading is ambiguous enough that the confusion is understandable. No explainer text exists beneath either heading to clarify purpose.

The fix is purely cosmetic: three string literals changed and one explainer `<p>` inserted. No form fields, save keys, or submission structure change.

---

## Acceptance Criteria

- [ ] Main collapse header no longer reads "Resources and Skills" in a way that implies XP skill purchases — update to "Asset Acquisitions" (or "Acquisitions" if that fits better in context)
- [ ] Resources subtitle renamed from "Resources Acquisitions" → "Resource-Based Asset Acquisition"
- [ ] Skill subtitle renamed from "Skill Acquisitions" → "Skill-Based Asset Acquisition"
- [ ] A short explainer `<p>` appears directly beneath the skill subtitle, e.g.: *"Use this section if you are using a skill to make, create, or directly obtain an asset or piece of equipment."*
- [ ] No functional changes: form fields, `data-section-key`, save keys (`acq_skill_rows`, `acq_resource_rows`, mirror keys `skill_acq_*`), and submission shape are all unchanged

---

## Implementation

Single function to edit: `renderAcquisitionsSection()` in `public/js/tabs/downtime-form.js`.

### Change 1 — Main section header (line 4757)

```js
// CURRENT:
h += '<h4 class="qf-section-title">Acquisition: Resources and Skills<span class="qf-section-tick">✔</span></h4>';
// CHANGE TO:
h += '<h4 class="qf-section-title">Asset Acquisitions<span class="qf-section-tick">✔</span></h4>';
```

### Change 2 — Resources subtitle (line 4762)

```js
// CURRENT:
h += '<h5 class="dt-acq-subtitle">Resources Acquisitions</h5>';
// CHANGE TO:
h += '<h5 class="dt-acq-subtitle">Resource-Based Asset Acquisition</h5>';
```

### Change 3 — Skill subtitle + explainer (line 4786)

```js
// CURRENT:
h += '<h5 class="dt-acq-subtitle">Skill Acquisitions</h5>';
// CHANGE TO:
h += '<h5 class="dt-acq-subtitle">Skill-Based Asset Acquisition</h5>';
h += '<p class="qf-section-intro">Use this section if you are using a skill to make, create, or directly obtain an asset or piece of equipment.</p>';
```

The `qf-section-intro` class is already in use on other sections (e.g. Equipment) and renders as a muted italic paragraph — no new CSS needed.

---

## What Must Not Change

- `data-section-key="acquisitions"` on the wrapper div — save/restore logic keys off this.
- `data-acq-subtable="resource"` and `data-acq-subtable="skill"` — JS event delegation uses these.
- All field-level `name`/`data-*` attributes inside `_renderResourceRow` and `_renderSkillRow` — submission shape is unchanged.
- The existing comment block at lines 4773–4784 (Issue #187 rationale for single-row skill section) — leave in place.

---

## Verification

1. Open the DT form for any character.
2. Expand the Acquisitions section — header reads "Asset Acquisitions".
3. Resources block heading reads "Resource-Based Asset Acquisition".
4. Skill block heading reads "Skill-Based Asset Acquisition" with explainer text below.
5. Fill in both subsections, save, reload — data round-trips correctly (no key changes = no regression).

---

## Dev Agent Record

**Implemented:** 2026-05-18

Three string literals changed and one `<p class="qf-section-intro">` inserted in `renderAcquisitionsSection()`. No functional changes — all `data-*` attributes, save keys, and field structure preserved. `qf-section-intro` class reused from existing CSS (no new styles needed).

**Files modified:**
- `public/js/tabs/downtime-form.js` — lines 4757, 4762, 4786–4787

**All ACs satisfied.** Verify manually in-browser by opening the DT form and expanding the Acquisitions section.

---

## Scope Notes

- **In scope**: Three string literals and one inserted `<p>` inside `renderAcquisitionsSection()` only.
- **Out of scope**: ST processing panel, story-tab display, any other rendering of acquisition data.
