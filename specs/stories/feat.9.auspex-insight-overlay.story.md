# Story: Auspex Insight Overlay

**Story ID:** feat.9
**Epic:** Feature Backlog
**Status:** ready-for-dev
**Date:** 2026-04-18

---

## User Story

As a player with Auspex in the game app, I want to tap an "Auspex Insight" option inside my Auspex discipline drawer so I can quickly reference which questions I'm entitled to ask at my dot rating during a live scene.

---

## Background & Design

### Data source

The Auspex Insight questions come from `Auspex Errata.docx` (TM house rules). They are **immutable reference data** — baked into a JS constant, not stored in MongoDB. No API call required.

Three tiers, cumulative by dot rating:
- Tier 1 — Auspex ● (6 questions)
- Tier 2 — Auspex ●● (12 questions, adds to Tier 1)
- Tier 3 — Auspex ●●● (9 questions, adds to Tiers 1–2)
- Auspex ●●●● and ●●●●● still see all three tiers (Lay Open the Mind / Astral Projection don't add Insight questions)

### Where the trigger lives

The Auspex discipline drawer in the game app Sheets tab already renders per-discipline power lists inside `.disc-drawer` elements. The "Auspex Insight" button sits at the bottom of that drawer — contextually placed where the player already looks to review their power.

### Overlay infrastructure

The game app has an existing `#panel-overlay` bottom sheet used for character and discipline selection (`openPanel('char')`, `openPanel('disc')`). This story adds `openPanel('auspex')` as a third mode — no new DOM infrastructure needed.

`openPanel` is already exposed on `window` (via `app.js` line 653), so the drawer button can call it directly via `onclick`.

### Character state

When the Auspex drawer is visible, `suiteState.sheetChar` is guaranteed to be set (the sheet only renders when a character is open). `openPanel('auspex')` reads `suiteState.sheetChar.disciplines.Auspex.dots` to determine which tiers to show.

---

## Implementation Plan

### Task 1 — Auspex questions data constant

**Create `public/js/data/auspex-insight.js`:**

```js
export const AUSPEX_QUESTIONS = {
  1: [
    { q: 'Are you preparing to fight?',                                           fmt: 'Yes / No' },
    { q: 'Are you in frenzy or on the verge of frenzy?',                          fmt: 'Yes / No + Hunger / Fear / Rage' },
    { q: 'Are you genuinely afraid right now?',                                   fmt: 'Yes / No' },
    { q: 'Are you concealing an injury or physical impairment?',                  fmt: 'Yes / No' },
    { q: 'Are you lying about something significant in this conversation?',       fmt: 'Yes / No' },
    { q: 'Is a vampire here using Twilight Projection?',                          fmt: 'Ask an ST' },
  ],
  2: [
    { q: 'What is your mood right now?',                                          fmt: '~1–3 words' },
    { q: 'Who or what are you most afraid of in this moment?',                    fmt: 'Name or ~1–3 words' },
    { q: 'What is your Mask?',                                                    fmt: 'Title of Mask' },
    { q: 'Have you committed diablerie in the past two months?',                  fmt: 'Yes / No' },
    { q: 'Are you being supernaturally compelled or under duress?',               fmt: 'Yes / No' },
    { q: 'Are you a supernatural creature, and if so, what kind?',                fmt: 'Yes / No + Species' },
    { q: 'Who in this room do you most want to hurt?',                            fmt: 'Name' },
    { q: 'Do you have any additional banes?',                                     fmt: 'Yes / No + Number' },
    { q: 'Who or what are you most focused on tonight?',                          fmt: 'Name or ~1–3 words' },
    { q: 'Do you intend to act against me specifically before the night is over?',fmt: 'Yes / No' },
    { q: 'What emotion are you most trying to hide right now?',                   fmt: '~1–3 words' },
    { q: 'What objects are you hiding on your person?',                           fmt: 'Yes / No + List' },
  ],
  3: [
    { q: 'Who last touched or owned this object?',                                fmt: 'Name or ~1–3 words' },
    { q: 'What is the strongest emotion associated with this object or place?',   fmt: '~1–3 words' },
    { q: 'What was this object or place being used for at the moment of strongest emotion?', fmt: '~1–3 words' },
    { q: 'Has violence occurred here, and if so, what kind?',                     fmt: '~1–3 words' },
    { q: 'What Discipline or power was last used here or near this object?',      fmt: 'Specific power name' },
    { q: 'Was this object present during a diablerie, or was diablerie performed in this location?', fmt: 'Yes / No' },
    { q: 'Who was the last person to die here, and how?',                         fmt: 'Yes / No + short sentence' },
    { q: 'Is an object or creature here being kept secret?',                      fmt: 'Yes / No + ~1–3 words' },
    { q: 'What was the most recent significant event here?',                      fmt: 'Short sentence' },
  ],
};
```

### Task 2 — Auspex Insight button in the discipline drawer

In `public/js/suite/sheet.js`, find where `drawerHtml` is built for each discipline (around line 307–330, inside the `buildDiscRow` lambda or equivalent). After the power entries are added, append the Insight button when the discipline is Auspex:

```js
if (d === 'Auspex' && r >= 1) {
  drawerHtml += `<button class="auspex-insight-btn" onclick="openPanel('auspex')">Auspex Insight ›</button>`;
}
```

This sits inside `.disc-drawer`, rendered only when the player taps to expand Auspex. The `onclick` calls `openPanel` which is already on `window`.

### Task 3 — `'auspex'` mode in `openPanel`

In `public/js/app.js`:

**Add import** near the top with other data imports:
```js
import { AUSPEX_QUESTIONS } from './data/auspex-insight.js';
```

**Add `'auspex'` branch** inside `openPanel()` after the `'disc'` block:

```js
} else if (mode === 'auspex') {
  title.textContent = 'Auspex Insight';
  const c = suiteState.sheetChar;
  const dots = c?.disciplines?.Auspex?.dots || 0;
  if (!dots) {
    body.innerHTML = '<div class="hempty" style="padding:24px 16px;">No Auspex rating detected.</div>';
    document.getElementById('panel-overlay').classList.add('on');
    requestAnimationFrame(() => { document.getElementById('panel').style.transform = 'translateY(0)'; });
    return;
  }
  let html = '';
  const maxTier = Math.min(dots, 3);
  for (let tier = 1; tier <= maxTier; tier++) {
    html += `<div class="panel-section">Tier ${tier} — Auspex ${'●'.repeat(tier)}</div>`;
    AUSPEX_QUESTIONS[tier].forEach(({ q, fmt }) => {
      html += `<div class="auspex-q-item">
        <div class="auspex-q-text">${q}</div>
        <div class="auspex-q-fmt">${fmt}</div>
      </div>`;
    });
  }
  body.innerHTML = html;
}
```

Then open the panel (add after the `if/else if` block, same as existing usage):

```js
document.getElementById('panel-overlay').classList.add('on');
requestAnimationFrame(() => {
  document.getElementById('panel').style.transform = 'translateY(0)';
});
```

**Note:** Check how existing `openPanel` modes handle the overlay open — replicate the same pattern exactly. Do not duplicate the open logic; move it to after the if/else block if it isn't already shared.

### Task 4 — CSS

In `public/css/suite.css`, under the `SHEET TAB` or `PICKER PANEL` section:

```css
/* ── Auspex Insight ── */
.auspex-insight-btn{display:block;width:100%;margin-top:10px;padding:10px 14px;background:var(--gold-a8);border:1px solid var(--gold-a20);border-radius:6px;color:var(--gold);font-family:var(--fh);font-size:12px;letter-spacing:.1em;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent;}
.auspex-insight-btn:active{background:var(--gold-a15);}
.auspex-q-item{padding:10px 16px;border-bottom:0.5px solid var(--bdr);display:flex;flex-direction:column;gap:3px;}
.auspex-q-item:last-child{border-bottom:none;}
.auspex-q-text{font-family:var(--fb);font-size:13px;color:var(--txt);line-height:1.4;}
.auspex-q-fmt{font-family:var(--fh);font-size:10px;letter-spacing:.08em;color:var(--gold);text-transform:uppercase;}
```

---

## Acceptance Criteria

- [ ] A character with Auspex ● sees an "Auspex Insight ›" button at the bottom of their Auspex discipline drawer
- [ ] Characters without Auspex (or with 0 dots) do not see the button
- [ ] Tapping the button opens the existing `#panel-overlay` bottom sheet
- [ ] Auspex ● shows Tier 1 questions only (6 questions)
- [ ] Auspex ●● shows Tier 1 + Tier 2 questions (18 questions total)
- [ ] Auspex ●●● shows all three tiers (27 questions total)
- [ ] Auspex ●●●● and ●●●●● show the same as ●●● (no additional questions)
- [ ] Each question shows its answer format beneath it
- [ ] The panel closes on backdrop tap (existing `overlayClick` handler — no change needed)
- [ ] No regression to existing `openPanel('char')` or `openPanel('disc')` modes

---

## Files to Change

| File | Change |
|---|---|
| `public/js/data/auspex-insight.js` | **New file** — question data constant |
| `public/js/suite/sheet.js` | Add Auspex Insight button to Auspex discipline drawer |
| `public/js/app.js` | Import `AUSPEX_QUESTIONS`; add `'auspex'` mode to `openPanel` |
| `public/css/suite.css` | Add `.auspex-insight-btn`, `.auspex-q-item`, `.auspex-q-text`, `.auspex-q-fmt` |

---

## Critical Constraints

- **No new DOM overlay** — reuse `#panel-overlay` / `#panel` / `#panel-body` exactly as existing modes do.
- **Data is immutable** — questions live in the JS constant only. No MongoDB, no API call.
- **Game app only** — `suiteRenderSheet` / `suite/sheet.js` only. Do not touch `editor/sheet.js` or `player.html`.
- **`suiteState.sheetChar` is the source** for Auspex dots — not `editorState`.
- **Tiers are cumulative** — showing Tier 2 always includes Tier 1 above it.

---

## Reference

- Source document: `Auspex Errata.docx` (project root)
- Discipline data: `c.disciplines.Auspex.dots` (integer, 0–5)
- Panel infrastructure: `openPanel()` in `public/js/app.js` ~line 382
- Panel DOM: `#panel-overlay`, `#panel`, `#panel-body`, `#panel-title` in `public/index.html`
- Discipline drawer: `public/js/suite/sheet.js` ~line 304–335
- CSS panel patterns: `.panel-section`, `.panel-item` in `public/css/suite.css`
