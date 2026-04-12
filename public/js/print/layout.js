/**
 * Page geometry, colours, font names.
 *
 * Target: A4 landscape matching Mammon.pdf
 *   - Mammon.pdf is A4 landscape, 2 pages
 *   - PDFKit A4 = 595.28 × 841.89 pt; with layout: 'landscape' → 841.89 × 595.28
 */

// ── Page geometry ────────────────────────────────────────────────────────────
const PAGE_W = 841.89;
const PAGE_H = 595.28;

// Content margins — the red parchment border in background.jpg eats the outer
// ~22 pt on each side. Measured against the Mammon render.
const M_LEFT   = 26;
const M_RIGHT  = 26;
const M_TOP    = 18;
const M_BOTTOM = 20;

const CW = PAGE_W - M_LEFT - M_RIGHT;   // content width
const CH = PAGE_H - M_TOP  - M_BOTTOM;  // content height

// ── Page 1 layout: two A5 portrait halves split at the fold line ────────────
// Mammon.pdf page 1 is designed to be folded down the middle at x=PAGE_W/2.
// Each half is a self-contained A5 portrait page.
//
//   Left A5  (x = M_LEFT .. PAGE_MID - 4):  three sub-columns for reference
//                                            data — disciplines + vitals,
//                                            influence/domain/standing,
//                                            humanity/mask/dirge/banes.
//   Right A5 (x = PAGE_MID + 4 .. PAGE_W - M_RIGHT):  masthead at top
//                                            (logo + name + identity fields +
//                                            covenant/clan + status diamonds),
//                                            then ATTRIBUTES and SKILLS
//                                            sections. Banners span only the
//                                            right half width, never across
//                                            the fold.
const PAGE_MID = PAGE_W / 2;
const FOLD_GAP = 4;   // visual breathing room around the fold line

const LEFT_PANEL = {
  x: M_LEFT,
  w: PAGE_MID - FOLD_GAP - M_LEFT,    // ~391
};
const RIGHT_PANEL = {
  x: PAGE_MID + FOLD_GAP,
  w: PAGE_W - M_RIGHT - PAGE_MID - FOLD_GAP,  // ~391
};

// Left panel: three sub-columns with small internal gaps
const LEFT_COL_GAP = 8;
const LEFT_COL_W = (LEFT_PANEL.w - 2 * LEFT_COL_GAP) / 3;  // ~125 each

const COL = {
  disciplines: { x: LEFT_PANEL.x,                                       w: LEFT_COL_W },
  influence:   { x: LEFT_PANEL.x + LEFT_COL_W + LEFT_COL_GAP,           w: LEFT_COL_W },
  humanity:    { x: LEFT_PANEL.x + 2 * (LEFT_COL_W + LEFT_COL_GAP),     w: LEFT_COL_W },
  masthead:    { x: RIGHT_PANEL.x, w: RIGHT_PANEL.w },
};

// ── Colours ──────────────────────────────────────────────────────────────────
const C = {
  INK:      '#2a1414',   // deep red-brown (Mammon text is not pure black)
  GREY:     '#666666',
  FAINT:    '#9a7a7a',
  BANNER_C: '#e8d8b8',   // cream text on dark banner plate
  ACCENT:   '#8b1a1a',   // red accent for dot fills and diamond backs
};

// ── Dot & square sizes ───────────────────────────────────────────────────────
// Sized to match the Mammon target at this column width. Bumped from the
// original tiny version so the page visibly uses its vertical space.
const DOT_R   = 3.0;
const DOT_GAP = 8.5;
const SQ_SIZE = 8.5;
const SQ_GAP  = 10.5;

// ── Font keys (registered by render.js) ──────────────────────────────────────
const F = {
  caslon:    'Caslon',
  goudyBold: 'GoudyBold',
  body:      'Body',
  bodyIt:    'BodyIt',
  bold:      'Bold',
  regular:   'Regular',
  italic:    'Italic',
};

// ── Canonical trait lists ────────────────────────────────────────────────────
const ALL_SKILLS = {
  Mental:   ['Academics','Computer','Crafts','Investigation','Medicine','Occult','Politics','Science'],
  Physical: ['Athletics','Brawl','Drive','Firearms','Larceny','Stealth','Survival','Weaponry'],
  Social:   ['Animal Ken','Empathy','Expression','Intimidation','Persuasion','Socialise','Streetwise','Subterfuge'],
};

const ATTR_GRID = [
  { row: 'power',      Mental: 'Intelligence', Physical: 'Strength',  Social: 'Presence' },
  { row: 'finesse',    Mental: 'Wits',         Physical: 'Dexterity', Social: 'Manipulation' },
  { row: 'resistance', Mental: 'Resolve',      Physical: 'Stamina',   Social: 'Composure' },
];

// Discipline list shown in the left column of page 1. Order matches Mammon.pdf.
const DISCIPLINE_ORDER = [
  'Animalism','Auspex','Celerity','Dominate','Majesty','Nightmare','Obfuscate',
  'Protean','Resilience','Vigour',
];

// Ritual tracks shown below disciplines on page 1.
const RITUAL_ORDER = [
  'Crúac','Theban','Creation','Destruction','Divination','Protection','Transmutation',
];

export {
  PAGE_W, PAGE_H, M_LEFT, M_RIGHT, M_TOP, M_BOTTOM, CW, CH,
  PAGE_MID, FOLD_GAP, LEFT_PANEL, RIGHT_PANEL,
  COL, C, DOT_R, DOT_GAP, SQ_SIZE, SQ_GAP, F,
  ALL_SKILLS, ATTR_GRID, DISCIPLINE_ORDER, RITUAL_ORDER,
};
