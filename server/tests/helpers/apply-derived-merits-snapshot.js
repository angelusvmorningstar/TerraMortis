/**
 * Snapshot helper and fixture factory for the applyDerivedMerits harness.
 *
 * ## Pattern (copy this in RDE-3+ migration stories)
 *
 * 1. Build a fixture and deep-clone before each call — applyDerivedMerits
 *    mutates in place, so fixtures must not bleed state between tests:
 *      const c = fixture('Char').withPT({ rating: 4 }).build();
 *      applyDerivedMerits(c, []);
 *      const snap = snapshotCharacter(c);
 *
 * 2. Normalisation rules applied by snapshotCharacter():
 *    - Sets → sorted arrays (deterministic order for deep-equal).
 *    - Merits sorted by (name, granted_by, qualifier) triple — NOT by _id.
 *      Auto-created merits from different evaluators may have different _ids;
 *      the triple is the stable identity per ADR-001.
 *    - _grant_pools sorted by source name.
 *
 * 3. Cross-character families: buildFixturePair(nameA, nameB) returns two
 *    FixtureBuilders. Call .build() on each, then pass both as allChars:
 *      const [lb, pb] = buildFixturePair('Lead', 'Partner');
 *      const lead = lb.build();
 *      const partner = pb.build();
 *      applyDerivedMerits(lead, [lead, partner]);
 */

// ── Snapshot ─────────────────────────────────────────────────────────────────

function normaliseMerits(merits) {
  return (merits || []).map(m => ({
    name: m.name,
    granted_by: m.granted_by ?? null,
    qualifier: m.qualifier ?? null,
    area: m.area ?? null,
    rating: m.rating ?? 0,
    free: m.free ?? 0,
    free_bloodline: m.free_bloodline ?? 0,
    free_pet: m.free_pet ?? 0,
    free_mci: m.free_mci ?? 0,
    free_vm: m.free_vm ?? 0,
    free_lk: m.free_lk ?? 0,
    free_ohm: m.free_ohm ?? 0,
    free_inv: m.free_inv ?? 0,
    free_pt: m.free_pt ?? 0,
    free_mdb: m.free_mdb ?? 0,
    free_sw: m.free_sw ?? 0,
  })).sort((a, b) => {
    const n = a.name.localeCompare(b.name);
    if (n !== 0) return n;
    const g = (a.granted_by || '').localeCompare(b.granted_by || '');
    if (g !== 0) return g;
    const q = (a.qualifier || '').localeCompare(b.qualifier || '');
    if (q !== 0) return q;
    return (a.area || '').localeCompare(b.area || '');
  });
}

function normalisePool(p) {
  const entry = { source: p.source, category: p.category, amount: p.amount };
  if (p.names) entry.names = [...p.names].sort();
  else entry.name = p.name;
  return entry;
}

const setToArr = s => (s instanceof Set ? [...s].sort() : []);

/**
 * Produce a deterministic plain-object snapshot of every observable
 * side-effect written by applyDerivedMerits.
 */
export function snapshotCharacter(c) {
  return {
    _pt_nine_again_skills: setToArr(c._pt_nine_again_skills),
    _pt_dot4_bonus_skills: setToArr(c._pt_dot4_bonus_skills),
    _mci_dot3_skills: setToArr(c._mci_dot3_skills),
    _ohm_nine_again_skills: setToArr(c._ohm_nine_again_skills),
    _grant_pools: (c._grant_pools || []).map(normalisePool)
      .sort((a, b) => a.source.localeCompare(b.source)),
    _mci_free_specs: (c._mci_free_specs || [])
      .slice()
      .sort((a, b) => a.skill.localeCompare(b.skill) || a.spec.localeCompare(b.spec)),
    _bloodline_free_specs: (c._bloodline_free_specs || [])
      .slice()
      .sort((a, b) => a.skill.localeCompare(b.skill) || a.spec.localeCompare(b.spec)),
    _ots_covenant_bonus: c._ots_covenant_bonus ?? 0,
    _ots_free_dots: c._ots_free_dots ?? 0,
    merits: normaliseMerits(c.merits),
  };
}

// ── Fixture factory ───────────────────────────────────────────────────────────

function baseChar(name = 'Test Character') {
  return {
    name,
    clan: 'Daeva',
    bloodline: null,
    covenant: 'Invictus',
    humanity: 7,
    attributes: {
      Strength: { dots: 2, bonus: 0 },
      Dexterity: { dots: 2, bonus: 0 },
      Stamina: { dots: 2, bonus: 0 },
      Presence: { dots: 2, bonus: 0 },
      Manipulation: { dots: 2, bonus: 0 },
      Composure: { dots: 2, bonus: 0 },
      Intelligence: { dots: 2, bonus: 0 },
      Wits: { dots: 2, bonus: 0 },
      Resolve: { dots: 2, bonus: 0 },
    },
    skills: {},
    disciplines: {},
    merits: [],
    powers: [],
    fighting_styles: [],
    status: { clan: 0, covenant: {} },
  };
}

class FixtureBuilder {
  constructor(name) {
    this._c = baseChar(name);
  }

  /** Override an attribute: fixture().attr('Strength', { dots: 3, bonus: 1 }) */
  attr(name, { dots = 0, bonus = 0 } = {}) {
    this._c.attributes[name] = { dots, bonus };
    return this;
  }

  /** Add a skill entry. */
  skill(name, { dots = 0, bonus = 0, specs = [], nine_again = false } = {}) {
    this._c.skills[name] = { dots, bonus, specs, nine_again };
    return this;
  }

  /** Append a raw merit object (all fields explicit). */
  merit(m) {
    this._c.merits.push(m);
    return this;
  }

  /** Append a Professional Training merit. */
  withPT({ rating = 1, assetSkills = [], dot4Skill = null, role = '' } = {}) {
    this._c.merits.push({
      name: 'Professional Training',
      category: 'general',
      cp: rating,
      xp: 0,
      free: 0,
      free_mci: 0,
      rating: 0,
      role,
      asset_skills: assetSkills,
      dot4_skill: dot4Skill,
    });
    return this;
  }

  /** Append an MCI merit. */
  withMCI({
    rating = 1,
    dot1Choice = 'merits',
    dot3Choice = 'merits',
    dot5Choice = 'merits',
    dot1SpecSkill = null,
    dot1Spec = null,
    dot3Skill = null,
    cult = null,
    active = true,
  } = {}) {
    this._c.merits.push({
      name: 'Mystery Cult Initiation',
      category: 'standing',
      cp: rating,
      xp: 0,
      free: 0,
      free_mci: 0,
      rating: 0,
      dot1_choice: dot1Choice,
      dot3_choice: dot3Choice,
      dot5_choice: dot5Choice,
      dot1_spec_skill: dot1SpecSkill,
      dot1_spec: dot1Spec,
      dot3_skill: dot3Skill,
      cult_name: cult,
      active,
    });
    return this;
  }

  /** Add an OHM pact to c.powers. */
  withOHM({ sphere = '', skills = [] } = {}) {
    this._c.powers.push({
      name: 'Oath of the Hard Motherfucker',
      category: 'pact',
      cp: 1,
      xp: 0,
      ohm_allies_sphere: sphere,
      ohm_skills: skills,
    });
    return this;
  }

  /** Add a Safe Word pact to c.powers. */
  withSafeWord({ partner = '', sharedMerit = '' } = {}) {
    this._c.powers.push({
      name: 'Oath of the Safe Word',
      category: 'pact',
      cp: 1,
      xp: 0,
      partner,
      shared_merit: sharedMerit,
    });
    return this;
  }

  /** Add a K-9 or Falconry fighting style. */
  withPetStyle(styleName = 'K-9', { rating = 1 } = {}) {
    this._c.fighting_styles.push({
      name: styleName,
      type: 'style',
      cp: rating,
      xp: 0,
      free: 0,
      free_mci: 0,
      free_ots: 0,
    });
    return this;
  }

  /** Set the character's bloodline. */
  withBloodline(bl) {
    this._c.bloodline = bl;
    return this;
  }

  /** Set the character's covenant and its status value. */
  withCovenant(cov, status = 0) {
    this._c.covenant = cov;
    this._c.status.covenant[cov] = status;
    return this;
  }

  /** Add the Invested merit and set Invictus status. */
  withInvested(invictusStatus = 1) {
    this._c.covenant = 'Invictus';
    this._c.status.covenant['Invictus'] = invictusStatus;
    this._c.merits.push({ name: 'Invested', category: 'general', cp: 1, xp: 0, free: 0 });
    return this;
  }

  /** Add the Lorekeeper merit and a Library merit with the given purchased dots. */
  withLorekeeper(libraryDots = 2) {
    this._c.merits.push({ name: 'Lorekeeper', category: 'general', cp: 1, xp: 0, free: 0 });
    if (libraryDots > 0) {
      this._c.merits.push({ name: 'Library', category: 'general', cp: libraryDots, xp: 0, free: 0 });
    }
    return this;
  }

  /** Add the Mother-Daughter Bond merit, a Mentor merit, and optionally the target Crúac style. */
  withMDB({ styleName = 'Opening the Void', mentorCp = 3, addStyle = true } = {}) {
    this._c.covenant = 'Lancea et Sanctum';
    this._c.merits.push({ name: 'The Mother-Daughter Bond', category: 'general', qualifier: styleName, cp: 1, xp: 0, free: 0, free_mdb: 0 });
    if (mentorCp > 0) {
      this._c.merits.push({ name: 'Mentor', category: 'influence', cp: mentorCp, xp: 0, free: 0 });
    }
    if (addStyle && styleName) {
      this._c.merits.push({ name: styleName, category: 'general', cp: 0, xp: 0, free: 0, free_mdb: 0 });
    }
    return this;
  }

  /** Add an Oath of the Scapegoat pact to c.powers. */
  withOTS({ cp = 1, xp = 0 } = {}) {
    this._c.powers.push({
      name: 'Oath of the Scapegoat',
      category: 'pact',
      cp,
      xp,
    });
    return this;
  }

  /** Add the Viral Mythology merit and an Allies merit with the given purchased CP dots. */
  withViralMythology(alliesCp = 2, { area = 'Police', xp = 0, free_mci = 0 } = {}) {
    this._c.covenant = 'Circle of the Crone';
    this._c.merits.push({ name: 'Viral Mythology', category: 'general', cp: 1, xp: 0, free: 0 });
    if (alliesCp > 0 || xp > 0) {
      this._c.merits.push({ name: 'Allies', category: 'influence', area, cp: alliesCp, xp, free_mci, free: 0 });
    }
    return this;
  }

  /** Deep-clone and return the finished character. */
  build() {
    return JSON.parse(JSON.stringify(this._c));
  }
}

/** Create a fluent fixture builder for a single character. */
export function fixture(name = 'Test Character') {
  return new FixtureBuilder(name);
}

/** Create a simple character object from literal overrides (no builder). */
export function buildFixtureCharacter(overrides = {}) {
  const c = JSON.parse(JSON.stringify(baseChar()));
  return Object.assign(c, overrides);
}

/** Return two independent FixtureBuilders for cross-character scenarios. */
export function buildFixturePair(nameA = 'Alpha', nameB = 'Beta') {
  return [new FixtureBuilder(nameA), new FixtureBuilder(nameB)];
}
