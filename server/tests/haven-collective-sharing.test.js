/**
 * Haven collective sharing (2026-09, follow-up to the Kurtis W ID-leak fix —
 * live player feedback on Charlie Ballsack's own Haven/Safe Place).
 *
 * Root cause: Haven's own rules text is explicit — "Like a Safe Place, a
 * coterie may share a Haven Merit... Each member that wishes to benefit must
 * invest Merit dots in both the Safe Place and the Haven." Safe Place already
 * sums every sharer's contribution (`domMeritTotalSingle`); the CAP_DOMAIN
 * branch of `meritEffectiveRating` (Haven, Mandragora Garden) never did —
 * it only ever read the VIEWING character's own investment, capped by the
 * shared Safe Place total. A player with 1 dot of their own in Haven always
 * saw "capped at 1", regardless of what their partners had invested.
 *
 * Mandragora Garden is deliberately EXCLUDED from this fix — Angelus's
 * ruling (2026-09): it can no longer be shared at all, even though it used
 * to be and the schema/UI still carry legacy shared_with data for it. That
 * data is legacy/inert (same "preserve, don't act on it" treatment this
 * codebase already gives non-shareable merits elsewhere), so Mandragora's
 * own-only cap computation must stay byte-identical to before this fix.
 */

globalThis.location = {
  origin: 'http://localhost:8080',
  hostname: 'localhost',
  href: 'http://localhost:8080/admin',
};
globalThis.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
  clear() { this._store = {}; },
};
globalThis.window = globalThis.window || globalThis;
globalThis.document = globalThis.document || {
  getElementById: () => null,
  createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} } }),
};

import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

let meritEffectiveRating;
let stateMod;

beforeAll(async () => {
  const u = (p) => pathToFileURL(path.resolve(REPO_ROOT, ...p)).href;
  ({ meritEffectiveRating } = await import(u(['public', 'js', 'editor', 'domain.js'])));
  stateMod = (await import(u(['public', 'js', 'data', 'state.js']))).default;
});

function mkChar(id, name, merits) {
  return {
    _id: id, name, clan: 'Nosferatu', covenant: 'Invictus',
    status: { city: 0, clan: 0, covenant: {} },
    attributes: {}, skills: {}, disciplines: {}, powers: [], merits,
  };
}

describe('Haven — collective sharing (own + partners, capped by shared Safe Place)', () => {
  it('own 1 + partner (by-name resolved) 1 = 2, under a cap of 2', () => {
    // Mirrors Charlie's real shape but with resolvable-by-name partners so
    // this test isolates the collective-sum logic from the ID-fallback path
    // (covered separately below).
    const safePlace = { category: 'domain', name: 'Safe Place', qualifier: 'The Junkyard', cp: 1, shared_with: ['Partner'] };
    const haven = {
      category: 'domain', name: 'Haven', cp: 1,
      attached_to: 'Safe Place (The Junkyard)',
      shared_with: ['Partner'],
    };
    const owner = mkChar('owner', 'Owner', [safePlace, haven]);
    const partnerSafePlace = { category: 'domain', name: 'Safe Place', qualifier: 'The Junkyard', cp: 1 };
    const partnerHaven = { category: 'domain', name: 'Haven', cp: 1, qualifier: undefined };
    const partner = mkChar('partner', 'Partner', [partnerSafePlace, partnerHaven]);
    stateMod.chars = [owner, partner];

    // cap = collective Safe Place total = 1 (owner) + 1 (partner) = 2
    // Haven collective = 1 (owner) + 1 (partner) = 2, under the cap of 2.
    expect(meritEffectiveRating(owner, haven)).toBe(2);
  });

  it('own 1, partner has 3 of their own Haven dots, but the shared Safe Place caps the total at 2', () => {
    const safePlace = { category: 'domain', name: 'Safe Place', qualifier: 'The Junkyard', cp: 1, shared_with: ['Partner'] };
    const haven = {
      category: 'domain', name: 'Haven', cp: 1,
      attached_to: 'Safe Place (The Junkyard)',
      shared_with: ['Partner'],
    };
    const owner = mkChar('owner', 'Owner', [safePlace, haven]);
    const partnerSafePlace = { category: 'domain', name: 'Safe Place', qualifier: 'The Junkyard', cp: 1 };
    const partnerHaven = { category: 'domain', name: 'Haven', cp: 3 };
    const partner = mkChar('partner', 'Partner', [partnerSafePlace, partnerHaven]);
    stateMod.chars = [owner, partner];

    // cap = 1 (owner Safe Place) + 1 (partner Safe Place) = 2
    // Haven collective would be 1 + 3 = 4, but the cap binds it to 2.
    expect(meritEffectiveRating(owner, haven)).toBe(2);
  });

  it('owner with ZERO own Haven dots gets zero, even though a partner has plenty (each member must invest in both)', () => {
    const safePlace = { category: 'domain', name: 'Safe Place', qualifier: 'The Junkyard', cp: 5 };
    const haven = {
      category: 'domain', name: 'Haven', cp: 0,
      attached_to: 'Safe Place (The Junkyard)',
      shared_with: ['Partner'],
    };
    const owner = mkChar('owner', 'Owner', [safePlace, haven]);
    const partnerHaven = { category: 'domain', name: 'Haven', cp: 4 };
    const partner = mkChar('partner', 'Partner', [partnerHaven]);
    stateMod.chars = [owner, partner];

    expect(meritEffectiveRating(owner, haven)).toBe(0);
  });

  it('ID-format shared_with entries (current write format, since fix #820) fall back to the server-provided _partner_dots enrichment when the partner is not in this viewer\'s own roster', () => {
    // Reproduces Charlie's own real production shape: a player's own
    // role-scoped state.chars never contains the shared partner's full
    // character object, so the by-name loop can never resolve an ID-format
    // entry. The server's _partner_dots enrichment (server/routes/
    // characters.js) is what carries the real number in that case.
    const safePlace = {
      category: 'domain', name: 'Safe Place', qualifier: 'The Junkyard', cp: 1,
      shared_with: ['69d73ea49162ece35897a48b'],
      _partner_dots: 1,
    };
    const haven = {
      category: 'domain', name: 'Haven', cp: 1,
      attached_to: 'Safe Place (The Junkyard)',
      shared_with: ['69d73ea49162ece35897a48b'],
      _partner_dots: 1,
    };
    const owner = mkChar('owner', 'Owner', [safePlace, haven]);
    stateMod.chars = [owner]; // the partner is genuinely absent — player's own scoped fetch

    // cap: Safe Place's own _havenCap resolution also uses the same
    // by-name-then-_partner_dots-fallback pattern (domMeritTotalSingle) —
    // own 1 + partner_dots 1 = 2.
    // Haven: own 1 + partner_dots 1 = 2, under the cap of 2.
    expect(meritEffectiveRating(owner, haven)).toBe(2);
  });
});

describe('Mandragora Garden — NOT shared (Angelus\'s ruling): stays own-only, byte-identical to pre-fix behaviour', () => {
  it('a partner with their own Mandragora Garden dots contributes NOTHING to the owner\'s effective rating', () => {
    const anchor = { category: 'domain', name: 'Necropolis Sepulcher', cp: 1 };
    const mandragora = {
      category: 'domain', name: 'Mandragora Garden', cp: 1,
      attached_to: 'Necropolis Sepulcher',
      shared_with: ['Partner'], // legacy/inert data — no longer actionable
    };
    const owner = mkChar('owner', 'Owner', [anchor, mandragora]);
    const partnerMandragora = { category: 'domain', name: 'Mandragora Garden', cp: 4 };
    const partner = mkChar('partner', 'Partner', [partnerMandragora]);
    stateMod.chars = [owner, partner];

    // cap = anchor's own total (Sepulcher, no shared_with) = 1.
    // Own Mandragora stored = 1. min(1, 1) = 1 — the partner's 4 dots must
    // NOT appear anywhere in this result.
    expect(meritEffectiveRating(owner, mandragora)).toBe(1);
  });

  it('an ID-format shared_with entry on Mandragora Garden (legacy data) does not trigger the server _partner_dots fallback either', () => {
    const anchor = { category: 'domain', name: 'Necropolis Sepulcher', cp: 1 };
    const mandragora = {
      category: 'domain', name: 'Mandragora Garden', cp: 1,
      attached_to: 'Necropolis Sepulcher',
      shared_with: ['69d73ea49162ece35897a48b'],
      _partner_dots: 4, // even if the server ever attached this to legacy data
    };
    const owner = mkChar('owner', 'Owner', [anchor, mandragora]);
    stateMod.chars = [owner];

    expect(meritEffectiveRating(owner, mandragora)).toBe(1);
  });
});
