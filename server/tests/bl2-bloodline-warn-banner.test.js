/**
 * BL-2 (issue #1008) — the unresolved-bloodline warning banner.
 *
 * AC 4, 9. The banner is the "loud" half of the ruling: an empty discipline
 * list stops the wrong number being shown, but on its own it is just as silent
 * as the bug it replaces.
 *
 * Two halves, because there is no DOM in this test runner (no jsdom, and
 * adding it is a dependency this story did not budget for):
 *   1. `buildBloodlineWarnHtml` is pure and carries every decision worth
 *      testing — wording, grouping, escaping, and the empty case.
 *   2. Static analysis for the things drift pattern #16 says get missed: does
 *      the mount element actually EXIST in both HTML files, and does the CSS
 *      class actually exist. The rules-engine banner failed on exactly those
 *      two checks and nobody noticed for three months.
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';

// api.js reads `location` at module scope, which does not exist in this
// runner. The banner never fetches, so stub the module out entirely rather
// than faking a browser global (same approach as the ECM-1 tests).
vi.mock('../../public/js/data/api.js', () => ({ apiGet: async () => [], apiBase: () => '', headers: () => ({}) }));

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildBloodlineWarnHtml,
  BLOODLINE_WARN_MOUNT_ID,
} from '../../public/js/components/bloodline-warn-banner.js';
import { MISS_UNKNOWN, MISS_NOT_LOADED } from '../../public/js/data/bloodlines-cache.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

// ─────────────────────────────────────────────────────────────────────────────
// Pure — the banner content
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-2 — buildBloodlineWarnHtml', () => {
  it('renders nothing when there are no misses', () => {
    expect(buildBloodlineWarnHtml([])).toBe('');
    expect(buildBloodlineWarnHtml(null)).toBe('');
  });

  it('names the unresolved bloodline verbatim and every affected character', () => {
    const html = buildBloodlineWarnHtml([
      { reason: MISS_UNKNOWN, bloodline: 'Hounds of Actaeon', characters: ['Ocka Keats'] },
    ]);
    expect(html).toContain('Hounds of Actaeon');
    expect(html).toContain('Ocka Keats');
  });

  it('says what is actually happening to the numbers, not just that something is wrong', () => {
    // The whole point of the banner is that a wrong cost is invisible. Saying
    // "an error occurred" would leave it invisible.
    const html = buildBloodlineWarnHtml([
      { reason: MISS_UNKNOWN, bloodline: 'Nope', characters: ['Cazz'] },
    ]);
    expect(html).toMatch(/out-of-clan/i);
    expect(html).toMatch(/4 XP/i);
    expect(html).toMatch(/lock/i);
  });

  it('lists several affected characters on one line', () => {
    const html = buildBloodlineWarnHtml([
      { reason: MISS_UNKNOWN, bloodline: 'Nope', characters: ['Cazz', 'Ivana Horvat'] },
    ]);
    expect(html).toContain('Cazz');
    expect(html).toContain('Ivana Horvat');
  });

  it('distinguishes a not-loaded cache from an unknown bloodline', () => {
    const unknown = buildBloodlineWarnHtml([
      { reason: MISS_UNKNOWN, bloodline: 'Nope', characters: ['Cazz'] },
    ]);
    const notLoaded = buildBloodlineWarnHtml([
      { reason: MISS_NOT_LOADED, bloodline: 'Khaibit', characters: ['Doc'] },
    ]);
    expect(notLoaded).not.toBe(unknown);
    // A system state tells the reader to reload; a data state does not, because
    // reloading will not invent the missing bloodline.
    expect(notLoaded).toMatch(/reload/i);
    expect(unknown).not.toMatch(/reload/i);
  });

  it('renders one row per miss', () => {
    const html = buildBloodlineWarnHtml([
      { reason: MISS_UNKNOWN, bloodline: 'Alpha', characters: ['A'] },
      { reason: MISS_UNKNOWN, bloodline: 'Beta', characters: ['B'] },
    ]);
    expect(html.match(/bl-warn-row/g) || []).toHaveLength(2);
  });

  it('escapes the bloodline value and the character names', () => {
    // Both come from the database. A bloodline named by an ST via BL-4's admin
    // CRUD is user input on a page other users load.
    const html = buildBloodlineWarnHtml([
      { reason: MISS_UNKNOWN, bloodline: '<img src=x onerror=alert(1)>', characters: ['<b>Cazz</b>'] },
    ]);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>Cazz');
    expect(html).toContain('&lt;');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Static — the checks drift pattern #16 says get skipped
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-2 — the banner has a surface that provably exists (drift #16)', () => {
  it('the mount element exists in BOTH index.html and admin.html', () => {
    // The rules-engine banner referenced `app-status-banner`, which is in no
    // HTML file at all, so `if (banner)` swallowed it silently. This is that
    // exact check, run as a test rather than left to a reviewer.
    for (const page of ['public/index.html', 'public/admin.html']) {
      expect(read(page), `${page} is missing #${BLOODLINE_WARN_MOUNT_ID}`)
        .toContain(`id="${BLOODLINE_WARN_MOUNT_ID}"`);
    }
  });

  it('the CSS class the banner sets exists in components.css, which both apps load', () => {
    const css = read('public/css/components.css');
    expect(css).toMatch(/\.bl-warn-banner\b/);
    expect(css).toMatch(/\.bl-warn-row\b/);
    for (const page of ['public/index.html', 'public/admin.html']) {
      expect(read(page)).toMatch(/href="css\/components\.css"/);
    }
  });

  it('the banner CSS uses tokens only — no bare hex, no rgba()', () => {
    const css = read('public/css/components.css');
    const block = css.slice(css.indexOf('/* ── BL-2'), css.indexOf('/* ── BL-2') + 1400);
    // Strip comments first: an issue reference like (#1008) is not a colour,
    // and a check that cannot tell them apart would be noise, not a guard.
    const rules = block.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(rules).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(rules).not.toMatch(/rgba?\(/);
  });

  it('the component sets classes, never an inline style attribute', () => {
    const src = read('public/js/components/bloodline-warn-banner.js');
    expect(src).not.toMatch(/style="/);
  });

  it('the mount is self-healing — a missing container is never a silent no-op', () => {
    // The lesson of #16 is that a defensive `if (el) {...}` converts a missing
    // element into permanent silence. This one creates the element instead.
    const src = read('public/js/components/bloodline-warn-banner.js');
    expect(src).toMatch(/createElement/);
  });
});
