# Downtime UI Audit — Panel & Title Chrome

**Date:** 2026-04-26
**Branch:** Morningstar
**Scope:** All `.dt-*` and `.proc-*` panel/card/section/wrap container classes in `public/css/admin-layout.css` and the title/label classes that head them.
**Source file:** `public/css/admin-layout.css` (8305 lines total)
**Method:** Read every container declaration and every nearby title declaration, capture the resolved chrome (padding / border / background / radius / overflow), then group by visual role.

This audit is **inventory only** — no edits. Findings and proposed canonical patterns at the bottom.

---

## 1. Container chrome inventory

Containers are bucketed by visual role. Each row gives `class` · `lines` · resolved chrome. Token meanings: `--surf` (page surface tier 0), `--surf1`, `--surf2`, `--surf3` (rising tiers), `--bdr` (default border), `--bdr2`/`--bdr3` (lighter borders).

### 1A · Top-level "section" panels (collapsible, header + body)

These wrap a major dashboard area. They share the same overall idea (rounded outer box, header bar in `--surf2`, body inside) but differ in radius, header padding, and whether the body has its own padding.

| Class | Lines | Background | Border | Radius | Padding | Overflow | Notes |
|-------|-------|------------|--------|--------|---------|----------|-------|
| `.dt-snapshot-panel` | 1361–1366 | (none, transparent) | `1px var(--bdr)` | **6px** | 0 (body has 12/16) | `hidden` | mb:16. `.dt-snapshot-body { padding:12px 16px }` |
| `.dt-scene-panel` | 1781–1786 | (none) | `1px var(--bdr)` | **6px** | 0 | `hidden` | mb:12. Body = `.dt-scene-table` (no padding wrapper) |
| `.dt-matrix-panel`, `.dt-conflict-panel` | 1847–1852 | (none) | `1px var(--bdr)` | **6px** | 0 | `hidden` | mb:12. Wrap = `.dt-matrix-wrap` (no padding) |
| `.dt-chk-panel` | 1922 | (none) | `1px var(--bdr)` | **4px** | 0 | `hidden` | mb:12. **Radius diverges (4 vs 6)** |
| `.dt-inv-panel` | 2144 | (none) | `1px var(--bdr)` | **6px** | 0 | `hidden` | mb:12. `.dt-inv-body { padding:10px 12px }` |
| `.proc-amb-dashboard` | 5865–5871 | `var(--surf1)` | `1px var(--bdr)` | **6px** | 0 | `hidden` | mb:16. **Adds bg `--surf1`** (others are bg-less) |
| `.proc-phase-section` | 3960–3965 | `var(--surf)` | `1px var(--bdr)` | **6px** | 0 | `hidden` | gap:24px in flex parent. Bg `--surf` |
| `.proc-attach-panel` | 5207–5213 | `var(--surf1)` | `1px var(--bdr)` | **6px** | 14px | (none) | mb:14. **Has padding directly on outer** |

**Pattern A consensus:** rounded `6px`, `1px var(--bdr)`, `overflow:hidden`, header in `--surf2`, body padding handled by inner element.
**Outliers:** `.dt-chk-panel` uses 4px radius; `.proc-attach-panel` puts padding on outer; `.proc-amb-dashboard` and `.proc-phase-section` add a background to the outer where others are transparent.

### 1B · Inline detail/section panels (rendered inside an action row)

These appear inside `.proc-action-detail` or `.dt-resp-panel`. They share the "small grouped block" idea but the chrome varies a lot.

| Class | Lines | Background | Border | Radius | Padding | Notes |
|-------|-------|------------|--------|--------|---------|-------|
| `.dt-resp-panel` | 1555–1560 | `rgba(0,0,0,0.15)` | `1px var(--bdr)` | **4px** | 10/14 | margin:8 0 12. Player Responses block |
| `.dt-proj-slot` | 2061–2066 | `var(--surf2)` | `1px var(--bdr)` | **6px** | 10/12 | mb:8. Project resolution slot |
| `.proc-feed-mod-panel`, `.proc-feed-vitae-panel`, `.proc-proj-succ-panel` | 5493–5500 | `var(--surf2)` | `1px var(--bdr)` | **6px** | 10/12 | Right-rail boxes in feeding/project layout |
| `.proc-feed-right-section` | 5648–5653 | `var(--surf2)` | `1px var(--bdr)` | **6px** | 10/12 | Same as above |
| `.proc-proj-roll-card` | 5509–5517 | `var(--surf2)` | `1px var(--bdr)` | **6px** | 10/12 | flex column gap:6 |
| `.proc-pool-builder` | 4623–4630 | `var(--surf2)` | `1px var(--bdr)` | **6px** | 10/12 | mt:8 mb:12 |
| `.proc-proj-detail` | 5686–5692 | `var(--surf1)` | `1px var(--bdr)` | **4px** | 8/10 | mb:12. **bg surf1 + radius 4** |
| `.proc-feed-info` | 5381–5390 | `var(--surf1)` | `1px var(--bdr)` | **4px** | 8/10 | mb:12. Same shape as proc-proj-detail |
| `.proc-feed-desc-card` | 5417–5423 | `var(--surf1)` | `1px var(--surf3)` | **4px** | 8/10 | mb:10. **Border `--surf3` instead of `--bdr`** |
| `.proc-acq-notes` | 4377–4386 | `var(--surf2)` | `1px var(--bdr)` | **4px** | 8/10 | Acquisition notes display (read-only-ish) |
| `.proc-narr-action-ref` | 4149–4155 | `var(--surf2)` | `1px var(--bdr)` | **4px** | 8/10 | mb:10. Narrative action reference |
| `.proc-feedback-section` | 4863–4868 | `var(--surf2)` | (none) | 4px | 8/10 | mt:4. **No border** |
| `.proc-player-note-section` | 4872–4878 | `var(--surf2)` | (none) + `border-left:3px var(--accent)` | 4px | 8/10 | mt:4. Border-left only |
| `.proc-proj-contested-panel` | 4987–4996 | `var(--surf2)` | `1px var(--bdr)` + `border-left:3px var(--crim)` | 4px | 10/12 | flex column gap:6. Crim left-stripe |
| `.proc-mismatch-flag` | 4890–4900 | `rgba(139,0,0,0.12)` | `1px var(--crim)` + `border-left:3px var(--crim)` | 4px | 5/10 | Inline alert |
| `.proc-xref-callout` | 4903–4912 | `var(--surf2)` | `1px var(--bdr)` + `border-left:3px var(--gold2)` | 4px | 8/10 | mt:8. Gold left-stripe |
| `.proc-feed-committed-pool` | 5668–5678 | `var(--surf1)` | `1px var(--bdr)` | **4px** | 6/8 | mt:10. Monospace pool readout |
| `.proc-action-detail` | 4564–4569 | `var(--surf)` | `border-bottom:1px var(--bdr)` only | 0 | 16 | The expanded-row container itself |
| `.proc-detail-value` | 4589–4596 | `var(--surf2)` | `1px var(--bdr)` | 4px | 6/10 | Read-only value display |

**Two clear sub-clusters here:**
- **6px-radius `--surf2` boxes with 10/12 padding** (the "heavy" right-rail panel) — used by feeding mod/vitae/succ, pool builder, roll card, dt-proj-slot. ~8 instances.
- **4px-radius `--surf1` (or `--surf2`) boxes with 8/10 padding** (the "light" inline info card) — used by proc-feed-info, proc-proj-detail, proc-feed-desc-card, proc-acq-notes, proc-narr-action-ref, proc-xref-callout. ~7 instances.

**Stripe-accent variants** layer a `border-left: 3px solid <token>` on top:
- `--accent` = info / action context (`.proc-player-note-section`, `.dt-proj-writeup`)
- `--gold2` = cross-reference / lock (`.proc-xref-callout`, `.dt-feeding-locked`)
- `--crim` = warning / contested (`.proc-mismatch-flag`, `.proc-proj-contested-panel`)
- `--green3`/`--result-succ` = resolved (`.dt-inv-resolved`, `.dt-sub-approved`)

The accent colour and meaning are mostly consistent; the chrome they sit on top of is not.

### 1C · "Detail" wrapper sections (no border, top-rule only)

These divide vertical space inside an expanded sub-card. All share the "top border + top padding" idiom — but each is declared independently rather than via a shared class.

| Class | Lines | Chrome |
|-------|-------|--------|
| `.dt-feed-detail` | 1636–1640 | `margin-top:10; padding-top:10; border-top:1px var(--bdr)` |
| `.dt-narr-detail` | 2099 | same |
| `.dt-mech-detail` | 2115 | same |
| `.dt-publish-panel` | 2133 | same (named `-panel` despite identical chrome) |
| `.dt-approval-detail` | 2166–2170 | same |
| `.dt-exp-panel` | 2199–2203 | same |
| `.dt-notes-detail` | 2235–2239 | same |
| `.proc-response-review-section` | 5140–5144 | same |
| `.proc-retag-row` | 5163 | same + `display:flex; gap:8` |

**This is the same chrome 9 times under 9 different class names.** Strong candidate for a shared utility class.

### 1D · Story-tab panels (DTP epic, 6603–7325)

The Player Delivery story tab uses its own family. Mostly consistent within itself but with slight divergences from the main DT panels.

| Class | Lines | Background | Border | Radius | Padding | Notes |
|-------|-------|------------|--------|--------|---------|-------|
| `.dt-story-section` | 6675–6681 | `var(--surf)` | `1px var(--bdr)` | **6px** | 0 | mb:8. Header in `--surf2`, body in `.dt-story-section-body { padding:10/12 }` |
| `.dt-story-proj-card` | 6818–6824 | `var(--surf2)` | `1px var(--bdr)` | **5px** | 10/12 | mb:10. **Radius 5px (unique)** |
| `.dt-story-merit-card` | 7113–7118 | `var(--surf)` | `1px var(--bdr2)` | **4px** | 8/10 | mb:10 |
| `.dt-story-resources-card` | 7159–7165 | `var(--surf)` | `1px var(--bdr2)` | **4px** | 8/10 | mb:8 |
| `.dt-story-context-block` | 6883–6888 | `var(--surf)` | `1px var(--bdr)` | **4px** | 8/10 | mb:8 |
| `.dt-story-sign-off` | 6752–6760 | `var(--surf2)` | `1px var(--bdr)` | **6px** | 10/14 | mt:12. flex row |
| `.dt-feeding-locked` | 6603 | `var(--surf)` | `1px var(--bdr2)` + `border-left:3px var(--gold2)` | 4px | 14/16 | Single-line inline panel |

The Story family runs **three different radius values (4 / 5 / 6) and two border tokens (`--bdr` / `--bdr2`)** for very similar visual tiers. `dt-story-merit-card` and `dt-story-resources-card` are visually identical and could share a class.

### 1E · Sub-card / list-item containers

| Class | Lines | Chrome |
|-------|-------|--------|
| `.dt-sub-card` | 1500–1505 | `var(--surf)`, `1px var(--bdr)`, radius 6, padding 10/14 — the per-submission tile |
| `.dt-inv-item` | 2151 | `1px var(--bdr)`, radius 6, padding 8/10, mb:8 — investigation entry. **No bg** |
| `.dt-early-list` | 1758 | `1px var(--bdr)`, radius 4, max-h 360, scroll — list wrapper |
| `.proc-attach-actions` | 5215–5222 | `1px var(--bdr)`, radius 4, max-h 260, scroll, bg `--surf0`/`--bg` — list wrapper |

---

## 2. Title / section-header inventory

Two roles: **panel headers** (clickable bar above a panel body) and **section titles** (label inside a panel). Both roles each have several variants.

### 2A · Collapsible panel headers (full-width clickable bar)

| Class | Lines | Padding | Bg | Font | Size / Weight | Letter-spacing | Color | Border-bottom |
|-------|-------|---------|----|------|---------------|----------------|-------|---------------|
| `.dt-snapshot-toggle` | 1367–1378 | 8/12 | `--surf2` | `--fl` | 13 / regular | (default) | `--txt2` | none |
| `.dt-scene-toggle` | 1787–1798 | 8/12 | `--surf2` | `--fl` | 13 / regular | (default) | `--txt2` | none |
| `.dt-chk-toggle` | 1923 | 8/12 | `--surf2` | `--fl` | 13 / regular | (default) | (inherits) | none |
| `.dt-matrix-toggle` | 1853–1866 | **12/16** | `--surf2` | `--fl` | **13 / 600** | (default) | **`--accent`** | `1px --bdr` |
| `.proc-phase-header` | 4059–4072 | **10/16** | `--surf2` | `--fl` | **13 / 600** | (default) | **`--accent`** | `1px --bdr` |
| `.proc-amb-header`, `.proc-disc-header` | 5873–5887 | **10/16** | `--surf2` | `--fl` | **13 / 600** | (default) | **`--accent`** | `1px --bdr` |
| `.dt-story-section-header` | 6682–6688 | 9/14 | `--surf2` | (inherits) | (label-driven) | (label-driven) | (label-driven) | `1px --bdr` |

**Two tiers exist:**
- **"Quiet"** (8/12 padding, regular weight, `--txt2` text): snapshot, scene, chk
- **"Loud"** (10–12 / 16 padding, 600 weight, `--accent` text, border-bottom): matrix, phase, amb, disc

The split is not principled — `.dt-snapshot-panel` and `.dt-matrix-panel` are visually peer-level dashboards but get different header weights.

### 2B · Section / sub-section titles (text labels inside a panel)

| Class | Lines | Font | Size / Weight | Letter-spacing | Color | Decoration |
|-------|-------|------|---------------|----------------|-------|------------|
| `.dt-panel-title` | 1563–1570 | `--fl` | 11 / regular | .06em | `--accent` | uppercase, mb:8 |
| `.proc-mod-panel-title` | 5549–5556 | `--fl` | 11 / regular | .06em | `--accent` | uppercase, mb:8 |
| `.proc-detail-section-title` | 5182–5189 | `--fl` | 11 / regular | .06em | `--txt3` | uppercase, mb:6 |
| `.proc-detail-label` | 4580–4587 | `--fl` | 11 / regular | .04em | `--txt3` | uppercase, mb:6 |
| `.dt-resp-section-title` | 1572–1582 | `--fl` | 10 / 700 | .08em | `--accent` | uppercase + border-bottom + pb:3 mb:5 |
| `.dt-conflict-section-head` | 1945 | `--fl` | 10 / 700 | .1em | `--txt3` | uppercase, padding 6/0/4 |
| `.dt-feed-header` | 1642–1649 | `--fl` | 12 / regular | .5px | `--accent` | uppercase, mb:8 |
| `.dt-prep-early-title` | 1757 | `--fl` | 12 / regular | (default) | `--accent` | **NOT uppercase**, mb:8 |
| `.dt-narr-label` | 2106 | `--fl` | 13 / 600 | (default) | `--accent` | NOT uppercase |
| `.proc-amb-title` | 5898–5903 | `--fl` | 13 / regular | .5px | `--accent` | NOT uppercase |
| `.proc-attach-char-header` | 5230–5237 | `--fl` | 11 / regular | .06em | `--accent` | uppercase, mb:4 |
| `.dt-story-section-label` | 6690–6697 | `--fl` | 12 / **700** | .07em | `--txt` | uppercase |
| `.dt-merit-summary-group-label` | 6718–6727 | `--fl` | 11 / regular | .05em | `--txt3` | uppercase, border-bottom, padding 0/14/4 |
| `.dt-lbl` | 1755 | `--fl` | 11 / regular | .08em | `--txt3` | uppercase |
| `.dt-exp-lbl` | 2215–2221 | `--fl` | 11 / regular | .05em | `--txt3` | uppercase |
| `.proc-feed-lbl` | 5398–5405 | `--fl` | 10 / regular | .05em | `--txt3` | uppercase, mr:4 |
| `.proc-char-strip-label` | 4005–4014 | `--fl` | 10 / **700** | .08em | `--txt3` | uppercase |

**Patterns observed:**
- The "uppercase Lato 10–13 with letter-spacing" idiom is everywhere. Sizes drift across **10, 11, 12, 13**; weight across **regular and 700**; letter-spacing across **.04, .05, .06, .07, .08, .1em, .5px**; colour split between **`--accent`** (primary header) and **`--txt3`** (subdued label). The combinations are not consistent — every title author picked their own.
- Two non-uppercase outliers (`.dt-prep-early-title`, `.dt-narr-label`, `.proc-amb-title`) break the convention without a clear reason.
- `.dt-resp-section-title` is the only one with a built-in border-bottom rule under it.

---

## 3. Divergence summary

The chrome system is doing the right things conceptually — there's clearly a "big collapsible panel," a "right-rail card," a "small inline info card," a "section title," and a "sub-label." But each consumer wrote its own variant. The actual divergences fall in five buckets:

1. **Border radius drift** — 4px vs 5px vs 6px on visually peer panels (`dt-chk-panel` 4, `dt-story-proj-card` 5, everything else 6).
2. **Background tier drift** — outer "section" panels are mostly transparent; some add `--surf1` (`proc-amb-dashboard`, `proc-attach-panel`); inner "right-rail" cards split between `--surf1` and `--surf2`.
3. **Border token drift** — `--bdr` vs `--bdr2` vs `--surf3` for the same visual weight (`dt-story-merit-card` and `dt-story-resources-card` use `--bdr2` where neighbouring `dt-story-section` uses `--bdr`).
4. **Header weight drift** — collapsible toggles split into a "quiet" (`--txt2`, regular) tier and a "loud" (`--accent`, 600) tier on similar dashboards.
5. **Title variant inflation** — at least 17 distinct title/label class declarations covering ~3 visual roles. Same idea, slightly different size/weight/letter-spacing each time.

The biggest single redundancy is the **"detail wrapper" pattern in §1C** — nine classes all declaring the identical `margin-top:10; padding-top:10; border-top:1px var(--bdr)` rule.

### Bucket 1C — Resolved 2026-04-26 (story CSS-8)

Nine target classes (`.dt-feed-detail`, `.dt-narr-detail`, `.dt-mech-detail`, `.dt-publish-panel`, `.dt-approval-detail`, `.dt-exp-panel`, `.dt-notes-detail`, `.proc-response-review-section`, `.proc-retag-row`) collapsed into a single grouped selector at `public/css/admin-layout.css:2092-2105`. `.proc-retag-row` retains its `display: flex; align-items: center; gap: 8px;` in its own block. No JS edits, no class renames. Net −20 LOC (8305 → 8285).

**2026-04-26 follow-up:** Audit §1C originally missed `.dt-proj-detail, .dt-merit-detail` (they were already a pre-existing grouped pair at line 2050 with byte-identical chrome and so the audit pass overlooked them as an "existing group" rather than enumerating them as individual targets). Folded into the CSS-8 grouped selector during CSS-6 execution; standalone block at line 2050 deleted. Eleven classes now share the canonical detail-wrapper rule.

### Bucket 1B — Resolved 2026-04-26 (story CSS-6)

15 inline detail panel classes (heavy cluster: `.dt-proj-slot`, `.proc-feed-mod-panel`, `.proc-feed-vitae-panel`, `.proc-proj-succ-panel`, `.proc-feed-right-section`, `.proc-proj-roll-card`, `.proc-pool-builder`; light cluster: `.proc-narr-action-ref`, `.proc-acq-notes`, `.proc-feed-info`, `.proc-feed-desc-card`, `.proc-proj-detail`; stripe-accent variants: `.proc-player-note-section`, `.proc-proj-contested-panel`, `.proc-xref-callout`) collapsed into a single grouped selector at `public/css/admin-layout.css:2049-2069` carrying `background: var(--surf2); border: 1px solid var(--bdr); border-radius: 6px; padding: 10px 12px;`. Stripe variants retain their `border-left: 3px solid <colour>` declared later in source order. `.proc-mismatch-flag` deliberately excluded as an inline alert. No JS edits, no class renames. Net −38 LOC (8282 → 8244). Visual verification pending user action (light cluster becomes darker; stripe-only `.proc-player-note-section` gains a full 1px border on the other three sides — both deliberate per the audit's canonical chrome decision).

---

## 4. Proposed canonical patterns

Two patterns to adopt as the spine of the harmonised system. The remaining variants would either map onto these or onto a small set of explicitly-named modifiers (`.dt-panel--accent-stripe`, `.dt-panel--info`, etc.).

### 4A · Canonical panel chrome — based on `.dt-proj-slot` (lines 2061–2066)

```css
/* "Card" — the dominant inline panel pattern (used ~8 times already) */
{
  background: var(--surf2);
  border: 1px solid var(--bdr);
  border-radius: 6px;
  padding: 10px 12px;
}
```

**Why this one:**
- Already the most-used shape in the file (proj-slot, feed-mod-panel, feed-vitae-panel, proj-succ-panel, feed-right-section, proj-roll-card, pool-builder).
- Sits cleanly on `--surf` page background; tier separation is obvious without being heavy.
- 6px radius is the dominant radius; standardising removes the 4/5/6 drift.
- Padding 10/12 is comfortable for both single-line and multi-line content.

For the **outer "dashboard" panels** (collapsible, header + body), the analogous canonical is `.dt-snapshot-panel` shape:

```css
/* "Section" — collapsible dashboard panel (used ~8 times already) */
{
  border: 1px solid var(--bdr);
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 12px;
}
```

with body padding owned by an explicit `*-body` child rather than the outer.

Stripe-accent variants (`.proc-xref-callout`, `.proc-player-note-section`, `.proc-proj-contested-panel`, `.dt-feeding-locked`) become modifiers that add only `border-left: 3px solid <token>` on top.

### 4B · Canonical title styles — based on `.dt-panel-title` and `.proc-detail-label`

The actual visual ladder seems to be three tiers. Codifying them:

```css
/* Tier 1 — Panel header label (accent, 11px, used as the title above a panel) */
/* Based on .dt-panel-title (1563–1570) and .proc-mod-panel-title (5549–5556) */
{
  font-family: var(--fl);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 8px;
}

/* Tier 2 — Sub-label / field label (subdued, 11px, used inline as a row label) */
/* Based on .proc-detail-label (4580–4587) */
{
  font-family: var(--fl);
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--txt3);
  margin-bottom: 6px;
}

/* Tier 3 — Micro-label (10px, the strip/group caption above a list) */
/* Based on .proc-feed-lbl (5398–5405) */
{
  font-family: var(--fl);
  font-size: 10px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--txt3);
}
```

**Why these:**
- They cover every existing usage in §2B with three sizes (11 accent, 11 subdued, 10 micro) — the seven other variants drop out.
- All Lato + uppercase, matching the existing convention.
- Letter-spacing is normalised to 0.04 / 0.05 / 0.06 (not 0.5px or .1em).
- The existing accent-header in collapsible bars (`.dt-matrix-toggle`, `.proc-phase-header`, `.proc-amb-header`) bumps to 13/600 for visual prominence — that sub-pattern stays as a header-bar variant since it serves a different role (clickable bar, not text label).

---

## 5. What the audit deliberately did not cover

- **`.dt-story-*` interaction details** (sign-off buttons, save status, revision UI) — chrome is captured; behaviour and JS bindings are out of scope here.
- **Player-side downtime form** (`public/css/player-app.css` if it has DT styles) — the brief was admin-side only.
- **Dead CSS** — `reference_css_token_system.md` already notes a planned dead-code sweep for things like the legacy gated-sections UI. This audit is structural, not janitorial.
- **Token migration checks** — every rule body already uses tokens (per the 2026-04-23 unified token audit), so this is a chrome-shape audit, not a colour audit.

---

## 6. Open questions to resolve before any CSS edits

1. Do `.dt-story-merit-card` and `.dt-story-resources-card` need to remain visually distinct, or can they share one class?
2. Are the "quiet" collapsible toggles (`.dt-snapshot-toggle`, `.dt-scene-toggle`, `.dt-chk-toggle`) intentionally less prominent than `.proc-phase-header`, or just historical?
3. Is the §1C "detail wrapper" idiom load-bearing in any place (e.g., a JS selector that targets `.dt-narr-detail` specifically), or can the nine classes collapse to one shared utility?
4. Coordination with Peter: does any of this collide with in-flight `downtime-views.js` work on his branch?
