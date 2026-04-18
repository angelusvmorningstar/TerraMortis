# Story feat.18: Court Office Tab

**Story ID:** feat.18
**Epic:** Feature Backlog
**Status:** review
**Date:** 2026-04-18

---

## User Story

As a character who holds a court office, I want an Office tab in the game app player view that shows me my office's Status Power rules, manoeuvres, and granted merits, so I can reference my court powers during a session without needing a physical card.

---

## Background

### Character fields

Characters already carry `court_category` and `court_title` in MongoDB (added by the court-title migration). These are the gate condition for showing the tab:

```js
char.court_category  // 'Head of State' | 'Primogen' | 'Socialite' | 'Enforcer' | 'Administrator' | null
char.court_title     // 'Premier' | 'Primogen' | 'Harpy' | 'Protector' | ... free text
```

The Office tab is **only visible** when `char.court_category` is set (non-null, non-empty string). Pattern follows the Regency tab: button hidden by default in HTML, shown/hidden in `selectCharacter`.

### Tab pattern (Regency as the model)

`player.html` line 52: `<button ... id="tab-btn-regency" style="display:none">Regency</button>`

`player.js` lines 272–278:
```js
const regBtn = document.getElementById('tab-btn-regency');
if (regInfo) {
  if (regBtn) regBtn.style.display = '';
  renderRegencyTab(...);
} else {
  if (regBtn) regBtn.style.display = 'none';
}
```

The Office tab uses the same pattern, gated on `char.court_category`.

### Static office data — source of truth

Data comes from `Terra Mortis Offices.xlsx` (verified 2026-04-18). Bake into a JS module `public/js/player/office-data.js`. Keyed by `court_category`.

**Head of State**
- Title used: Premier (court_title)
- Asset: Government House
- Merits: Safe Place, Haven, Staff, Resources, Government House
- Office Style: First Among Equals
- Manoeuvres (5, each costs 1 Influence):
  1. Due Diligence — Spend 1 Influence to learn the number of Doors for a target.
  2. Call in a Favour — Spend 1 Influence instead of 1 Willpower to add +3 to a social contest.
  3. Open Door Policy — Spend 1 Influence to remove a Door. May only be used once per instance of Social Manoeuvring.
  4. Willing Coalition — Spend 1 Influence to add Clan Status to Covenant Status or vice versa for a relevant social contest.
  5. Executive Order — Spend 1 Influence to declare a ruling or pronouncement. The target chooses between compliance or a Condition of the Storyteller's choice.
- Status Power: "Each session, you can raise or lower another's City Status by 1. You can do this a number of times per session equal to your own Effective City Status. You cannot raise or lower the same character more than once per session (but you can coordinate with your Socialite or other Court roles to stack changes). You can strip a character's last dot of City Status, casting them out of the domain. You can grant the first dot of City Status to newcomers at no cost. Your decisions should be grounded in the City Deeds. If you can't justify a Status change, others will be justified in dropping yours."

**Primogen**
- Title used: Primogen (court_title)
- Asset: Chains of Office
- Merits: Contacts, Closed Book, Staff, Retainer, Chains of Office
- Office Style: Balance of Power
- Manoeuvres (5, each costs 1 Influence):
  1. Neighbourhood Watch — Spend 1 Influence to learn the Clan and Covenant status of another Kindred at Court.
  2. Freedom of Information — Spend 1 Influence to have a look at the Position sheet of any one Position in play.
  3. Show of Hands — Spend 1 Influence to have a peek in a bidding box.
  4. Pull Rank — Spend 1 Influence to add +1 to your City Status for one interaction.
  5. Veto — Spend 1 Influence to block a manoeuvre from any Position, provided they have less City Status than you.
- Status Power: "Each session, you can raise or lower another character's City Status by 1, once. You may permanently sacrifice one of your own City Status dots to make a second Status change in the same session. You cannot affect your own City Status. Your decisions should be grounded in the City Deeds. If you can't justify a Status change, others will be justified in dropping yours."

**Socialite**
- Title used: Harpy (court_title)
- Asset: Elan
- Merits: Cacophony Savvy, Fame (Kindred), Contacts, Staff (Sycophants), Elan
- Office Style: Elan
- Manoeuvres (5, each costs 1 Influence):
  1. Size Them Up — Spend 1 Influence to learn the rating of one named Status type (Kindred or mortal) for a Kindred you can see.
  2. Faux Pas — Spend 1 Influence to reroll a failed Social roll. This cannot be used on contested rolls.
  3. Saving Face — Spend 1 Influence to learn the Mask of a Kindred you can see.
  4. Playing Favourites — Spend 1 Influence to improve your initial impression by one step for the duration of that Social Manoeuvring. If activated on a new target before the last is resolved, the original's impression drops by two steps.
  5. Curry Favour — Once per game, spend 1 Influence to publicly impose the Leveraged Condition on a Kindred you can see.
- Status Power: "Each session, you can raise or lower another character's City Status by 1. You can do this a number of times per session equal to your own Effective City Status. You cannot affect your own City Status, and you cannot hold another major court position simultaneously. Your decisions should be grounded in the City Deeds. If you can't justify a Status change, others will be justified in dropping yours."

**Enforcer**
- Title used: Protector (court_title)
- Asset: Task Force
- Merits: Safe Place, Retainer (Hound), Closed Book
- Office Style: Goon Squad
- Manoeuvres (5, each costs 1 Influence):
  1. Perimeter — During Downtime, spend 1 Influence and choose 1 territory, then learn if it gets intruded upon.
  2. Ear to the Ground — During Downtime, spend 1 Influence to gain information from one Sphere.
  3. Stakeout — During Downtime, spend 1 Influence to learn what Disciplines or powers of the blood are used in a territory.
  4. Crackdown — During Downtime, spend 1 Influence and your attempts to interfere with any Downtime actions gain 8-Again.
  5. Neighbourhood Watch — Spend 1 Influence to learn the Clan and Covenant status of another Kindred at Court.
- Status Power: "Each session, you can lower another character's City Status by 1 when they breach what you are charged to enforce. Your enforcement must conform to the norms of court. If you overstep, others will be justified in dropping your own City Status."

**Administrator** — Not defined in source data. Render a placeholder: "Office details for this role are pending." (No merits or manoeuvres listed.)

---

## Tasks

### Task 1 — Create `public/js/player/office-data.js` [x]

Static data module. Export a single object `OFFICE_DATA` keyed by `court_category` string:

```js
export const OFFICE_DATA = {
  'Head of State': { asset, merits[], style, manoeuvres[{name, effect}], statusPower },
  'Primogen':      { ... },
  'Socialite':     { ... },
  'Enforcer':      { ... },
};
```

Use the full data from the Background section above. Merits are plain string arrays. Each manoeuvre is `{ name: string, effect: string }`.

### Task 2 — Create `public/js/player/office-tab.js` [x]

Export `renderOfficeTab(el, char)`. If `!el || !char` render a placeholder. If `!char.court_category` render "No office held."

Structure:
1. Look up `OFFICE_DATA[char.court_category]`. If not found (Administrator or unknown), render a "pending" notice under a header showing the title.
2. Render three sections in order:
   - **Status Power** (most prominent — full rule text in a card)
   - **Manoeuvres** (list of 5, each showing name + effect)
   - **Merits** (simple list of granted merit names)

Header should show: `court_title` (large) and `court_category` role label (small subtitle).

### Task 3 — Wire into `player.html` and `player.js` [x]

**`player.html`** — add button after the Regency button (line 52), hidden by default:
```html
<button class="sidebar-btn" data-tab="office" id="tab-btn-office" style="display:none">Office</button>
```

Add panel after the regency panel (line 87):
```html
<section id="tab-office" class="tab-panel">
  <div id="office-content"></div>
</section>
```

**`player.js`** — import and wire in `selectCharacter`:
```js
import { renderOfficeTab } from './player/office-tab.js';
```

In `selectCharacter`, after the regency block:
```js
const offBtn = document.getElementById('tab-btn-office');
if (char.court_category) {
  if (offBtn) offBtn.style.display = '';
  renderOfficeTab(document.getElementById('office-content'), activeChar);
} else {
  if (offBtn) offBtn.style.display = 'none';
}
```

### Task 4 — CSS in `player-layout.css` [x]

Add styles for the office tab. Use existing parchment token patterns (same file):

```css
.office-tab { padding: 20px; max-width: 680px; }
.office-header { margin-bottom: 20px; }
.office-title { font-family: var(--fh); font-size: 22px; color: var(--gold); letter-spacing: .06em; }
.office-role  { font-family: var(--fl); font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: var(--txt2); margin-top: 2px; }

.office-section { margin-bottom: 24px; }
.office-section-hd { font-family: var(--fl); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--gold2); border-bottom: 1px solid var(--bdr); padding-bottom: 4px; margin-bottom: 12px; }

.office-status-power { font-family: var(--fb); font-size: 14px; color: var(--txt); line-height: 1.7; padding: 14px 16px; background: rgba(224,196,122,.06); border: 1px solid var(--gold2); border-radius: 6px; }

.office-manoeuvre-list { display: flex; flex-direction: column; gap: 10px; }
.office-manoeuvre { padding: 10px 14px; background: var(--surf2); border-radius: 5px; }
.office-manoeuvre-name { font-family: var(--fl); font-size: 13px; color: var(--accent); letter-spacing: .04em; margin-bottom: 4px; }
.office-manoeuvre-effect { font-family: var(--fb); font-size: 13px; color: var(--txt2); line-height: 1.5; }

.office-merit-list { display: flex; flex-wrap: wrap; gap: 6px; }
.office-merit-chip { font-family: var(--fl); font-size: 12px; color: var(--txt2); background: var(--surf2); border: 1px solid var(--bdr); border-radius: 4px; padding: 3px 8px; }
```

---

## Acceptance Criteria

- [ ] Office tab button is hidden for characters with no `court_category`
- [ ] Office tab button is visible for characters with `court_category` set
- [ ] Status Power section renders the full rule text for Head of State, Primogen, Socialite, and Enforcer
- [ ] Manoeuvres section renders all 5 manoeuvres with name and effect for each office type
- [ ] Merits section renders the granted merit names for each office type
- [ ] Administrator (or unknown `court_category`) renders a "pending" notice without error
- [ ] Tab uses `char.court_title` as the heading (e.g., "Harpy", "Premier") with `court_category` as subtitle
- [ ] No regression to other tabs or the regency conditional pattern

---

## Files to Change

| File | Change |
|---|---|
| `public/js/player/office-data.js` | New — static office data module |
| `public/js/player/office-tab.js` | New — render function |
| `public/js/player.js` | Import + wire in `selectCharacter`; show/hide `#tab-btn-office` |
| `public/player.html` | Add sidebar button + tab panel |
| `public/css/player-layout.css` | Add `.office-*` CSS classes |

## Change Log

| Date | Change |
|---|---|
| 2026-04-18 | feat.18 implemented — office-data.js, office-tab.js, player.html/js wiring, CSS |

**Do not touch:**
- Regency tab logic — use as a read-only pattern reference only
- Character schema or API — `court_category` and `court_title` already exist and are populated

---

## Critical Constraints

- **CSS font vars**: `var(--fh)` = Cinzel (headings), `var(--fb)` = Lora (body), `var(--fl)` = Lato (UI labels). Check `player-layout.css` `:root` block to confirm these var names are correct before using — fallback to inline `font-family: 'Cinzel', serif` etc. if the vars don't exist.
- **No API calls** — this tab is purely static. `office-data.js` is a plain ES module with no imports from `api.js`.
- **Visibility gate** is `char.court_category` — truthy check only. Do not check `court_title`.
- **`char.court_category` case-sensitive** — must match the keys in `OFFICE_DATA` exactly: `'Head of State'`, `'Primogen'`, `'Socialite'`, `'Enforcer'`.
- The **Regency tab** uses `renderRegencyTab(el, char, _territories)` — the Office tab does NOT need territories; signature is just `(el, char)`.

---

## Reference

| Item | Location |
|---|---|
| Regency tab pattern | `public/js/player.js` lines 272–278 |
| Regency button in HTML | `public/player.html` line 52 |
| `court_category` schema | `server/schemas/character.schema.js` lines 74–77 |
| `selectCharacter` function | `public/js/player.js` line 256 |
| CSS token root block | `public/css/player-layout.css` `:root` |
| Source data | `Terra Mortis Offices.xlsx` — `Office Data` sheet |

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None.

### Completion Notes List

- Created `public/js/player/office-data.js` — static OFFICE_DATA keyed by court_category with all 4 office types (Head of State, Primogen, Socialite, Enforcer). Administrator intentionally omitted; falls through to pending notice.
- Created `public/js/player/office-tab.js` — renderOfficeTab(el, char) with null guards, Status Power card, Manoeuvres list, Merits chips.
- Wired `player.html`: Office button after Regency button (hidden by default); office panel after regency panel.
- Wired `player.js`: import + show/hide gate on char.court_category in selectCharacter, after regency block. Exact Regency pattern followed.
- Added `.office-*` CSS classes to player-layout.css (end of file). Font vars --fh/--fl/--fb confirmed from theme.css.

### File List
