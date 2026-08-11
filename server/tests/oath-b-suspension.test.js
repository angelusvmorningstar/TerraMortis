/**
 * OATH-B (issue #1111, ADR-010 D2 / D3a / D6 / D7) — breach and suspension.
 *
 * Non-DB coverage. The API round-trip that proves `chapter_number` and the
 * forfeiture params survive persistence lives in the sibling suite
 * `oath-b-d6-api-roundtrip.test.js`.
 *
 * Two shapes are used deliberately, both learned the hard way on OATH-A:
 *
 *  - **Property over mechanism.** The category sweep asserts an invariant
 *    across every merit category rather than testing the branch just edited.
 *    `meritEffectiveRating` has three early returns above its fall-through,
 *    and a per-branch test written against the one I changed would not have
 *    noticed the other three.
 *  - **Per surface, not per helper.** Calling `meritEffectiveRating` N times
 *    through N callers demonstrates the helper works, which is not in doubt.
 *    The AC7 audit therefore asserts RENDERED OUTPUT.
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

import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

let H;                       // rules-helpers
let meritEffectiveRating, meritRating, meritFreeSum;
let shRenderGeneralMerits, shRenderDomainMerits, shRenderInfluenceMerits;
let shExitOath, shRestoreOathDots;
let stateMod, loadRulesMod;

beforeAll(async () => {
  const u = (p) => pathToFileURL(path.resolve(REPO_ROOT, ...p)).href;
  H = await import(u(['public', 'js', 'data', 'rules-helpers.js']));
  ({ meritEffectiveRating, meritFreeSum } = await import(u(['public', 'js', 'editor', 'domain.js'])));
  ({ meritRating } = await import(u(['public', 'js', 'editor', 'xp.js'])));
  ({ shRenderGeneralMerits, shRenderDomainMerits, shRenderInfluenceMerits } = await import(u(['public', 'js', 'editor', 'sheet.js'])));
  const editMod = await import(u(['public', 'js', 'editor', 'edit.js']));
  editMod.registerCallbacks(() => {}, () => {});
  ({ shExitOath, shRestoreOathDots } = await import(u(['public', 'js', 'editor', 'edit-domain.js'])));
  stateMod = (await import(u(['public', 'js', 'data', 'state.js']))).default;
  loadRulesMod = await import(u(['public', 'js', 'editor', 'rule_engine', 'load-rules.js']));
  vi.spyOn(loadRulesMod, 'getRulesCache').mockReturnValue({
    rule_grant: [], rule_nine_again: [], rule_skill_bonus: [], rule_speciality_grant: [],
    rule_tier_budget: [], rule_disc_attr: [], rule_derived_stat_modifier: [],
  });
});

function mkChar(merits) {
  return {
    _id: 'c-oathb', name: 'Testudo', clan: 'Ventrue', covenant: 'Invictus',
    blood_potency: 2, status: { city: 0, clan: 1, covenant: { Invictus: 3 } },
    attributes: {}, skills: {}, disciplines: {}, powers: [], merits,
  };
}

/** An oath merit pledging `dots` against `target`, with the given history. */
function oath(targetName, dots, history, qualifier = null) {
  return {
    category: 'general', name: 'Oath Of Fealty', cp: 0, xp: 0,
    sworn_by: {
      dots_required: dots,
      attachments: [{ name: targetName, qualifier, dots }],
      sworn_at: { chapter_number: 1, iso: '2026-08-07' },
      history,
    },
  };
}

const EXITED = (reason, ch = 4) => ({ event: 'exited', reason, chapter_number: ch, at: '2026-08-07' });
const RESTORED = (dots, ch = 6) => ({ event: 'restored', dots, chapter_number: ch, at: '2026-09-07' });

// ─────────────────────────────────────────────────────────────────────────────
// AC1 / AC2 — the event log, and which reasons forfeit
// ─────────────────────────────────────────────────────────────────────────────

describe('OATH-B AC2 — only broken and abandoned forfeit', () => {
  // All FIVE reasons, not just the two that bite. The three that do not
  // forfeit are where a careless `reason !== 'released_by_liege'` would slip.
  const CASES = [
    ['broken', true], ['abandoned', true],
    ['released_by_liege', false], ['fulfilled', false], ['st_void', false],
  ];

  for (const [reason, forfeits] of CASES) {
    it(`${reason} ${forfeits ? 'suspends' : 'does NOT suspend'} the pledged dots`, () => {
      const c = mkChar([
        { category: 'general', name: 'Resources', cp: 4, xp: 0 },
        oath('Resources', 3, [EXITED(reason)]),
      ]);
      H.applySuspensions(c);
      expect(H.oathReasonForfeits(reason)).toBe(forfeits);
      expect(c.merits[0]._suspended_dots || 0).toBe(forfeits ? 3 : 0);
      expect(meritEffectiveRating(c, c.merits[0])).toBe(forfeits ? 1 : 4);
    });
  }

  it('a sworn but un-exited oath suspends nothing', () => {
    const c = mkChar([
      { category: 'general', name: 'Resources', cp: 4 },
      oath('Resources', 3, []),
    ]);
    H.applySuspensions(c);
    expect(c.merits[0]._suspended_dots).toBeUndefined();
    expect(meritEffectiveRating(c, c.merits[0])).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC4 — HARD: a suspension can be lifted
// ─────────────────────────────────────────────────────────────────────────────

describe('OATH-B AC4 — restoration lifts a suspension', () => {
  // The single most likely casualty of "restoration is deferred". Suspension
  // is DERIVED, so it cannot be hand-cleared: appending this event is the
  // only route back. Without it, dots go dark at breach permanently.
  it('suspended -> append restored -> usable again, in full', () => {
    const c = mkChar([
      { category: 'general', name: 'Resources', cp: 4 },
      oath('Resources', 3, [EXITED('broken')]),
    ]);
    H.applySuspensions(c);
    expect(meritEffectiveRating(c, c.merits[0])).toBe(1);   // suspended

    c.merits[1].sworn_by.history.push(RESTORED(3));
    H.applySuspensions(c);
    expect(meritEffectiveRating(c, c.merits[0])).toBe(4);   // restored
    expect(c.merits[0]._suspended_dots).toBeUndefined();
  });

  it('partial restoration returns exactly the dots restored', () => {
    const c = mkChar([
      { category: 'general', name: 'Resources', cp: 4 },
      oath('Resources', 3, [EXITED('broken'), RESTORED(1)]),
    ]);
    H.applySuspensions(c);
    expect(c.merits[0]._suspended_dots).toBe(2);
    expect(meritEffectiveRating(c, c.merits[0])).toBe(2);
  });

  it('restoring more than is suspended cannot push effective above owned', () => {
    const c = mkChar([
      { category: 'general', name: 'Resources', cp: 4 },
      oath('Resources', 3, [EXITED('broken'), RESTORED(99)]),
    ]);
    H.applySuspensions(c);
    expect(meritEffectiveRating(c, c.merits[0])).toBe(4);
  });

  it('the log is append-only: sworn -> broken -> restored -> broken again', () => {
    // A mutable status field would lose this. The second breach re-suspends
    // the full pledge rather than resuming from the partially-restored state.
    const c = mkChar([
      { category: 'general', name: 'Resources', cp: 4 },
      oath('Resources', 3, [EXITED('broken'), RESTORED(3), EXITED('abandoned')]),
    ]);
    H.applySuspensions(c);
    expect(c.merits[0]._suspended_dots).toBe(3);
    expect(meritEffectiveRating(c, c.merits[0])).toBe(1);
  });

  it('the handler refuses to restore more than is outstanding, and writes nothing', () => {
    const c = mkChar([
      { category: 'general', name: 'Resources', cp: 4 },
      oath('Resources', 3, [EXITED('broken')]),
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = true;
    const res = shRestoreOathDots(1, 5);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Only 3 dots suspended');
    expect(c.merits[1].sworn_by.history).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3 — HARD: chapter_number on every exit event
// ─────────────────────────────────────────────────────────────────────────────

describe('OATH-B AC3 — every exit event records chapter_number', () => {
  // Nothing reads it in this scope, which is exactly why it is at risk: it
  // looks like dead weight. It is unrecoverable after the fact — miss it and
  // the deferred restoration work has no anchor. Asserted on the object that
  // was WRITTEN, not on anything rendered.
  for (const reason of ['broken', 'abandoned', 'released_by_liege', 'fulfilled', 'st_void']) {
    it(`${reason} writes chapter_number onto the persisted event`, () => {
      const c = mkChar([
        { category: 'general', name: 'Resources', cp: 4 },
        oath('Resources', 3, []),
      ]);
      stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = true;
      stateMod.currentChapterNumber = 7;
      const res = shExitOath(1, reason);
      expect(res.ok).toBe(true);
      const ev = c.merits[1].sworn_by.history.at(-1);
      expect(ev.event).toBe('exited');
      expect(ev.reason).toBe(reason);
      expect(ev).toHaveProperty('chapter_number');
      expect(ev.chapter_number).toBe(7);
      expect(ev.at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      delete stateMod.currentChapterNumber;
    });
  }

  it('records null rather than inventing an ordinal when no chapter is loaded', () => {
    // A wrong ordinal is worse than an absent one: it would silently anchor
    // the deferred restoration work to the wrong chapter.
    const c = mkChar([
      { category: 'general', name: 'Resources', cp: 4 },
      oath('Resources', 3, []),
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = true;
    delete stateMod.currentChapterNumber;
    shExitOath(1, 'broken');
    const ev = c.merits[1].sworn_by.history.at(-1);
    expect(ev).toHaveProperty('chapter_number');
    expect(ev.chapter_number).toBeNull();
  });

  it('restoration events carry it too', () => {
    const c = mkChar([
      { category: 'general', name: 'Resources', cp: 4 },
      oath('Resources', 3, [EXITED('broken')]),
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = true;
    stateMod.currentChapterNumber = 9;
    shRestoreOathDots(1, 2);
    const ev = c.merits[1].sworn_by.history.at(-1);
    expect(ev.event).toBe('restored');
    expect(ev.dots).toBe(2);
    expect(ev.chapter_number).toBe(9);
    delete stateMod.currentChapterNumber;
  });

  it('AC11 — the resolver tolerates chapter_number absent without throwing', () => {
    const c = mkChar([
      { category: 'general', name: 'Resources', cp: 4 },
      oath('Resources', 3, [{ event: 'exited', reason: 'broken', at: '2026-08-07' }]),
    ]);
    expect(() => H.applySuspensions(c)).not.toThrow();
    expect(c.merits[0]._suspended_dots).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC5 — suspension applies to EVERY merit category (the property sweep)
// ─────────────────────────────────────────────────────────────────────────────

describe('OATH-B AC5 — suspension reaches every merit category', () => {
  // ADR-010 D2 and story AC5 said the general fall-through "applies to every
  // merit category". Measured, that is false: meritEffectiveRating returns
  // early for CAP_DOMAIN, MULTI_INSTANCE_DOMAIN and shared_with, so a
  // fall-through-only subtraction left four of these seven unsuspended —
  // silently, with correct-looking history and an unchanged sheet. ADR-010
  // D1's own worked example pledges Safe Place, one of the missed cases.
  //
  // This sweep is permanent rather than a one-off probe: it is exactly the
  // property that regresses silently when someone adds a fourth early return.
  const CATEGORIES = [
    ['general',                { category: 'general',   name: 'Resources', cp: 3 }],
    ['influence',              { category: 'influence', name: 'Contacts', qualifier: 'Police', cp: 3 }],
    ['domain plain',           { category: 'domain',    name: 'Herd', cp: 3 }],
    ['domain MULTI_INSTANCE',  { category: 'domain',    name: 'Safe Place', qualifier: 'A', cp: 3 }],
    ['domain MULTI_INSTANCE 2',{ category: 'domain',    name: 'Feeding Grounds', qualifier: 'A', cp: 3 }],
    ['domain CAP_DOMAIN',      { category: 'domain',    name: 'Haven', cp: 3 }],
    ['domain shared',          { category: 'domain',    name: 'Herd', cp: 3, shared_with: ['Someone'] }],
  ];

  for (const [label, target] of CATEGORIES) {
    it(`${label}: a 2-dot suspension reduces the effective rating`, () => {
      const t = { ...target };
      const c = mkChar([t, oath(t.name, 2, [EXITED('broken')], t.qualifier || null)]);
      const before = meritEffectiveRating(c, t);
      H.applySuspensions(c);
      const after = meritEffectiveRating(c, t);
      expect(t._suspended_dots).toBe(2);
      expect(after, `${label}: ${before} -> ${after}`).toBe(Math.max(0, before - 2));
      expect(after).toBeLessThan(before);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// The two cases the SM asked to be converted from argument into check
// ─────────────────────────────────────────────────────────────────────────────

describe('OATH-B — shared totals and the cap floor', () => {
  it('SHARED + CAPPED: subtraction happens on the OWN term, before combination and capping', () => {
    // ADR-010 Rev 4. The earlier reasoning was that pledged <= own <= total,
    // so subtracting at the exported exit could never eat into the partner's
    // dots. That holds only while the cap does not bind. `domMeritTotal` ends
    // `Math.min(cap, total)` with cap 5, so when own + partner exceeds 5 the
    // total is COMPRESSED and subtracting the full pledge from the compressed
    // figure takes more than the owner ever contributed.
    //
    //   Safe Place, own 4, partner 3, pledge 4, broken:
    //     unsuspended            min(5, 4+3) = 5
    //     subtract at exit        5 - 4      = 1   WRONG, and below partner
    //     subtract on own first  min(5, 0+3) = 3   CORRECT
    //
    // Both clauses below are therefore mutually unsatisfiable under
    // exit-subtraction — which is the point: the assertion is what forces the
    // ordering, and weakening either clause would make it green and wrong.
    const owner = { category: 'domain', name: 'Safe Place', qualifier: 'A', cp: 4 };
    const partner = {
      _id: 'c-partner', name: 'Partner', merits: [
        { category: 'domain', name: 'Safe Place', qualifier: 'A', cp: 3 },
      ],
      status: { covenant: {} },
    };
    owner.shared_with = ['Partner'];
    const c = mkChar([owner, oath('Safe Place', 4, [EXITED('broken')], 'A')]);
    stateMod.chars = [c, partner];

    const unsuspended = meritEffectiveRating(c, owner);
    expect(unsuspended).toBe(5);                    // the cap is genuinely binding

    H.applySuspensions(c);
    const after = meritEffectiveRating(c, owner);
    const partnerContribution = 3;

    // The owner keeps exactly what the partner brings, and nothing of their own.
    expect(after).toBe(3);
    expect(after).toBeGreaterThanOrEqual(partnerContribution);
  });

  it('SHARED, uncapped: the owner loses exactly the suspended amount', () => {
    // The case the original reasoning covered, kept so the corrected ordering
    // is shown not to have broken it.
    const owner = { category: 'domain', name: 'Safe Place', qualifier: 'B', cp: 2, shared_with: ['Partner'] };
    const partner = {
      _id: 'c-partner', name: 'Partner', merits: [
        { category: 'domain', name: 'Safe Place', qualifier: 'B', cp: 1 },
      ],
      status: { covenant: {} },
    };
    const c = mkChar([owner, oath('Safe Place', 2, [EXITED('broken')], 'B')]);
    stateMod.chars = [c, partner];
    expect(meritEffectiveRating(c, owner)).toBe(3);  // 2 + 1, under the cap
    H.applySuspensions(c);
    expect(meritEffectiveRating(c, owner)).toBe(1);  // own 2 suspended, partner 1 remains
  });

  it('CAP_DOMAIN: effective can be BELOW owned, and the floor holds at zero', () => {
    // Haven is capped, so this is the one branch where effective < owned and
    // the subtraction is doing the most work. 4 own dots capped at 2, pledge
    // 4, break: 2 - 4 must floor at 0, not go negative.
    const haven = { category: 'domain', name: 'Haven', cp: 4, attached_to: { destination: 'Safe Place (A)' } };
    const c = mkChar([
      { category: 'domain', name: 'Safe Place', qualifier: 'A', cp: 2 },
      haven,
      oath('Haven', 4, [EXITED('broken')]),
    ]);
    const capped = meritEffectiveRating(c, haven);
    expect(capped).toBeLessThan(meritRating(c, haven));   // the cap is live

    H.applySuspensions(c);
    const after = meritEffectiveRating(c, haven);
    expect(after).toBe(0);
    expect(after).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC6 — HARD BOUNDARY: owned dots and XP are untouched
// ─────────────────────────────────────────────────────────────────────────────

describe('OATH-B AC6 — breaking an oath costs ACCESS, not XP', () => {
  function broken() {
    const c = mkChar([
      { category: 'general', name: 'Resources', cp: 0, xp: 4 },
      oath('Resources', 3, [EXITED('broken')]),
    ]);
    H.applySuspensions(c);
    return c;
  }

  it('meritRating (OWNED) is unchanged by a suspension', () => {
    const c = broken();
    expect(c.merits[0]._suspended_dots).toBe(3);   // the suspension is live
    expect(meritRating(c, c.merits[0])).toBe(4);   // owned is untouched
  });

  it('meritFreeSum is unchanged by a suspension', () => {
    const c = broken();
    expect(meritFreeSum(c.merits[0])).toBe(0);
  });

  it('xp.js contains no suspension symbol at all', () => {
    // Suspension reaching XP accounting would make xpLeft jump on breach —
    // a rules error, and the exact thing the hard boundary forbids.
    const src = read('public/js/editor/xp.js');
    for (const sym of ['_suspended_dots', 'applySuspensions', 'oathSuspendedDots', 'applySuspensionTo']) {
      expect(src, `xp.js must not reference ${sym}`).not.toContain(sym);
    }
  });

  it('the three MUST-BYPASS sites still read OWNED dots', () => {
    // Ma'at's list. Routing any of these through the effective helper would
    // be a defect, not coverage.
    //
    // edit.js is the subtle one: OATH-A's pledge floor clamps against OWNED.
    // If a suspension lowered that floor, breaking an oath would unlock
    // selling the very dots that were staked — a loop where the penalty
    // removes its own collateral.
    expect(read('public/js/editor/edit.js')).not.toContain('_suspended_dots');
    expect(read('public/js/data/audit.js')).not.toContain('_suspended_dots');
    expect(read('public/js/editor/xp.js')).not.toContain('_suspended_dots');
  });

  it('the pledge floor still clamps against owned dots after a breach', () => {
    // The behavioural form of the above: with 4 owned and 3 suspended, the
    // floor must still be computed from 4 — the staked dots stay unsellable.
    expect(H.pledgedDots(broken(), { name: 'Resources' })).toBe(3);
    expect(meritRating(broken(), broken().merits[0])).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC7 — the read-path audit, PER SURFACE
// ─────────────────────────────────────────────────────────────────────────────

describe('OATH-B AC7 — every surface that displays merit dots reflects a suspension', () => {
  // Asserted on RENDERED OUTPUT, not by calling meritEffectiveRating through
  // N callers — that would demonstrate the helper works, which is not in
  // doubt, and is the same mechanism-for-property substitution that cost
  // three rounds on OATH-A's AC6.
  //
  // Scope of this audit, stated rather than left implicit:
  //   - The 9 files consuming meritEffectiveRating inherit the behaviour by
  //     construction; the two RENDERING surfaces are asserted below.
  //   - 3 sites bypass by design and MUST keep bypassing (asserted above).
  //   - 3 sites bypassed and displayed stale dots; all three are fixed and
  //     asserted below.
  //   - tabs/wizard.js is EXCLUDED: character creation cannot have a broken
  //     oath, since a character that does not exist yet has no oath history,
  //     and OATH-A's pledge editor lives in the sheet editor rather than the
  //     wizard. Stated so the boundary can be re-examined — if oaths ever
  //     become creatable at character creation, this exclusion needs
  //     revisiting.
  //   - public/js/suite and public/js/game contain NO merit-dot reads, so
  //     "every read that ROLLS merit dots" is an EMPTY SET. Recorded as an
  //     emptiness observation, deliberately NOT asserted as coverage: a test
  //     over an empty set passes because there is nothing in it.

  function suspendedChar() {
    const c = mkChar([
      { category: 'general', name: 'Resources', cp: 4, xp: 0 },
      { category: 'domain',  name: 'Safe Place', qualifier: 'A', cp: 3 },
      oath('Resources', 3, [EXITED('broken')]),
    ]);
    H.applySuspensions(c);
    stateMod.chars = [c]; stateMod.editIdx = 0;
    return c;
  }

  it('SURFACE: the general-merit sheet renders the reduced dots in BOTH modes', () => {
    const c = suspendedChar();
    stateMod.editMode = true;
    const edit = shRenderGeneralMerits(c, true);
    stateMod.editMode = false;
    const view = shRenderGeneralMerits(c, false);
    // 4 owned, 3 suspended -> 1 effective. The unsuspended render would show
    // four filled dots.
    for (const html of [edit, view]) {
      expect(html).not.toContain('●●●●');
    }
  });

  it('SURFACE: the domain-merit sheet renders in BOTH modes without leaking unsuspended dots', () => {
    const c = mkChar([
      { category: 'domain', name: 'Herd', cp: 4 },
      oath('Herd', 3, [EXITED('broken')]),
    ]);
    H.applySuspensions(c);
    stateMod.chars = [c]; stateMod.editIdx = 0;
    stateMod.editMode = true;
    const edit = shRenderDomainMerits(c, true);
    stateMod.editMode = false;
    const view = shRenderDomainMerits(c, false);
    expect(meritEffectiveRating(c, c.merits[0])).toBe(1);
    for (const html of [edit, view]) {
      expect(typeof html).toBe('string');
      expect(html).not.toContain('●●●●');
    }
  });

  it('SURFACE: the Contacts AGGREGATE row reflects a suspension on one instance', () => {
    // Contacts renders as ONE row summed across every instance, while a
    // suspension is per-instance — so the suspension has to be summed over
    // the same instance set rather than applied to the aggregate.
    //
    // The original sweep used a plain Allies row and never exercised this
    // path at all, which is its own small lesson: a sweep is only as wide as
    // its fixtures, and "influence" is not one shape.
    const c = mkChar([
      { category: 'influence', name: 'Contacts', qualifier: 'Police', cp: 3, rating: 3 },
      { category: 'influence', name: 'Contacts', qualifier: 'Press', cp: 2, rating: 2 },
      oath('Contacts', 3, [EXITED('broken')], 'Police'),
    ]);
    H.applySuspensions(c);
    expect(c.merits[0]._suspended_dots).toBe(3);
    expect(c.merits[1]._suspended_dots).toBeUndefined();   // only one instance pledged

    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = false;
    const view = shRenderInfluenceMerits(c, false);
    // Aggregate purchased is 5; 3 suspended leaves 2 usable.
    expect(view).not.toContain('●●●●●');
    expect(view).toContain('●●');
  });

  it('FIXED BYPASS: the downtime contact dot display subtracts the suspension', () => {
    const src = read('public/js/tabs/downtime-form.js');
    expect(src).toContain("'\\u25CF'.repeat(applySuspensionTo(m, m.rating || 1))");
  });

  it('FIXED BYPASS: the Mandragora Garden cap subtracts the suspension', () => {
    const src = read('public/js/tabs/downtime-form.js');
    expect(src).toContain('applySuspensionTo(mgMerit,');
  });

  it('FIXED BYPASS: the merit cache key changes when a suspension appears', () => {
    // Ma'at's sharpest find, and the one no render assertion could catch: a
    // CACHE KEY, not a display. `rating` is owned and does not move on
    // breach, so without this the cached downtime entry stays keyed to dots
    // the character can no longer use.
    const src = read('public/js/tabs/downtime-form.js');
    expect(src).toContain('_susp${merit._suspended_dots}');
    // And the key is byte-identical when nothing is suspended, so no
    // previously-saved response is orphaned.
    expect(src).toContain("merit._suspended_dots ? `_susp${merit._suspended_dots}` : ''");
  });

  it('PRESENTATION: suspended dots vanish from the SOLID band; the hollow band never shrinks', () => {
    // Peter's ruling 2026-08-07: the dot row means what you can use right
    // now. Suspended dots vanish rather than rendering hollow, because ○
    // already means "bonus" and reusing it would make it mean "bonus OR
    // suspended" with nothing telling them apart.
    //
    // The hollow half is the invariant the comment on shDotsSuspended
    // promises: bonus dots are not pledgeable (pledges are measured in
    // meritRating terms), so they are never what is lost. If a suspension
    // ever ate into the hollow band it would mean something upstream is
    // treating bonus dots as pledgeable — a bug, not a display choice — so
    // it is asserted rather than left to the floor to absorb silently.
    const c = mkChar([
      // 2 purchased + 2 bonus (free_mci counts as a bonus band dot here).
      { category: 'general', name: 'Resources', cp: 2, xp: 0, free_grants: { mci: 2 } },
      oath('Resources', 2, [EXITED('broken')]),
    ]);
    H.applySuspensions(c);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = true;
    const html = shRenderGeneralMerits(c, true);

    const solid = (html.match(/●/g) || []).length;
    const hollow = (html.match(/○/g) || []).length;
    // 2 purchased - 2 suspended = 0 solid; the 2 bonus dots are untouched.
    expect(solid, 'solid band should have shrunk to 0').toBe(0);
    expect(hollow, 'hollow band must NOT shrink').toBeGreaterThanOrEqual(2);
  });

  it('STATED EXCLUSION: the virtual compound row is deliberately NOT suspended', () => {
    // sheet.js:1348 renders a partner-only row with _vOwn hardcoded to 0.
    // The row exists BECAUSE the character does not own that merit, and a
    // merit you do not own cannot be pledged — so there is nothing to
    // suspend. Stated rather than silently skipped: a deliberate exclusion
    // that is not written down reads as an oversight to whoever finds it.
    const src = read('public/js/editor/sheet.js');
    expect(src).toContain('const _vOwn = 0;');
    expect(src).toContain('const _vDots = shDotsMixed(_vOwn, _vPartner);');
  });

  it('STATED EXCLUSION: fighting styles and manoeuvres are not merits', () => {
    // Two more two-band dot emitters exist at the fighting-style and
    // manoeuvre rows. They are not merit dots, cannot be pledged against an
    // oath, and are deliberately excluded — stated rather than silently
    // skipped, so the boundary can be re-examined rather than mistaken for
    // an oversight.
    const src = read('public/js/editor/sheet.js');
    expect(src).toContain('_fsPurch');
    expect(src).toContain('_fmPurch');
    expect(src).not.toContain('shDotsSuspended(_fsPurch');
    expect(src).not.toContain('shDotsSuspended(_fmPurch');
  });

  it('EMPTINESS (not a coverage claim): the roller reads no merit dots', () => {
    // Named as an emptiness observation on purpose. Asserting "the roller
    // reflects suspension" would pass because the roller reads no merit dots
    // at all — vacuous, the same shape as the converse assertion that had to
    // be rewritten on OATH-A.
    const rollerFiles = ['public/js/game/tracker.js'];
    for (const f of rollerFiles) {
      let src = '';
      try { src = read(f); } catch { continue; }
      expect(src).not.toMatch(/meritRating\(|meritEffectiveRating\(/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC8 — _suspended_dots never persists
// ─────────────────────────────────────────────────────────────────────────────

describe('OATH-B AC8 — _suspended_dots is transient', () => {
  it('is stripped per merit by charsForSave, while the in-memory object keeps it', async () => {
    const exportMod = await import(pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'editor', 'export.js')).href);
    const c = mkChar([
      { category: 'general', name: 'Resources', cp: 4 },
      oath('Resources', 3, [EXITED('broken')]),
    ]);
    H.applySuspensions(c);
    expect(c.merits[0]._suspended_dots).toBe(3);

    // charsForSave() reads state.chars rather than taking an argument.
    stateMod.chars = [c];
    const saved = exportMod.charsForSave();
    const savedMerit = saved[0].merits.find(m => m.name === 'Resources');
    expect(savedMerit._suspended_dots).toBeUndefined();
    expect(Object.keys(savedMerit).some(k => k.startsWith('_'))).toBe(false);
    // Copy-only: the live object must still carry it for this render.
    expect(c.merits[0]._suspended_dots).toBe(3);
    // sworn_by itself is NOT underscore-prefixed and MUST persist.
    const savedOath = saved[0].merits.find(m => m.name === 'Oath Of Fealty');
    expect(savedOath.sworn_by.history).toHaveLength(1);
  });

  it('applySuspensions deletes the key rather than writing 0 when nothing is suspended', () => {
    const c = mkChar([
      { category: 'general', name: 'Resources', cp: 4 },
      oath('Resources', 3, [EXITED('broken'), RESTORED(3)]),
    ]);
    H.applySuspensions(c);
    expect('_suspended_dots' in c.merits[0]).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC9 / AC10 — the forfeiture discriminator, default variant only
// ─────────────────────────────────────────────────────────────────────────────

describe('OATH-B AC9/AC10 — forfeiture ships the default variant only', () => {
  it('absent forfeiture resolves to the default schedule', () => {
    expect(H.resolveForfeitureSchedule(null)).toEqual({
      type: 'chapter_span_then_monthly', chapters: 2, restore_per_month: 1,
    });
    expect(H.resolveForfeitureSchedule({})).toEqual({
      type: 'chapter_span_then_monthly', chapters: 2, restore_per_month: 1,
    });
  });

  it('the default variant round-trips its parameters', () => {
    const r = { forfeiture: { type: 'chapter_span_then_monthly', chapters: 3, restore_per_month: 2 } };
    expect(H.resolveForfeitureSchedule(r)).toEqual({
      type: 'chapter_span_then_monthly', chapters: 3, restore_per_month: 2,
    });
  });

  it('an unknown type warns and falls back to the default rather than releasing dots', () => {
    // A schedule nobody recognises must not silently mean "no forfeiture".
    const warned = [];
    const orig = console.warn;
    console.warn = (...a) => warned.push(a.join(' '));
    try {
      expect(H.resolveForfeitureSchedule({ forfeiture: { type: 'some_future_schedule' } }).type)
        .toBe('chapter_span_then_monthly');
    } finally { console.warn = orig; }
    expect(warned.join(' ')).toContain('some_future_schedule');
  });

  it('the session variant is NOT shipped — the schema refuses it', () => {
    // Its whole content is "this ends at the end of the session"; with
    // restoration deferred nothing ends it, so accepting it would let an ST
    // author a suspension that never terminates. Enforced at the schema so
    // it cannot be seeded around — which is how the oath rows came to exist
    // failing their own validator in the first place.
    const src = read('server/schemas/purchasable_power.schema.js');
    expect(src).toContain("enum: ['chapter_span_then_monthly']");
    expect(src).not.toMatch(/enum:\s*\[[^\]]*'session'/);
    // And the resolver does not special-case it either.
    expect(H.resolveForfeitureSchedule({ forfeiture: { type: 'session', sessions: 1 } }).type)
      .toBe('chapter_span_then_monthly');
  });

  it('no wall-clock arithmetic anywhere in the suspension path', () => {
    // A chapter IS a month, so the mechanic anchors on chapter_number end to
    // end. ADR-010 Rev 1 argued for date arithmetic and was retracted;
    // reaching for a timer means following withdrawn reasoning.
    const src = read('public/js/data/rules-helpers.js');
    const block = src.slice(src.indexOf('OATH-B (issue #1111'));
    expect(block).not.toMatch(/Date\.now|getTime|setMonth|addMonths|millisecond/);
  });
});
