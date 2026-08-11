/**
 * BL-5 (issue #1008) — the client half: clan and bloodline are locked on BOTH
 * editing surfaces, at the handler first and in the markup second.
 *
 * AC 9, 10, 11, 12, 13, 14.
 *
 * Two halves, for the reason BL-2's and BL-4's suites give: there is no DOM in
 * this runner (no jsdom, and adding it is a dependency this story did not
 * budget for either).
 *
 *   1. The handlers and the shared guard are exercised for real. `updField`
 *      and `shEdit` are called and the resulting `state.chars` inspected, and
 *      the Identity tab is rendered against a two-line `document` stub, which
 *      is enough because `renderIdentityTab` only ever assigns `innerHTML`.
 *   2. The sheet's clan/bloodline pair is asserted by static analysis, in the
 *      style BL-2's own review established for exactly this line. It is built
 *      inside a `covRow` call in the middle of a 2700-line render, and the two
 *      selects sit on ONE source line, which is precisely how you lock one and
 *      miss the other.
 *
 * The deletion proof (AC 14) is a CALL-SITE grep, not a declaration grep, using
 * BL-3b's shared quote-aware comment stripper. BL-3a's review shipped a
 * `ReferenceError` from exactly this class: a deletion with surviving call
 * sites, passing a test that checked the declaration instead of the calls.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './helpers/strip-comments.js';

vi.mock('../../public/js/data/api.js', () => ({
  apiGet: async () => [],
  apiPost: async () => ({}),
  apiPut: async () => ({}),
  apiPatch: async () => ({}),
  apiDelete: async () => ({}),
  apiRaw: async () => ({ status: 200, ok: true, body: null }),
}));

globalThis.location ??= { hostname: 'localhost', pathname: '/admin.html' };
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.sessionStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const code = rel => stripComments(read(rel));

import {
  WRITE_ONCE_FIELDS, hasNoValue, isLineageLocked, refuseLineageWrite,
  lineageLockAttr, lineageLockNoteHtml, LINEAGE_LOCK_NOTE,
} from '../../public/js/data/write-once.js';

// ═════════════════════════════════════════════════════════════════════════════
//  The shared guard (AC 9, 10)
// ═════════════════════════════════════════════════════════════════════════════

describe('BL-5 AC 10 — the lock reads the character, never the cache', () => {
  it('is locked when the character holds a value', () => {
    expect(isLineageLocked({ clan: 'Daeva' }, 'clan')).toBe(true);
    expect(isLineageLocked({ bloodline: 'Malkovians' }, 'bloodline')).toBe(true);
  });

  it('is unlocked when the character holds no value', () => {
    expect(isLineageLocked({ clan: null }, 'clan')).toBe(false);
    expect(isLineageLocked({}, 'bloodline')).toBe(false);
    expect(isLineageLocked({ bloodline: '' }, 'bloodline')).toBe(false);
    expect(isLineageLocked({ bloodline: '  ' }, 'bloodline')).toBe(false);
  });

  it('survives a null character rather than throwing mid-render', () => {
    expect(isLineageLocked(null, 'clan')).toBe(false);
  });

  it('locks a malformed stored value rather than reading it as an empty field', () => {
    // Fail closed, matching the server twin (see BL-5's code review). A number,
    // boolean, array or object on a lineage field should not exist, but if a
    // direct database edit puts one there the control must lock and the guard
    // must refuse, not treat the field as free to acquire.
    expect(hasNoValue(7)).toBe(false);
    expect(hasNoValue(false)).toBe(false);
    expect(hasNoValue([])).toBe(false);
    expect(hasNoValue({})).toBe(false);
    expect(isLineageLocked({ bloodline: 7 }, 'bloodline')).toBe(true);
    expect(isLineageLocked({ clan: {} }, 'clan')).toBe(true);
    expect(refuseLineageWrite({ bloodline: 7 }, 'bloodline', 'Malkovians')).toBe(true);
  });

  it('never locks a field outside the rule', () => {
    expect(isLineageLocked({ covenant: 'Invictus' }, 'covenant')).toBe(false);
  });

  it('the module does not import the bloodlines cache at all', () => {
    // With production holding zero bloodline documents, a lock keyed off the
    // cache would unlock every field in the app.
    const src = code('public/js/data/write-once.js');
    expect(src).not.toMatch(/from\s+['"].*bloodlines-cache/);
    expect(src).not.toMatch(/bloodlinesResolvable|bloodlinesByClan|approvedBloodlines/);
  });
});

describe('BL-5 AC 9 — refuseLineageWrite', () => {
  it('lets an unguarded field straight through', () => {
    expect(refuseLineageWrite({ covenant: 'Invictus' }, 'covenant', 'Carthian Movement')).toBe(false);
  });

  it('allows an acquisition', () => {
    expect(refuseLineageWrite({ bloodline: null }, 'bloodline', 'Malkovians')).toBe(false);
  });

  it('allows a no-op', () => {
    expect(refuseLineageWrite({ clan: 'Daeva' }, 'clan', 'Daeva')).toBe(false);
  });

  it('refuses a change, a clear and a case-difference', () => {
    expect(refuseLineageWrite({ clan: 'Daeva' }, 'clan', 'Ventrue')).toBe(true);
    expect(refuseLineageWrite({ bloodline: 'Malkovians' }, 'bloodline', null)).toBe(true);
    expect(refuseLineageWrite({ bloodline: 'Malkovians' }, 'bloodline', '')).toBe(true);
    expect(refuseLineageWrite({ bloodline: 'Malkovians' }, 'bloodline', 'malkovians')).toBe(true);
  });

  it('says why, in the console, rather than failing silently', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warn.mockClear();
    refuseLineageWrite({ clan: 'Daeva' }, 'clan', 'Ventrue');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/Daeva/);
    warn.mockClear();
    refuseLineageWrite({ clan: 'Daeva' }, 'clan', 'Daeva');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('BL-5 AC 12 — the locked copy reads like a rule, not an error', () => {
  for (const field of WRITE_ONCE_FIELDS) {
    it(`${field}: is one sentence, British English, no em-dash`, () => {
      const s = LINEAGE_LOCK_NOTE[field];
      expect(typeof s).toBe('string');
      expect(s).not.toContain('—');
      expect(s).toMatch(/permanent/i);
      expect(s.match(/\./g)).toHaveLength(1);
    });

    it(`${field}: does not imply a mistake or a fault`, () => {
      expect(LINEAGE_LOCK_NOTE[field]).not.toMatch(/error|invalid|problem|wrong|broken|cannot be resolved/i);
    });

    it(`${field}: carries no quote or apostrophe, so it is safe in a built attribute`, () => {
      expect(LINEAGE_LOCK_NOTE[field]).not.toMatch(/['"<>&]/);
    });
  }
});

describe('BL-5 AC 11 — the lock markup helpers', () => {
  it('renders disabled plus an explanatory title when locked', () => {
    const attr = lineageLockAttr({ clan: 'Daeva' }, 'clan');
    expect(attr).toContain('disabled');
    expect(attr).toContain('title="');
    expect(attr).toContain(LINEAGE_LOCK_NOTE.clan);
  });

  it('renders nothing at all when unlocked', () => {
    expect(lineageLockAttr({ clan: null }, 'clan')).toBe('');
    expect(lineageLockNoteHtml({ bloodline: null }, 'bloodline')).toBe('');
  });

  it('the visible reason reuses the existing .derived-note class', () => {
    const html = lineageLockNoteHtml({ bloodline: 'Malkovians' }, 'bloodline');
    expect(html).toContain('class="derived-note"');
    expect(html).toContain(LINEAGE_LOCK_NOTE.bloodline);
  });

  it('does NOT reach for BL-4 admin chrome or the error-coloured discipline lock', () => {
    const src = code('public/js/data/write-once.js');
    expect(src).not.toMatch(/ec-form-readonly|ec-form-hint|bl-disc-locked/);
  });

  it('.derived-note exists in the stylesheet both apps load', () => {
    expect(read('public/css/components.css')).toMatch(/\.derived-note\s*\{/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  The two handlers, exercised for real (AC 9)
// ═════════════════════════════════════════════════════════════════════════════

async function freshEditor() {
  vi.resetModules();
  const state = (await import('../../public/js/data/state.js')).default;
  const identity = await import('../../public/js/editor/identity.js');
  const edit = await import('../../public/js/editor/edit.js');
  const marks = { updField: 0, shEdit: 0 };
  identity.registerCallbacks(() => { marks.updField += 1; });
  edit.registerCallbacks(() => { marks.shEdit += 1; }, () => {});
  return { state, identity, edit, marks };
}

function holder(extra = {}) {
  return { name: 'Subject', clan: 'Mekhet', bloodline: 'Malkovians', ...extra };
}

let warnSpy;
beforeEach(() => { warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {}); });

describe('BL-5 AC 9 — updField (Identity tab) refuses the write', () => {
  it('refuses a clan change and leaves state.chars and _markDirty untouched', async () => {
    const { state, identity, marks } = await freshEditor();
    state.chars = [holder()];
    state.editIdx = 0;
    identity.updField('clan', 'Ventrue');
    expect(state.chars[0].clan).toBe('Mekhet');
    expect(marks.updField).toBe(0);
  });

  it('refuses a bloodline change', async () => {
    const { state, identity, marks } = await freshEditor();
    state.chars = [holder()];
    state.editIdx = 0;
    identity.updField('bloodline', 'Gorgons');
    expect(state.chars[0].bloodline).toBe('Malkovians');
    expect(marks.updField).toBe(0);
  });

  it('refuses a bloodline clear, which is what the select would send as null', async () => {
    const { state, identity, marks } = await freshEditor();
    state.chars = [holder()];
    state.editIdx = 0;
    identity.updField('bloodline', null);
    expect(state.chars[0].bloodline).toBe('Malkovians');
    expect(marks.updField).toBe(0);
  });

  it('allows the acquisition of a bloodline and marks dirty', async () => {
    const { state, identity, marks } = await freshEditor();
    state.chars = [holder({ bloodline: null })];
    state.editIdx = 0;
    identity.updField('bloodline', 'Malkovians');
    expect(state.chars[0].bloodline).toBe('Malkovians');
    expect(marks.updField).toBe(1);
  });

  it('allows the first set of a clan', async () => {
    const { state, identity, marks } = await freshEditor();
    state.chars = [holder({ clan: null })];
    state.editIdx = 0;
    identity.updField('clan', 'Daeva');
    expect(state.chars[0].clan).toBe('Daeva');
    expect(marks.updField).toBe(1);
  });

  it('leaves every other field alone', async () => {
    const { state, identity, marks } = await freshEditor();
    state.chars = [holder()];
    state.editIdx = 0;
    identity.updField('covenant', 'Invictus');
    expect(state.chars[0].covenant).toBe('Invictus');
    expect(marks.updField).toBe(1);
  });
});

describe('BL-5 AC 9 — shEdit (sheet header) refuses the write', () => {
  it('refuses a clan change — the guard sits ABOVE shEdit\'s first-line assignment', async () => {
    // `shEdit` writes the field on its very first line
    // (`state.chars[state.editIdx][field] = val || null;`). A guard placed
    // after it would refuse nothing.
    const { state, edit, marks } = await freshEditor();
    state.chars = [holder()];
    state.editIdx = 0;
    edit.shEdit('clan', 'Ventrue');
    expect(state.chars[0].clan).toBe('Mekhet');
    expect(marks.shEdit).toBe(0);
  });

  it('refuses a bloodline change', async () => {
    const { state, edit, marks } = await freshEditor();
    state.chars = [holder()];
    state.editIdx = 0;
    edit.shEdit('bloodline', 'Gorgons');
    expect(state.chars[0].bloodline).toBe('Malkovians');
    expect(marks.shEdit).toBe(0);
  });

  it("refuses a bloodline clear, including the '' the select sends", async () => {
    const { state, edit, marks } = await freshEditor();
    state.chars = [holder()];
    state.editIdx = 0;
    edit.shEdit('bloodline', '');
    expect(state.chars[0].bloodline).toBe('Malkovians');
    expect(marks.shEdit).toBe(0);
  });

  it('does not clear the bloodline as a side effect of a refused clan write', async () => {
    // This is the defect the deleted block used to cause, arriving by a
    // different route: a clan write that got through would have nulled a
    // perfectly good bloodline.
    const { state, edit } = await freshEditor();
    state.chars = [holder()];
    state.editIdx = 0;
    edit.shEdit('clan', 'Gangrel');
    expect(state.chars[0].bloodline).toBe('Malkovians');
  });

  it('allows the first set of a clan and still assigns the clan bane', async () => {
    const { state, edit, marks } = await freshEditor();
    state.chars = [holder({ clan: null, bloodline: null })];
    state.editIdx = 0;
    edit.shEdit('clan', 'Nosferatu');
    expect(state.chars[0].clan).toBe('Nosferatu');
    expect(Array.isArray(state.chars[0].banes)).toBe(true);
    expect(state.chars[0].banes.length).toBeGreaterThan(0);
    expect(marks.shEdit).toBe(1);
  });

  it('allows the acquisition of a bloodline', async () => {
    const { state, edit, marks } = await freshEditor();
    state.chars = [holder({ bloodline: null })];
    state.editIdx = 0;
    edit.shEdit('bloodline', 'Malkovians');
    expect(state.chars[0].bloodline).toBe('Malkovians');
    expect(marks.shEdit).toBe(1);
  });

  it('leaves every other field alone', async () => {
    const { state, edit, marks } = await freshEditor();
    state.chars = [holder()];
    state.editIdx = 0;
    edit.shEdit('concept', 'Something else');
    expect(state.chars[0].concept).toBe('Something else');
    expect(marks.shEdit).toBe(1);
  });
});

describe('BL-5 AC 9 — one implementation, called from both handlers', () => {
  it('both files import the shared guard rather than rolling their own', () => {
    for (const f of ['public/js/editor/identity.js', 'public/js/editor/edit.js']) {
      expect(code(f)).toMatch(/from\s+['"]\.\.\/data\/write-once\.js['"]/);
      expect(code(f)).toMatch(/refuseLineageWrite\(/);
    }
  });

  it('neither handler re-derives the rule inline', () => {
    for (const f of ['public/js/editor/identity.js', 'public/js/editor/edit.js', 'public/js/editor/sheet.js']) {
      const src = code(f);
      expect(src).not.toMatch(/field\s*===\s*'clan'\s*&&\s*c\.clan/);
    }
  });

  it("edit.js's two importers both still load it", () => {
    // `edit.js` has two consumers, admin.js and app.js. A change to a handler
    // it exports lands on both apps at once.
    for (const f of ['public/js/admin.js', 'public/js/app.js']) {
      expect(code(f)).toMatch(/from\s+['"][^'"]*editor\/edit\.js['"]/);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  The four dropdowns (AC 11, 13)
// ═════════════════════════════════════════════════════════════════════════════

async function renderIdentity(c) {
  vi.resetModules();
  let html = '';
  globalThis.document = {
    getElementById: () => ({ set innerHTML(v) { html = v; }, get innerHTML() { return html; }, textContent: '' }),
  };
  const identity = await import('../../public/js/editor/identity.js');
  identity.renderIdentityTab(c);
  delete globalThis.document;
  return html;
}

/** The `<select>` whose onchange writes `field`. */
function selectFor(html, field) {
  const m = html.match(new RegExp(`<select[^>]*updField\\('${field}'[^>]*>`));
  return m ? m[0] : null;
}

const BASE_CHAR = {
  name: 'Subject', attributes: {}, skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [], status: {},
};

describe('BL-5 AC 11 — the Identity tab locks both selects when the field is set', () => {
  it('the clan select is disabled and explains itself', async () => {
    const html = await renderIdentity({ ...BASE_CHAR, clan: 'Mekhet', bloodline: null });
    const sel = selectFor(html, 'clan');
    expect(sel).toBeTruthy();
    expect(sel).toContain('disabled');
    expect(sel).toContain(LINEAGE_LOCK_NOTE.clan);
    expect(html).toContain('<div class="derived-note">' + LINEAGE_LOCK_NOTE.clan + '</div>');
  });

  it('the bloodline select is disabled and explains itself', async () => {
    const html = await renderIdentity({ ...BASE_CHAR, clan: 'Mekhet', bloodline: 'Malkovians' });
    const sel = selectFor(html, 'bloodline');
    expect(sel).toBeTruthy();
    expect(sel).toContain('disabled');
    expect(sel).toContain(LINEAGE_LOCK_NOTE.bloodline);
    expect(html).toContain('<div class="derived-note">' + LINEAGE_LOCK_NOTE.bloodline + '</div>');
  });

  it('a locked bloodline still SHOWS its own stored value (BL-3a fix 4 survives)', async () => {
    // The cache is empty in this runner, which is production's state today.
    // The stored value must still be unioned into the option list, or the
    // locked control would read "(none)".
    const html = await renderIdentity({ ...BASE_CHAR, clan: 'Mekhet', bloodline: 'Malkovians' });
    expect(html).toMatch(/<option selected>Malkovians<\/option>/);
  });

  it('an unset bloodline leaves the select live and unexplained', async () => {
    const html = await renderIdentity({ ...BASE_CHAR, clan: 'Mekhet', bloodline: null });
    const sel = selectFor(html, 'bloodline');
    expect(sel).not.toContain('disabled');
    expect(html).not.toContain(LINEAGE_LOCK_NOTE.bloodline);
  });

  it('an unset clan leaves the select live', async () => {
    const html = await renderIdentity({ ...BASE_CHAR, clan: null, bloodline: null });
    expect(selectFor(html, 'clan')).not.toContain('disabled');
  });
});

describe('BL-5 AC 13 — the unlocked clan select carries a "not set" placeholder', () => {
  it('an unset clan does not present Daeva as a fait accompli', async () => {
    const html = await renderIdentity({ ...BASE_CHAR, clan: null, bloodline: null });
    const sel = selectFor(html, 'clan');
    const after = html.slice(html.indexOf(sel) + sel.length);
    const firstOption = after.slice(0, after.indexOf('</select>'));
    expect(firstOption).toMatch(/^\s*<option value=""[^>]*>\(not set\)<\/option>/);
    expect(firstOption).not.toMatch(/^\s*<option( selected)?>Daeva/);
  });

  it('the placeholder is selected while no clan is set', async () => {
    const html = await renderIdentity({ ...BASE_CHAR, clan: null });
    expect(html).toContain('<option value="" selected>(not set)</option>');
  });
});

describe('BL-5 AC 11, 13 — the sheet locks BOTH selects on the one line that builds them', () => {
  const src = read('public/js/editor/sheet.js');
  const line = src.split('\n').find(l => l.includes("shEdit('clan'") || l.includes("shEdit(\\'clan\\'"));

  it('the clan/bloodline edit line exists and is a single line, as before', () => {
    expect(line).toBeTruthy();
    expect(line).toMatch(/bloodline/);
  });

  it('the lock attribute is applied TWICE on that line, not once', () => {
    // Two selects are built there. Locking one and missing the other is the
    // specific failure this assertion exists for.
    expect((line.match(/lineageLockAttr\(/g) || [])).toHaveLength(2);
  });

  it('the visible reason is rendered for both fields', () => {
    expect((src.match(/lineageLockNoteHtml\(/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('the sheet imports the shared helpers rather than duplicating the copy', () => {
    expect(code('public/js/editor/sheet.js')).toMatch(/from\s+['"]\.\.\/data\/write-once\.js['"]/);
  });

  it('the clan select carries the "not set" placeholder for the acquisition path', () => {
    // Built one line above the covRow call, alongside the option list it
    // prefixes, and suppressed once the field is locked.
    const optsLine = src.split('\n').find(l => l.includes('_clanPlaceholder ='));
    expect(optsLine).toBeTruthy();
    expect(optsLine).toMatch(/\(not set\)/);
    expect(optsLine).toMatch(/isLineageLocked\(c, 'clan'\)/);
    expect(src.split('\n').find(l => l.includes('const cOpts'))).toMatch(/_clanPlaceholder \+/);
  });

  it('the lock is keyed off the character, never off the cache', () => {
    expect(line).not.toMatch(/bloodlinesResolvable|bloodlinesByClan\(\)\s*\?/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  The deletion (AC 14)
// ═════════════════════════════════════════════════════════════════════════════

describe('BL-5 AC 14 — the bloodline auto-clear is gone, proved at the call sites', () => {
  const src = code('public/js/editor/edit.js');

  it('no call to bloodlinesByClan survives', () => {
    expect(src).not.toMatch(/\bbloodlinesByClan\s*\(/);
  });

  it('no call to bloodlinesResolvable survives', () => {
    expect(src).not.toMatch(/\bbloodlinesResolvable\s*\(/);
  });

  it('the now-dead import of the bloodlines cache is gone too', () => {
    expect(src).not.toMatch(/from\s+['"][^'"]*bloodlines-cache\.js['"]/);
  });

  it('the destructive assignment itself is gone', () => {
    expect(src).not.toMatch(/c\.bloodline\s*=\s*null/);
  });

  it('the imports edit.js still USES are untouched', () => {
    // `isInClanDisc` and `bloodlineUnresolved` are read elsewhere in the file.
    expect(src).toMatch(/isInClanDisc/);
    expect(src).toMatch(/bloodlineUnresolved/);
  });

  it('the clan bane assignment STAYS — it is still needed on a first set', () => {
    expect(src).toMatch(/CLAN_BANES\[/);
    expect(src).toMatch(/banes\.unshift/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  CSS hygiene (AC 15)
// ═════════════════════════════════════════════════════════════════════════════

describe('BL-5 — no inline style, bare hex or rgba entered anything this story wrote', () => {
  const OFFENDERS = [
    [/style\s*=\s*["']/, 'an inline style attribute'],
    [/#[0-9a-fA-F]{3,8}\b/, 'a bare hex colour'],
    [/rgba?\s*\(/, 'an rgba()/rgb() literal'],
  ];

  function assertClean(text, label) {
    for (const [re, what] of OFFENDERS) {
      expect(re.test(text), `${label} must not contain ${what}`).toBe(false);
    }
  }

  it('the shared write-once module is clean', () => {
    assertClean(code('public/js/data/write-once.js'), 'write-once.js');
  });

  it('identity.js is clean end to end', () => {
    assertClean(code('public/js/editor/identity.js'), 'identity.js');
  });

  it('the sheet lines this story touched are clean', () => {
    // sheet.js as a whole carries a pre-existing inline style at the Regent
    // row, which this story does not touch and must not be blamed for. The
    // assertion is scoped to the lines BL-5 wrote.
    const src = read('public/js/editor/sheet.js');
    const touched = src.split('\n').filter(l => l.includes('lineageLock') || l.includes('write-once'));
    expect(touched.length).toBeGreaterThan(0);
    assertClean(touched.join('\n'), 'the BL-5 lines in sheet.js');
  });

  it('no new CSS class was invented for the lock', () => {
    const css = read('public/css/components.css');
    expect(css).not.toMatch(/\.lineage-lock|\.write-once/);
  });
});
