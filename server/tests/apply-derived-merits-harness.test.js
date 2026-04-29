/**
 * Snapshot harness for applyDerivedMerits.
 *
 * ## Triage table (2026-04-29)
 *
 * All findings from the bonus-dot audit are classified preserve-as-bug-for-bug:
 *
 * | Finding | Code location | Classification | Note |
 * |---|---|---|---|
 * | A: vmAlliesPool counts free_mci — contradicts "CP/XP only" rule | domain.js:179 | preserve (intended) | User confirmed working as intended |
 * | B: PT/MCI early rating sync misses free_mci and other grant channels | mci.js:37-41, 87-89 | preserve — no live char affected; fix proposed in RDE-2.x | |
 * | C: MDB mentorRating misses free_bloodline + free_sw | mci.js:247 | preserve — theoretical, no live case | |
 * | D: K-9 activation reads fs.up (dead code) | mci.js:71 | preserve — absent from all production fighting styles | |
 * | E: Final rating sync excludes m.free | mci.js:324 | preserve — no live merit has non-zero generic free | |
 *
 * ## Template for RDE-3+ migration stories
 *
 * Copy any test below as a starting point. Key conventions:
 *   const c = fixture('Name').withPT({...}).build();   // deep-clones on .build()
 *   applyDerivedMerits(c, []);
 *   const snap = snapshotCharacter(c);
 *   expect(snap.<field>).toEqual(<expected>);
 */

import { vi, describe, it, expect } from 'vitest';

// Mock loader.js before any other imports — prevents api.js (browser-only)
// from being evaluated transitively through merits.js → loader.js → api.js.
vi.mock('../../public/js/data/loader.js', () => ({
  getRulesByCategory: () => [],
  getRuleByKey: () => null,
  getRulesDB: () => [],
  sanitiseChar: c => c,
  loadCharsFromApi: async () => null,
}));

// Mock load-rules.js — post-flip mci.js imports this, which pulls in api.js.
// Supply canonical PT and MCI rules so both evaluators fire correctly in harness tests.
vi.mock('../../public/js/editor/rule_engine/load-rules.js', () => ({
  preloadRules: async () => {},
  invalidateRulesCache: () => {},
  getRulesCache: () => null,
  getRulesBySource: (source) => {
    if (source === 'Professional Training') {
      return {
        grants:          [{ source: 'Professional Training', tier: 1, grant_type: 'merit', target: 'Contacts', amount: 2, amount_basis: 'flat' }],
        nineAgain:       [{ source: 'Professional Training', tier: 2, target_skills: 'asset_skills' }],
        skillBonus:      [{ source: 'Professional Training', tier: 4, target_skill: 'dot4_skill', amount: 1, cap_at: 5 }],
        specialityGrants:[],
        tierBudget:      null,
      };
    }
    if (source === 'Mystery Cult Initiation') {
      return {
        grants: [
          { source, tier: 1, condition: 'choice', grant_type: 'pool', target: '_mci', amount: 1, amount_basis: 'flat', choice_field: 'dot1_choice', excluded_choice: 'speciality' },
          { source, tier: 2, condition: 'tier',   grant_type: 'pool', target: '_mci', amount: 1, amount_basis: 'flat' },
          { source, tier: 3, condition: 'choice', grant_type: 'pool', target: '_mci', amount: 2, amount_basis: 'flat', choice_field: 'dot3_choice', excluded_choice: 'skill' },
          { source, tier: 4, condition: 'tier',   grant_type: 'pool', target: '_mci', amount: 3, amount_basis: 'flat' },
          { source, tier: 5, condition: 'choice', grant_type: 'pool', target: '_mci', amount: 3, amount_basis: 'flat', choice_field: 'dot5_choice', excluded_choice: 'advantage' },
        ],
        nineAgain:       [],
        skillBonus:      [{ source, tier: 3, target_skill: 'dot3_skill', amount: 1, cap_at: 5 }],
        specialityGrants:[{ source, tier: 1, condition: 'choice', target_skill: 'dot1_spec_skill', spec: 'dot1_spec' }],
        tierBudget:      { source, budgets: [0, 1, 1, 2, 3, 3] },
      };
    }
    if (source === 'Oath of the Hard Motherfucker') {
      return {
        grants: [
          { source, grant_type: 'merit', target: 'Contacts',              target_category: 'influence', condition: 'pact_present', amount: 1 },
          { source, grant_type: 'merit', target: 'Resources',             target_category: 'influence', condition: 'pact_present', amount: 1 },
          { source, grant_type: 'merit', target: 'Allies',                target_category: 'influence', condition: 'pact_present', sphere_source: 'ohm_allies_sphere', amount: 1 },
          { source, grant_type: 'merit', target: 'Friends in High Places', target_category: 'general',  condition: 'pact_present', auto_create: true, amount: 1 },
        ],
        nineAgain:       [{ source, target_skills: 'ohm_skills' }],
        skillBonus:      [],
        specialityGrants:[],
        tierBudget:      null,
      };
    }
    if (source === 'Bloodline') {
      return {
        grants: [
          { source, grant_type: 'merit',     condition: 'bloodline', bloodline_name: 'Gorgons', target: 'Area of Expertise',          target_category: 'general', target_qualifier: 'snakes', amount: 1, amount_basis: 'flat', auto_create: true },
          { source, grant_type: 'merit',     condition: 'bloodline', bloodline_name: 'Gorgons', target: 'Interdisciplinary Specialty', target_category: 'general', target_qualifier: 'snakes', amount: 1, amount_basis: 'flat', auto_create: true },
          { source, grant_type: 'speciality', condition: 'bloodline', bloodline_name: 'Gorgons', target: 'Animal Ken',                  target_qualifier: 'snakes', amount: 1, amount_basis: 'flat' },
        ],
        nineAgain:       [],
        skillBonus:      [],
        specialityGrants:[],
        tierBudget:      null,
      };
    }
    if (source === 'K-9') {
      return {
        grants: [{ source: 'K-9', grant_type: 'merit', condition: 'fighting_style_present', target: 'Retainer', target_qualifier: 'Dog', amount: 1, amount_basis: 'flat', category: 'influence' }],
        nineAgain: [], skillBonus: [], specialityGrants: [], tierBudget: null,
      };
    }
    if (source === 'Falconry') {
      return {
        grants: [{ source: 'Falconry', grant_type: 'merit', condition: 'fighting_style_present', target: 'Retainer', target_qualifier: 'Falcon', amount: 1, amount_basis: 'flat', category: 'influence' }],
        nineAgain: [], skillBonus: [], specialityGrants: [], tierBudget: null,
      };
    }
    return { grants: [], nineAgain: [], skillBonus: [], specialityGrants: [], tierBudget: null };
  },
}));

import { applyDerivedMerits } from '../lib/rule_engine/_legacy-bridge.js';
import {
  snapshotCharacter,
  fixture,
  buildFixturePair,
} from './helpers/apply-derived-merits-snapshot.js';

// ── 1. Minimal character ──────────────────────────────────────────────────────

describe('minimal character — no merits, no powers', () => {
  it('all ephemerals empty, no merits', () => {
    const c = fixture().build();
    applyDerivedMerits(c, []);
    const snap = snapshotCharacter(c);

    expect(snap._pt_nine_again_skills).toEqual([]);
    expect(snap._pt_dot4_bonus_skills).toEqual([]);
    expect(snap._mci_dot3_skills).toEqual([]);
    expect(snap._ohm_nine_again_skills).toEqual([]);
    expect(snap._grant_pools).toEqual([]);
    expect(snap._mci_free_specs).toEqual([]);
    expect(snap._bloodline_free_specs).toEqual([]);
    expect(snap._ots_covenant_bonus).toBe(0);
    expect(snap._ots_free_dots).toBe(0);
    expect(snap.merits).toEqual([]);
  });
});

// ── 2. Professional Training ──────────────────────────────────────────────────

describe('Professional Training', () => {
  it('rating 4: Contacts auto-created, nine-again on all assets, dot4 skill registered', () => {
    const c = fixture()
      .withPT({ rating: 4, assetSkills: ['Brawl', 'Stealth', 'Intimidation'], dot4Skill: 'Brawl' })
      .build();
    applyDerivedMerits(c, []);
    const snap = snapshotCharacter(c);

    expect(snap._pt_nine_again_skills).toEqual(['Brawl', 'Intimidation', 'Stealth']);
    expect(snap._pt_dot4_bonus_skills).toEqual(['Brawl']);

    const contacts = snap.merits.find(m => m.name === 'Contacts');
    expect(contacts).toBeTruthy();
    expect(contacts.free_pt).toBe(2);
    expect(contacts.rating).toBe(2);
  });

  it('rating 1: only Contacts auto-created, no nine-again', () => {
    const c = fixture()
      .withPT({ rating: 1, assetSkills: ['Brawl'] })
      .build();
    applyDerivedMerits(c, []);
    const snap = snapshotCharacter(c);

    expect(snap._pt_nine_again_skills).toEqual([]);
    expect(snap._pt_dot4_bonus_skills).toEqual([]);
    const contacts = snap.merits.find(m => m.name === 'Contacts');
    expect(contacts).toBeTruthy();
    expect(contacts.free_pt).toBe(2);
  });

  it('existing Contacts is boosted, not duplicated', () => {
    const c = fixture()
      .merit({ name: 'Contacts', category: 'influence', area: 'Streetwise', cp: 2, xp: 0, free: 0 })
      .withPT({ rating: 2, assetSkills: ['Brawl', 'Stealth'] })
      .build();
    applyDerivedMerits(c, []);
    const snap = snapshotCharacter(c);

    const contactsMerits = snap.merits.filter(m => m.name === 'Contacts');
    expect(contactsMerits).toHaveLength(1);
    expect(contactsMerits[0].free_pt).toBe(2);
  });

  // Preservation of finding B: PT with free_mci dots does not count toward the
  // early rating sync. A character with cp:2, free_mci:2 has effective PT rating 4
  // but the early sync only sees cp:2 — dot3 threshold (nine_again) fires but
  // dot4 threshold does NOT. Remove this test comment when RDE-2.x is resolved.
  it('finding B preserved: PT funded by free_mci — early sync reads cp only', () => {
    const c = fixture()
      .merit({
        name: 'Professional Training',
        category: 'general',
        cp: 2,
        xp: 0,
        free: 0,
        free_mci: 2,   // effective = 4, but sync sees cp=2 only
        rating: 0,
        asset_skills: ['Brawl', 'Stealth'],
        dot4_skill: 'Brawl',
      })
      .build();
    applyDerivedMerits(c, []);
    const snap = snapshotCharacter(c);

    // Sync fires (cp=2 > 0): rating=2, so dot2 (nine-again) fires, dot4 does NOT
    expect(snap._pt_nine_again_skills).toEqual(['Brawl', 'Stealth']);
    expect(snap._pt_dot4_bonus_skills).toEqual([]); // bug preserved — would be ['Brawl'] if fixed
  });
});

// ── 3. Mystery Cult Initiation ────────────────────────────────────────────────

describe('Mystery Cult Initiation', () => {
  it('rating 5, mixed choices — correct pool total and ephemeral sets', () => {
    // dot1=speciality (0 pool), dot2=fixed+1, dot3=skill (0 pool), dot4=fixed+3, dot5=advantage (0 pool)
    // mciPoolTotal = 0+1+0+3+0 = 4
    const c = fixture()
      .withMCI({
        rating: 5,
        dot1Choice: 'speciality',
        dot1SpecSkill: 'Brawl',
        dot1Spec: 'Street Fighting',
        dot3Choice: 'skill',
        dot3Skill: 'Athletics',
        dot5Choice: 'advantage',
      })
      .build();
    applyDerivedMerits(c, []);
    const snap = snapshotCharacter(c);

    expect(snap._mci_free_specs).toEqual([{ skill: 'Brawl', spec: 'Street Fighting' }]);
    expect(snap._mci_dot3_skills).toEqual(['Athletics']);
    expect(snap._grant_pools).toEqual([
      { source: 'MCI', name: '_mci', category: 'any', amount: 4 },
    ]);
  });

  it('rating 3, all merits choices — pool total 4', () => {
    // dot1=merits(+1), dot2=fixed(+1), dot3=merits(+2) = 4
    const c = fixture()
      .withMCI({ rating: 3, dot1Choice: 'merits', dot3Choice: 'merits' })
      .build();
    applyDerivedMerits(c, []);
    const snap = snapshotCharacter(c);

    expect(snap._grant_pools).toEqual([
      { source: 'MCI', name: '_mci', category: 'any', amount: 4 },
    ]);
    expect(snap._mci_free_specs).toEqual([]);
    expect(snap._mci_dot3_skills).toEqual([]);
  });

  it('inactive MCI does not contribute to pool', () => {
    const c = fixture()
      .withMCI({ rating: 3, active: false })
      .build();
    applyDerivedMerits(c, []);
    const snap = snapshotCharacter(c);

    expect(snap._grant_pools).toEqual([]);
  });
});

// ── 4. Bonus dots on a targeted merit ────────────────────────────────────────

describe('bonus dots on merit — fixture factory can express mixed-source ratings', () => {
  it('Allies with cp:2 and free_mci:1 — final rating = 3', () => {
    const c = fixture()
      .merit({
        name: 'Allies',
        category: 'influence',
        area: 'Commerce',
        cp: 2,
        xp: 0,
        free: 0,
        free_mci: 1,
      })
      .build();
    applyDerivedMerits(c, []);
    const snap = snapshotCharacter(c);

    const allies = snap.merits.find(m => m.name === 'Allies');
    expect(allies.rating).toBe(3);
    expect(allies.free_mci).toBe(1);
  });
});

// ── 5. Bloodline grants (Gorgons) ────────────────────────────────────────────

describe('bloodline grants', () => {
  it('Gorgons: Animal Ken spec added, two merits auto-created', () => {
    const c = fixture()
      .withBloodline('Gorgons')
      .build();
    applyDerivedMerits(c, []);
    const snap = snapshotCharacter(c);

    expect(snap._bloodline_free_specs).toEqual([{ skill: 'Animal Ken', spec: 'snakes' }]);

    const aoe = snap.merits.find(m => m.name === 'Area of Expertise' && m.granted_by === 'Bloodline');
    expect(aoe).toBeTruthy();
    expect(aoe.qualifier).toBe('snakes');
    expect(aoe.free_bloodline).toBe(1);

    const ids = snap.merits.find(m => m.name === 'Interdisciplinary Specialty' && m.granted_by === 'Bloodline');
    expect(ids).toBeTruthy();
    expect(ids.qualifier).toBe('snakes');
    expect(ids.free_bloodline).toBe(1);
  });

  it('Gorgons: spec is not duplicated on second application', () => {
    const c = fixture().withBloodline('Gorgons').build();
    applyDerivedMerits(c, []);
    applyDerivedMerits(c, []);

    const specs = (c.skills?.['Animal Ken']?.specs || []).filter(s => s === 'snakes');
    expect(specs).toHaveLength(1);
  });
});

// ── 6. Oath of the Hard Motherfucker ─────────────────────────────────────────

describe('OHM pact', () => {
  it('auto-creates FHP, applies free_ohm to Contacts/Resources/chosen Allies, populates nine-again', () => {
    const c = fixture()
      .merit({ name: 'Contacts', category: 'influence', cp: 1, xp: 0, free: 0 })
      .merit({ name: 'Resources', category: 'influence', cp: 2, xp: 0, free: 0 })
      .merit({ name: 'Allies', category: 'influence', area: 'Underworld', cp: 1, xp: 0, free: 0 })
      .withOHM({ sphere: 'Underworld', skills: ['Brawl', 'Firearms'] })
      .build();
    applyDerivedMerits(c, []);
    const snap = snapshotCharacter(c);

    expect(snap._ohm_nine_again_skills).toEqual(['Brawl', 'Firearms']);

    const ohmPool = snap._grant_pools.find(p => p.category === 'ohm');
    expect(ohmPool).toBeTruthy();
    expect(ohmPool.amount).toBe(3);

    const fhp = snap.merits.find(m => m.name === 'Friends in High Places' && m.granted_by === 'OHM');
    expect(fhp).toBeTruthy();
    expect(fhp.free_ohm).toBe(1);

    const contacts = snap.merits.find(m => m.name === 'Contacts');
    expect(contacts.free_ohm).toBe(1);

    const resources = snap.merits.find(m => m.name === 'Resources');
    expect(resources.free_ohm).toBe(1);

    const allies = snap.merits.find(m => m.name === 'Allies' && m.area === 'Underworld');
    expect(allies.free_ohm).toBe(1);
  });

  it('FHP removed if OHM pact is later absent', () => {
    // First render with OHM
    const c = fixture()
      .withOHM({ sphere: '', skills: [] })
      .build();
    applyDerivedMerits(c, []);

    // Remove the pact to simulate OHM no longer present
    c.powers = [];
    applyDerivedMerits(c, []);
    const snap = snapshotCharacter(c);

    const fhp = snap.merits.find(m => m.name === 'Friends in High Places' && m.granted_by === 'OHM');
    expect(fhp).toBeUndefined();
  });
});

// ── 7. K-9 / Falconry ────────────────────────────────────────────────────────

describe('K-9 / Falconry fighting styles', () => {
  it('K-9 at rating 1 auto-creates Retainer (Dog) with free_pet:1', () => {
    const c = fixture()
      .withPetStyle('K-9', { rating: 1 })
      .build();
    applyDerivedMerits(c, []);
    const snap = snapshotCharacter(c);

    const retainer = snap.merits.find(m => m.name === 'Retainer' && m.granted_by === 'K-9');
    expect(retainer).toBeTruthy();
    expect(retainer.area).toBe('Dog');
    expect(retainer.free_pet).toBe(1);
  });

  it('Falconry auto-creates Retainer (Falcon)', () => {
    const c = fixture()
      .withPetStyle('Falconry', { rating: 1 })
      .build();
    applyDerivedMerits(c, []);
    const snap = snapshotCharacter(c);

    const retainer = snap.merits.find(m => m.name === 'Retainer' && m.granted_by === 'Falconry');
    expect(retainer).toBeTruthy();
    expect(retainer.area).toBe('Falcon');
    expect(retainer.free_pet).toBe(1);
  });

  it('Retainer not created when style has 0 effective dots', () => {
    const c = fixture()
      .withPetStyle('K-9', { rating: 0 })
      .build();
    c.fighting_styles[0].cp = 0;
    applyDerivedMerits(c, []);
    const snap = snapshotCharacter(c);

    const retainer = snap.merits.find(m => m.name === 'Retainer' && m.granted_by === 'K-9');
    expect(retainer).toBeUndefined();
  });
});

// ── 8. Multi-character: Oath of the Safe Word ─────────────────────────────────

describe('Safe Word pact — cross-character grant', () => {
  it('lead receives free_sw equal to partner shared merit dots', () => {
    const [lb, pb] = buildFixturePair('Alpha', 'Beta');

    lb.withSafeWord({ partner: 'Beta', sharedMerit: '' });

    pb.merit({ name: 'Allies', category: 'influence', area: 'Streetwise', cp: 3, xp: 0, free: 0 })
      .withSafeWord({ partner: 'Alpha', sharedMerit: 'Allies (Streetwise)' });

    const lead = lb.build();
    const partner = pb.build();

    applyDerivedMerits(lead, [lead, partner]);
    const snap = snapshotCharacter(lead);

    const swMerit = snap.merits.find(m => m.name === 'Allies' && m.granted_by === 'Safe Word');
    expect(swMerit).toBeTruthy();
    expect(swMerit.free_sw).toBe(3);
  });

  it('no grant if partner pact is not reciprocal', () => {
    const [lb, pb] = buildFixturePair('Alpha', 'Beta');

    lb.withSafeWord({ partner: 'Beta', sharedMerit: '' });
    // Beta has NO SW pact pointing back to Alpha
    pb.merit({ name: 'Allies', category: 'influence', area: 'Streetwise', cp: 3, xp: 0, free: 0 });

    const lead = lb.build();
    const partner = pb.build();

    applyDerivedMerits(lead, [lead, partner]);
    const snap = snapshotCharacter(lead);

    const swMerit = snap.merits.find(m => m.granted_by === 'Safe Word');
    expect(swMerit).toBeUndefined();
  });
});

// ── 9. Idempotency ────────────────────────────────────────────────────────────

describe('idempotency — running twice produces identical snapshots', () => {
  it('PT + MCI + OHM + bloodline: second run equals first', () => {
    const c = fixture()
      .withBloodline('Gorgons')
      .withPT({ rating: 3, assetSkills: ['Brawl', 'Stealth', 'Intimidation'] })
      .withMCI({ rating: 3 })
      .merit({ name: 'Contacts', category: 'influence', cp: 1, xp: 0, free: 0 })
      .merit({ name: 'Resources', category: 'influence', cp: 2, xp: 0, free: 0 })
      .withOHM({ sphere: 'Police', skills: ['Firearms'] })
      .build();

    applyDerivedMerits(c, []);
    const snap1 = snapshotCharacter(c);

    applyDerivedMerits(c, []);
    const snap2 = snapshotCharacter(c);

    expect(snap2).toEqual(snap1);
  });

  it('K-9 Retainer is not duplicated on second run', () => {
    const c = fixture()
      .withPetStyle('K-9', { rating: 1 })
      .build();

    applyDerivedMerits(c, []);
    applyDerivedMerits(c, []);

    const retainers = c.merits.filter(m => m.name === 'Retainer' && m.granted_by === 'K-9');
    expect(retainers).toHaveLength(1);
  });

  it('FHP is not duplicated on second run', () => {
    const c = fixture()
      .withOHM({ sphere: '', skills: [] })
      .build();

    applyDerivedMerits(c, []);
    applyDerivedMerits(c, []);

    const fhps = c.merits.filter(m => m.name === 'Friends in High Places' && m.granted_by === 'OHM');
    expect(fhps).toHaveLength(1);
  });

  it('bloodline merits not duplicated on second run', () => {
    const c = fixture()
      .withBloodline('Gorgons')
      .build();

    applyDerivedMerits(c, []);
    applyDerivedMerits(c, []);

    const aoe = c.merits.filter(m => m.name === 'Area of Expertise' && m.granted_by === 'Bloodline');
    expect(aoe).toHaveLength(1);
  });
});
