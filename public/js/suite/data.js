/* Suite data layer — constants and mutable state */

// Large data sets are split into separate files
export { CHARS_DATA } from './chars-data.js';
export { ICONS } from './icons-data.js';

// ── SVG icon constants ──

export const CITY_SVG = `<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="100%" height="100%"><g transform="translate(0,300) scale(0.1,-0.1)"><path d="M1255 2829 c-110 -27 -197 -61 -286 -113 -132 -78 -245 -222 -264 -340 -4 -22 -12 -47 -17 -53 -8 -10 -54 -13 -169 -13 -88 0 -159 -4 -159 -9 0 -5 14 -53 31 -107 17 -55 32 -106 32 -114 2 -13 -30 -16 -210 -20 l-213 -5 471 -705 c259 -388 485 -720 503 -738 58 -62 507 -457 523 -460 8 -2 18 0 22 5 3 4 42 39 86 78 44 38 82 72 85 75 3 3 75 66 160 141 85 76 167 150 181 165 35 38 479 699 860 1279 l106 160 -214 3 c-198 2 -214 4 -209 20 5 16 53 178 63 215 5 16 -7 17 -149 17 -108 0 -159 4 -170 13 -8 6 -21 34 -27 61 -52 214 -260 380 -560 447 -121 26 -364 25 -476 -2z"/></g></svg>`;
export const OTHER_SVG = `<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="100%" height="100%"><g transform="translate(0,300) scale(0.1,-0.1)"><path d="M1398 2769 c-81 -11 -179 -45 -255 -90 -130 -78 -266 -239 -314 -373 l-24 -66 -87 0 -87 0 -105 -87 c-357 -300 -425 -359 -425 -366 -1 -5 35 -48 79 -95 44 -48 80 -89 80 -92 0 -5 -121 -143 -242 -277 l-20 -22 145 -94 c219 -143 371 -251 487 -346 122 -100 327 -304 420 -418 l65 -80 189 -73 190 -72 114 42 c289 105 260 89 369 213 254 292 378 397 797 676 l228 153 -24 26 c-156 171 -238 265 -238 274 0 5 27 38 59 72 33 33 69 72 81 86 l22 25 -49 43 c-26 24 -145 125 -263 225 l-215 182 -88 5 -88 5 -26 65 c-88 222 -303 406 -523 448 -87 17 -179 21 -252 11z"/></g></svg>`;
export const BP_SVG = `<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="100%" height="100%"><g transform="translate(0,300) scale(0.1,-0.1)"><path d="M1492 2928 c-6 -7 -20 -39 -32 -70 -31 -83 -114 -242 -175 -334 -30 -44 -130 -180 -223 -302 -236 -308 -291 -398 -336 -556 -48 -165 -41 -349 18 -497 l25 -59 -31 17 c-16 10 -58 48 -93 85 -116 122 -180 303 -157 438 7 36 15 75 18 88 5 18 2 22 -18 22 -61 0 -229 -149 -312 -278 -53 -82 -95 -176 -122 -278 -29 -106 -27 -368 4 -484 43 -162 186 -405 237 -405 25 0 24 10 -10 104 -23 65 -26 86 -23 170 2 78 8 105 28 146 80 159 270 115 375 -87 17 -32 35 -58 42 -58 7 0 17 19 23 43 37 145 115 205 232 177 51 -13 221 -117 310 -192 101 -84 160 -212 192 -417 28 -173 44 -170 75 14 44 259 103 352 317 496 122 82 161 99 226 99 94 0 153 -55 183 -170 16 -63 36 -62 66 2 57 123 138 188 236 188 108 0 166 -81 171 -241 3 -83 0 -105 -22 -170 -15 -41 -29 -82 -33 -91 -11 -35 35 -19 74 26 79 91 157 247 192 386 95 377 -60 796 -365 989 -26 17 -59 31 -72 31 -21 0 -24 -3 -18 -27 3 -16 11 -54 16 -85 30 -169 -78 -402 -238 -516 -17 -13 -32 -20 -32 -16 0 3 11 37 25 75 67 186 54 403 -35 596 -51 109 -98 181 -283 425 -238 315 -319 445 -393 626 -41 100 -47 108 -62 90z"/></g></svg>`;
export const HUM_SVG = `<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="100%" height="100%"><g transform="translate(0,300) scale(0.1,-0.1)"><path d="M1486 2973 c-2 -10 -24 -111 -47 -225 l-42 -206 -56 -7 c-128 -16 -315 -89 -428 -166 l-42 -29 -113 73 c-179 117 -252 159 -256 147 -3 -9 141 -272 194 -355 12 -19 9 -28 -35 -88 -87 -119 -156 -282 -182 -431 l-11 -64 -196 -41 c-212 -45 -250 -57 -236 -71 8 -8 203 -54 376 -90 55 -11 58 -12 63 -48 25 -149 113 -362 194 -469 l40 -52 -105 -182 c-98 -172 -112 -199 -99 -199 15 0 82 41 218 132 l149 100 59 -42 c89 -63 220 -119 338 -147 58 -14 111 -27 117 -28 6 -2 30 -98 54 -213 42 -205 53 -243 65 -230 3 3 26 104 51 224 24 120 46 218 47 219 1 0 42 9 91 18 118 24 247 77 347 143 46 30 85 54 87 54 2 0 63 -40 136 -88 157 -106 225 -146 233 -139 5 6 -74 153 -168 315 l-36 62 61 94 c76 115 121 218 155 358 l26 108 55 11 c171 35 366 81 374 89 13 13 -16 22 -235 70 l-196 43 -17 86 c-33 157 -101 313 -186 426 l-37 50 103 180 c57 99 104 185 104 193 0 17 -9 12 -185 -101 -77 -49 -151 -97 -165 -105 -24 -14 -29 -12 -100 33 -118 77 -259 130 -401 150 l-47 7 -43 221 c-41 204 -59 257 -73 210z"/></g></svg>`;
export const STAT_SVG = `<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="100%" height="100%"><g transform="translate(0,300) scale(0.1,-0.1)"><path d="M1466 2978 c-32 -53 -126 -216 -126 -221 0 -3 -23 -43 -51 -89 -28 -46 -76 -130 -106 -188 -59 -112 -119 -202 -192 -288 -87 -102 -320 -292 -436 -356 -27 -16 -107 -64 -177 -107 -70 -43 -131 -79 -135 -79 -16 -1 -227 -135 -230 -147 -3 -7 15 -22 39 -34 24 -12 50 -27 58 -34 8 -7 55 -34 105 -60 50 -26 151 -85 225 -132 252 -157 376 -251 491 -370 77 -80 196 -235 211 -274 3 -9 49 -87 102 -173 53 -86 96 -159 96 -161 0 -3 22 -40 49 -83 27 -43 61 -101 75 -130 14 -29 32 -52 39 -52 7 0 20 15 28 32 92 195 371 665 444 748 65 75 233 238 258 251 15 8 91 57 169 110 79 53 163 107 188 120 25 13 47 26 50 29 3 3 48 30 100 59 142 80 240 143 240 155 -1 10 -112 78 -310 190 -36 20 -119 72 -185 115 -66 43 -158 103 -205 131 -59 37 -121 89 -205 174 -156 157 -230 267 -437 654 -51 97 -138 232 -149 232 -5 0 -15 -10 -23 -22z"/></g></svg>`;

// ── Inline constants ──

export const RITUAL_DISCS = ['Cruac', 'Theban'];
export const CORE_DISCS = ['Animalism', 'Auspex', 'Celerity', 'Dominate', 'Majesty', 'Nightmare', 'Obfuscate', 'Protean', 'Resilience', 'Vigour'];

export const COV_ICON_MAP = {
  'carthianmovement': 'carthian', 'circleofthecrone': 'crone',
  'invictus': 'invictus', 'lanceaetsanctum': 'lance'
};

export const FEED_METHODS = [
  {
    id: 'seduction',
    name: 'Seduction',
    desc: 'Lure a vessel close',
    attrs: ['Presence', 'Manipulation'],
    skills: ['Empathy', 'Socialise', 'Persuasion'],
    discs: ['Majesty', 'Dominate']
  },
  {
    id: 'stalking',
    name: 'Stalking',
    desc: 'Prey on a target unseen',
    attrs: ['Dexterity', 'Wits'],
    skills: ['Stealth', 'Athletics'],
    discs: ['Protean', 'Obfuscate']
  },
  {
    id: 'force',
    name: 'By Force',
    desc: 'Overpower and drain',
    attrs: ['Strength'],
    skills: ['Brawl', 'Weaponry'],
    discs: ['Vigour', 'Nightmare']
  },
  {
    id: 'familiar',
    name: 'Familiar Face',
    desc: 'Exploit an existing acquaintance',
    attrs: ['Manipulation', 'Presence'],
    skills: ['Persuasion', 'Subterfuge'],
    discs: ['Dominate', 'Majesty']
  },
  {
    id: 'intimidation',
    name: 'Intimidation',
    desc: 'Compel through fear',
    attrs: ['Strength', 'Manipulation'],
    skills: ['Intimidation', 'Subterfuge'],
    discs: ['Nightmare', 'Dominate']
  }
];

export const FEED_TERRS = [
  { id: '', name: 'No territory', ambienceMod: 0 },
  { id: 'academy', name: 'The Academy', ambience: 'Curated', ambienceMod: +3 },
  { id: 'dockyards', name: 'The Dockyards', ambience: 'Settled', ambienceMod: 0 },
  { id: 'harbour', name: 'The Harbour', ambience: 'Untended', ambienceMod: -2 },
  { id: 'northshore', name: 'The North Shore', ambience: 'Tended', ambienceMod: +2 },
  { id: 'secondcity', name: 'The Second City', ambience: 'Tended', ambienceMod: +2 }
];

// ── Mutable state ──

const state = {
  PS: 5,
  MOD: 0,
  AGAIN: 10,
  ROTE: false,
  NA: false,
  WP: false,
  POOL_INFO: null,
  RESIST_CHAR: null,
  RESIST_MODE: null,
  RESIST_VAL: 0,
  hist: [],
  chars: [],
  rollChar: null,
  sheetChar: null,
  panelMode: null,
  openExpId: null,
  feedMethod: null,
  stActive: [],
  tTimer: null
};
export default state;
