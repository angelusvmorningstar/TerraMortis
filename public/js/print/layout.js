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

// ── Page 1 columns (measured from mammon-1.png) ──────────────────────────────
// The page is divided into four main zones. Values are x-offsets and widths
// in PDF points. Fine-tuned during page 1 render iteration.
const COL = {
  disciplines: { x: M_LEFT,           w: 130 },  // Animalism…Transmutation, then rituals
  influence:   { x: M_LEFT + 138,     w: 135 },  // Influence/Kindred Status/Domain/Standing
  humanity:    { x: M_LEFT + 282,     w: 150 },  // Humanity ladder + Mask/Dirge/Banes
  masthead:    { x: M_LEFT + 442,     w: PAGE_W - M_RIGHT - (M_LEFT + 442) },
  // Attributes + Skills live inside the masthead column width, below the
  // identity block.
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
const DOT_R   = 2.6;
const DOT_GAP = 7.5;
const SQ_SIZE = 7.0;
const SQ_GAP  = 8.5;

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
  COL, C, DOT_R, DOT_GAP, SQ_SIZE, SQ_GAP, F,
  ALL_SKILLS, ATTR_GRID, DISCIPLINE_ORDER, RITUAL_ORDER,
};
