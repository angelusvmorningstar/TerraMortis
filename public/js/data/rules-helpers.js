/**
 * Rules-engine helpers shared between client (editor / suite / admin) and server
 * (character routes, evaluator-adjacent code). Pure ES module — NO browser-only
 * imports — so vitest and Node-side server code can import directly.
 *
 * Lands as part of N-1 (issue #670, ADR-005 Rev 2). Single source of truth for:
 *
 *  - `normaliseAttachedTo`        — every read of `m.attached_to` goes through
 *                                   this normaliser (Concern #11 verbatim).
 *  - `meritFreeSum`               — sum of engine-granted free dots on a merit;
 *                                   sums BOTH new `free_grants` map AND legacy
 *                                   flat `free_<slug>` fields during the
 *                                   transition (N-2 backfill removes the flat
 *                                   fallback).
 *  - `shareableSumForMerit`       — partner-shareable contribution from NEW
 *                                   Collective Compound (rule_grant.partner_
 *                                   shareable === true) sources only. Legacy
 *                                   hardcoded subsets at `domain.js:48` and
 *                                   `characters.js:195` STAY VERBATIM in N-1
 *                                   (Concern #1 Rev 2 — divergence preserved
 *                                   until the future MNEC-prerequisite audit).
 *  - `resolveSharingScope`        — dispatches on `scope.type`; first instance
 *                                   `collective_owners_of_merit`. Unknown types
 *                                   degrade to `null` (consumer falls back to
 *                                   persisted `m.shared_with`).
 *  - `synthesiseCollectiveOwners` — pure function returning the synthesised
 *                                   member list for a Collective Compound scope;
 *                                   render-time only, NEVER persisted.
 */

// ── attached_to normaliser (Concern #11) ─────────────────────────────────────

/**
 * Canonicalise `m.attached_to` to `{ origin?, destination } | null`.
 *
 *  - `null` / `undefined` / `''`          → `null`
 *  - legacy string `s`                    → `{ destination: s }`
 *  - object `{ destination, origin? }`    → pass through (already canonical)
 *  - object lacking `destination`         → `null` (defensive; malformed input)
 *
 * Every consumer that reads `m.attached_to` MUST call this and read from the
 * normalised result. Bypassing the normaliser means consumer A sees a string
 * and consumer B sees an object — the exact divergence pattern that bit
 * `domMeritShareableSingle` vs `characters.js:195`.
 *
 * @param {string | { origin?: string, destination: string } | null | undefined} at
 * @returns {{ origin?: string, destination: string } | null}
 */
export function normaliseAttachedTo(at) {
  if (at == null || at === '') return null;
  if (typeof at === 'string') return { destination: at };
  if (typeof at === 'object' && typeof at.destination === 'string' && at.destination) {
    // Pass through; origin may or may not be present (it's the bridge marker).
    return at.origin
      ? { origin: at.origin, destination: at.destination }
      : { destination: at.destination };
  }
  return null;
}

// ── meritFreeSum (D1 runtime guard) ──────────────────────────────────────────

/**
 * The 14 legacy `m.free_<slug>` channels that exist in the schema and on
 * persisted character docs pre-N-2 backfill. After N-2 these fields are
 * unset and only `m.free_grants[slug]` populates; until then `meritFreeSum`
 * sums BOTH so the transition is correctness-independent.
 *
 * Order is irrelevant (sum is commutative); listed alphabetically.
 */
const LEGACY_FREE_SLUGS = [
  'attache', 'bloodline', 'carthian', 'fwb', 'inv', 'lk', 'mci', 'mdb',
  'ohm', 'pet', 'pt', 'retainer', 'sw', 'vm',
];

/**
 * Total engine-granted free dots on a merit, summing the new `free_grants`
 * map AND the 14 legacy flat fields. During N-1 these populate disjointly —
 * NEW Collective Compound grants write to the map; legacy LK/Inv/VM/MCI
 * user-allocations stay in the flat fields; direct-write evaluators (OHM, PT,
 * Bloodline, MDB, Style-Retainer, OTS, SafeWord, AutoBonus) likewise stay on
 * flat. N-2 backfill moves persisted flat-field data to the map; once that
 * lands the flat-field fallback contributes 0 on every read.
 *
 * `m.free` (the unprefixed, player-allocated channel) is OUT of this sum
 * deliberately — it's player-allocated, not engine-granted, and is summed
 * separately by the callers that need it (see `domain.js`).
 *
 * @param {object} m  - merit instance
 * @returns {number}
 */
export function meritFreeSum(m) {
  if (!m) return 0;
  const fromMap = Object.values(m.free_grants || {}).reduce((s, n) => s + (n || 0), 0);
  let fromLegacy = 0;
  for (const slug of LEGACY_FREE_SLUGS) {
    fromLegacy += (m['free_' + slug] || 0);
  }
  return fromMap + fromLegacy;
}

/**
 * Per-slug free-dot lookup with the canonical map-fallback shape:
 *   m.free_grants?.<slug> ?? m.free_<slug> ?? 0
 *
 * Use this for every per-slug read that previously wrote `(m.free_<slug> || 0)`
 * inline. The map-fallback keeps the read correct across the N-1 → N-2
 * transition: pre-N-2 the legacy flat field holds the value; post-N-2 the map
 * does. The two channels are disjoint per slug by construction (evaluator
 * writes to one or the other, never both), so `??` semantics are correct.
 *
 * NOT a behavioural change for N-1: when neither the map entry nor the legacy
 * field is set, both paths return 0.
 *
 * @param {object} m   - merit instance (or anything with `free_grants` /
 *                       `free_<slug>` keys, e.g. fighting_styles)
 * @param {string} slug
 * @returns {number}
 */
export function freeOf(m, slug) {
  if (!m || !slug) return 0;
  const fromMap = m.free_grants && m.free_grants[slug];
  if (fromMap != null) return fromMap;
  return m['free_' + slug] || 0;
}

// ── shareableSumForMerit (D2 — NEW Collective Compound sources only) ─────────

/**
 * Partner-shareable contribution to a merit's "partner side" total, computed
 * from NEW Collective Compound rule_grant docs (`partner_shareable === true`).
 *
 * **Scope is intentionally narrow in N-1 (Concern #1 Rev 2):** the legacy
 * hardcoded subsets at `domain.js#domMeritShareableSingle` (mci-only on
 * client) and `server/routes/characters.js` (mci + bloodline + retainer on
 * server) are NOT migrated to consult this helper — they stay verbatim with a
 * minimal `(m.free_grants?.<slug> ?? m.free_<slug> ?? 0)` map-fallback so the
 * transition doesn't silently drop dots. The divergence between client and
 * server is deliberately preserved until the future MNEC-prerequisite audit
 * story decides whether to normalise it.
 *
 * This helper is the seam for NEW code — Collective Compound synthesis and
 * any future flag-driven path. The seeded `partner_shareable` values for
 * legacy sources (LK/Inv/VM/MCI/Bloodline/Retainer) populate as canonical
 * UNION-baseline data the audit will use; they are not consulted in N-1.
 *
 * @param {object} _c          - owning character (reserved for future scopes)
 * @param {object} m           - merit instance
 * @param {object} [ruleCache] - rules cache shape `{ rule_grant: [...] }`
 * @returns {number}
 */
export function shareableSumForMerit(_c, m, ruleCache) {
  if (!m) return 0;
  const grants = (ruleCache && ruleCache.rule_grant) || [];
  const bySlug = new Map();
  for (const g of grants) {
    if (g && typeof g.source_slug === 'string') bySlug.set(g.source_slug, g);
  }
  let total = 0;
  for (const [slug, amount] of Object.entries(m.free_grants || {})) {
    const rule = bySlug.get(slug);
    if (rule && rule.partner_shareable === true) total += (amount || 0);
  }
  return total;
}

// ── resolveSharingScope (D3 / D5 discriminator dispatch) ─────────────────────

/**
 * Render-time sharing-scope resolver. Dispatches on `scope.type` from day one
 * (Rev 2 D5). Returns:
 *
 *  - `null` for `partner_explicit` / missing scope / unknown type — consumer
 *    falls back to persisted `m.shared_with`.
 *  - synthesised `string[]` of partner names for collective scopes.
 *
 * The synthesised list is render-time only. Callers MUST write it to a
 * `_`-prefixed transient field (e.g. `m._collective_shared_with`) so the
 * save path strips it. Never mutate persisted `m.shared_with` for collective
 * scope — see Concern #3.
 *
 * @param {{type?: string} | undefined | null} scope
 * @param {object} c                       - owning character
 * @param {object[]} chars                 - full chars array (cross-character context)
 * @param {object} [rule]                  - the rule_grant doc this scope came from
 * @returns {string[] | null}
 */
export function resolveSharingScope(scope, c, chars, rule) {
  switch (scope && scope.type) {
    case 'partner_explicit':
    case undefined:
    case null:
      return null;
    case 'collective_owners_of_merit':
      return synthesiseCollectiveOwners(scope, c, chars, rule);
    default:
      // Safe degradation — log + null fallback (consumer reads persisted shared_with).
      try { console.warn('[rules-helpers] unknown sharing_scope.type:', scope.type); } catch { /* console may be absent */ }
      return null;
  }
}

// ── N-7 (MNEC, issue #760) — Necropolis allocator helpers ──────────────────

/**
 * True if the character owns Necropolis Sepulcher with ≥ 1 purchased dot.
 * Purchased = cp + xp (matches the membership semantics in N-1's
 * synthesiseCollectiveOwners — grants from the collective itself don't count
 * toward membership / pool eligibility).
 *
 * @param {object} c
 * @returns {boolean}
 */
export function hasNecropolisSepulcher(c) {
  if (!c || !Array.isArray(c.merits)) return false;
  return c.merits.some(m =>
    m && m.name === 'Necropolis Sepulcher' && ((m.cp || 0) + (m.xp || 0)) >= 1
  );
}

/**
 * Remaining pool capacity for an allocator slug on this character.
 *
 *   pool capacity = sum of `_grant_pools[*].amount` where category === slug
 *   used          = sum of `freeOf(m, slug)` across all merits (union-reads
 *                   map + legacy per N-1's runtime guard)
 *   available     = max(0, capacity - used)
 *
 * Generalises the inline cap logic at `edit.js:1019-1022`. Allocator
 * handlers compute the cap as `poolAvailableFor(c, slug) + currentValue`
 * (so the row being edited contributes its OWN current value back into
 * the cap rather than treating it as a reservation).
 *
 * @param {object} c
 * @param {string} slug
 * @returns {number}
 */
export function poolAvailableFor(c, slug) {
  if (!c || !slug) return 0;
  const capacity = (c._grant_pools || [])
    .filter(p => p && p.category === slug)
    .reduce((s, p) => s + (p.amount || 0), 0);
  let used = 0;
  for (const m of (c.merits || [])) {
    used += freeOf(m, slug);
  }
  return Math.max(0, capacity - used);
}

/**
 * Target merit names for one Collective Compound, from the rules cache.
 *
 * Caller passes the rules cache (from `editor/rule_engine/load-rules.js`)
 * so this helper stays free of the rules-cache + api.js import chain —
 * rules-helpers.js MUST remain pure / no-browser-imports per the N-1
 * convention. Returns the `pool_targets` array on the matching `rule_grant`
 * doc, or `[]` if the cache is empty / the rule isn't seeded.
 *
 * COLLECTIVE-2 (issue #1110): `source` is now a parameter. Pre-#1110 this
 * was `getNecropolisTargets` with the source merit name hardcoded, which is
 * exactly what stopped a second compound from rendering.
 *
 * @param {object} [ruleCache] - rules cache shape `{ rule_grant: [...] }`
 * @param {string} source      - the compound's source merit name
 * @returns {string[]}
 */
export function getCompoundTargets(ruleCache, source) {
  if (!source) return [];
  const grants = (ruleCache && ruleCache.rule_grant) || [];
  const rule = grants.find(r =>
    r && r.source === source && r.grant_type === 'pool'
  );
  return (rule && Array.isArray(rule.pool_targets)) ? rule.pool_targets : [];
}

/**
 * COLLECTIVE-2 (issue #1110) — discover every Collective Compound seeded in
 * the rules cache.
 *
 * A Collective Compound is a `rule_grant` doc with `grant_type: 'pool'` AND
 * `sharing_scope.type === 'collective_owners_of_merit'` (ADR-005 Rev 2 D3).
 * That discriminator is the ONLY predicate — no merit-name list, no slug
 * allowlist — so a fourth compound is a seed script plus catalogue rows with
 * no code change (AC 5).
 *
 * Verified against live `tm_suite` 2026-08-06 (story Task 0): all three
 * seeded compounds (Necropolis Sepulcher / Blood and Sacrifice / Prayer and
 * Penance) carry `sharing_scope`, and no OTHER `rule_grant` doc carries it
 * at all — so the predicate selects exactly the compounds, with no
 * Necropolis drop and no false positives from the 25 non-compound grants.
 *
 * Descriptor shape:
 *   `{ source, slug, gateMerit, minDots, targets }`
 *     source    — the compound's source merit ('Necropolis Sepulcher')
 *     slug      — `free_grants` allocation channel ('necro')
 *     gateMerit — merit that gates collective membership; normally === source
 *     minDots   — purchased dots (cp + xp) required to be a member
 *     targets   — the compound's target merit names
 *
 * Duplicate docs (the live `rule_grant` collection has repeated seeds for
 * MCI and OHM) are collapsed on `source|slug` so a re-run seed can't double
 * a compound's rows.
 *
 * Pure — `ruleCache` is passed in, never imported (N-1 no-browser-imports).
 *
 * @param {object} [ruleCache] - rules cache shape `{ rule_grant: [...] }`
 * @returns {{source: string, slug: string, gateMerit: string, minDots: number, targets: string[]}[]}
 */
export function getCollectiveCompounds(ruleCache) {
  const grants = (ruleCache && ruleCache.rule_grant) || [];
  const out = [];
  const seen = new Set();
  for (const r of grants) {
    if (!r || r.grant_type !== 'pool') continue;
    const scope = r.sharing_scope;
    if (!scope || scope.type !== 'collective_owners_of_merit') continue;
    // `category` is the pool-evaluator's fallback for `source_slug`
    // (pool-evaluator.js:40, issue #775) — mirror it so a doc seeded with
    // only one of the two still resolves an allocation channel.
    const slug = r.source_slug || r.category;
    const gateMerit = scope.merit || r.source;
    if (!slug || !gateMerit) continue;
    const key = r.source + '|' + slug;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      source: r.source,
      slug,
      gateMerit,
      // Defaults to 1 when absent — matches the pre-#1110
      // `minSepulcherDots = 1` default.
      minDots: scope.min_dots == null ? 1 : scope.min_dots,
      targets: Array.isArray(r.pool_targets) ? r.pool_targets.slice() : [],
    });
  }
  return out;
}

/**
 * True if `c` is a member of `compound` — owns its gate merit at
 * `minDots` purchased dots (cp + xp).
 *
 * Purchased-only matches `hasNecropolisSepulcher` and the pool-evaluator
 * membership semantics: a grant the collective itself confers must not
 * feed back into eligibility for that collective.
 *
 * @param {object} c
 * @param {{gateMerit: string, minDots: number}} compound
 * @returns {boolean}
 */
export function ownsCompound(c, compound) {
  if (!c || !Array.isArray(c.merits) || !compound || !compound.gateMerit) return false;
  const minDots = compound.minDots == null ? 1 : compound.minDots;
  return c.merits.some(m =>
    m && m.name === compound.gateMerit && ((m.cp || 0) + (m.xp || 0)) >= minDots
  );
}

/**
 * N-4 (MNEC, issue #696) — render-side union of Territories the Necropolis
 * has infected. Walks `chars`, finds every Necropolis Sepulcher owner
 * (cp+xp ≥ 1), then for each owner aggregates the `territories[]` arrays on
 * their White Ants merits, deduplicated.
 *
 * Used at render time:
 *   - N-5 Trap Door anchor validation (destination Safe Place must be in a
 *     Territory in this union).
 *   - Any UI consumer that wants to display "the Necropolis touches X" maps.
 *
 * Pure function — no DB access, no module-level state. Caller passes the
 * full chars array; on the client that's `editorState.chars` /
 * `suiteState.chars`; on the server it's a fresh `characters.find().toArray()`.
 *
 * @param {object[]} chars
 * @returns {string[]} deduplicated territory slugs, insertion order preserved
 */
export function getNecropolisInfectedTerritories(chars) {
  if (!Array.isArray(chars)) return [];
  const out = [];
  const seen = new Set();
  for (const c of chars) {
    if (!c || !Array.isArray(c.merits)) continue;
    // Membership gate: owner has Sepulcher ≥ 1 purchased (cp+xp).
    const isOwner = c.merits.some(m =>
      m && m.name === 'Necropolis Sepulcher' && ((m.cp || 0) + (m.xp || 0)) >= 1
    );
    if (!isOwner) continue;
    for (const m of c.merits) {
      if (!m || m.name !== 'White Ants') continue;
      if (!Array.isArray(m.territories)) continue;
      for (const slug of m.territories) {
        if (typeof slug !== 'string' || !slug) continue;
        if (seen.has(slug)) continue;
        seen.add(slug);
        out.push(slug);
      }
    }
  }
  return out;
}

/**
 * N-5 (MNEC, issue #697) — Trap Door dual-anchor render-time validator.
 *
 * Trap Door's `attached_to` is a triple-anchor object per Option B (confirmed
 * by Peter 2026-06-11): `{ origin, destination, territory }`. The `territory`
 * field carries the Territory slug on this Trap Door's attachment — NOT a
 * property of the destination Safe Place (Safe Places can be in or out of a
 * Necropolis Territory; the constraint is specific to this Trap Door binding).
 *
 * Two checks, in order:
 *   1. The attached_to.territory field is present.
 *   2. That Territory is currently in the Necropolis-infected union — i.e.
 *      some Sepulcher owner (possibly this character, possibly another) has
 *      White Ants coverage on it.
 *
 * Persisted-not-removed semantics: when invalid, the merit stays on the
 * sheet but renders non-functional with a warning. The player can fix the
 * binding (or another Sepulcher owner picks up the Territory in their
 * White Ants) without re-buying.
 *
 * @param {object} _c - the merit's owning character (reserved for future scopes)
 * @param {object} m  - the Trap Door merit instance
 * @param {object[]} chars - full chars array (cross-character context)
 * @returns {{valid: boolean, reason?: string}}
 */
export function validateTrapDoorAnchor(_c, m, chars) {
  if (!m) return { valid: false, reason: 'No merit provided' };
  const at = normaliseAttachedTo(m.attached_to);
  if (!at) {
    return { valid: false, reason: 'Trap Door has no attached anchor' };
  }
  // origin + destination are checked at the picker UX level; the render-time
  // validator focuses on the Territory constraint per MNEC §8.
  const slug = m.attached_to && typeof m.attached_to === 'object'
    ? m.attached_to.territory
    : null;
  if (typeof slug !== 'string' || !slug) {
    return { valid: false, reason: 'No Territory selected for this Trap Door' };
  }
  const infected = getNecropolisInfectedTerritories(chars);
  if (!infected.includes(slug)) {
    return {
      valid: false,
      reason: 'No White Ants coverage on this Trap Door\'s Territory',
    };
  }
  return { valid: true };
}

/**
 * Pure synthesis for `{ type: 'collective_owners_of_merit', merit, min_dots }`.
 *
 *  - Walks `chars` for every character that owns `scope.merit` at >=
 *    `scope.min_dots` (or 1 if omitted). "Owns at N dots" uses purchased
 *    dots only (cp + xp) — collective membership should not depend on a
 *    grant the collective itself confers.
 *  - Returns:
 *      `null`      — `c` is NOT a member of the collective. Orchestrator
 *                    skips writing `_collective_shared_with` entirely (the
 *                    field is absent on non-member chars, semantically "this
 *                    merit is not a collective compound for me").
 *      `string[]`  — `c` IS a member. The list contains the OTHER members'
 *                    names; empty array means `c` is the only member.
 *
 * The `null` vs `[]` distinction is load-bearing: downstream consumers
 * (rendering, the audit view) treat absence-of-field as "non-member" and
 * an empty array as "member but solo".
 *
 * The `rule` parameter is reserved — future variants may consult it.
 *
 * @param {{merit: string, min_dots?: number}} scope
 * @param {object} c
 * @param {object[]} chars
 * @param {object} [_rule]
 * @returns {string[] | null}
 */
export function synthesiseCollectiveOwners(scope, c, chars, _rule) {
  if (!scope || !scope.merit) return null;
  const minDots = scope.min_dots == null ? 1 : scope.min_dots;
  const scopeMerit = scope.merit.trim().toLowerCase();
  const list = Array.isArray(chars) ? chars : [];
  const owners = list.filter(other => {
    if (!other || !Array.isArray(other.merits)) return false;
    return other.merits.some(m =>
      m && typeof m.name === 'string' && m.name.trim().toLowerCase() === scopeMerit
        && ((m.cp || 0) + (m.xp || 0)) >= minDots
    );
  });
  if (!owners.includes(c)) return null;
  return owners.filter(o => o !== c).map(o => (o && o.name) || '').filter(Boolean);
}

// ── COLLECTIVE-1 (issue #800) — virtual row synthesis primitives ─────────────

/**
 * Cumulative `free_grants.<compound.slug>` allocation for a single target
 * merit across ALL members of `compound` in `allChars` (including the
 * current character if they are a member).
 *
 * Used by the renderer to compute the per-row partner-dots split: own dots
 * (solid) + (cumulative - own) (hollow). The result is NOT capped at the
 * merit's rating_range — per Peter 2026-06-16, cumulative across owners can
 * exceed the per-instance 5-dot cap. Do not "fix" that.
 *
 * Owner gate uses purchased gate-merit dots only (cp + xp >= compound.minDots)
 * — consistent with `ownsCompound` and the pool-evaluator membership
 * semantics.
 *
 * COLLECTIVE-2 (issue #1110): was `collectiveNecroDots`, with the gate merit
 * name and the `necro` slug hardcoded. Both now come off the descriptor
 * returned by `getCollectiveCompounds`.
 *
 * @param {object[]} allChars  - full chars array
 * @param {string} meritName   - target merit name (e.g. 'Catacombs')
 * @param {{gateMerit: string, minDots: number, slug: string}} compound
 * @returns {number} cumulative dots allocated to this target across members
 */
export function collectiveCompoundDots(allChars, meritName, compound) {
  if (!Array.isArray(allChars) || !meritName || !compound) return 0;
  if (!compound.gateMerit || !compound.slug) return 0;
  let sum = 0;
  for (const ch of allChars) {
    if (!ownsCompound(ch, compound)) continue;
    const target = ch.merits.find(m => m && m.name === meritName);
    if (!target) continue;
    sum += freeOf(target, compound.slug);
  }
  return sum;
}

/**
 * Union of `compound`'s target merit names that ANY member in `allChars`
 * has allocated dots to OR has on their sheet. This is the candidate set
 * for virtual row synthesis on the current character's sheet.
 *
 * **Membership boundary:** returns `[]` when `c` is not a member of
 * `compound`. Non-members never see that compound's virtual rows.
 *
 * **Membership criterion:** a target name is in the union if any member has
 * a merit with that name AND any allocation (cp + xp + the compound's own
 * free-grant channel > 0). A merit row with no dots on any member is
 * excluded — it would be meaningless to render an all-empty row.
 *
 * COLLECTIVE-2 (issue #1110): was `synthesiseCollectiveNecroNames(c,
 * allChars, necroTargets, minSepulcherDots)`. The separate `necroTargets`
 * parameter is gone — targets come off the descriptor, so a caller can no
 * longer pair one compound's targets with another's gate.
 *
 * @param {object} c          - the character whose sheet is rendering
 * @param {object[]} allChars - full chars array
 * @param {{gateMerit: string, minDots: number, slug: string, targets: string[]}} compound
 * @returns {string[]} target merit names present on the collective (may be empty)
 */
export function synthesiseCollectiveCompoundNames(c, allChars, compound) {
  if (!c || !Array.isArray(c.merits) || !Array.isArray(allChars)) return [];
  if (!compound || !Array.isArray(compound.targets)) return [];
  // Membership boundary: c must be a member.
  if (!ownsCompound(c, compound)) return [];
  const targetSet = new Set(compound.targets);
  const names = new Set();
  for (const ch of allChars) {
    if (!ownsCompound(ch, compound)) continue;
    for (const m of ch.merits) {
      if (!m || !targetSet.has(m.name)) continue;
      const total = (m.cp || 0) + (m.xp || 0) + freeOf(m, compound.slug);
      if (total <= 0) continue; // skip empty rows
      names.add(m.name);
    }
  }
  // Insertion-order preserved (matches getNecropolisInfectedTerritories'
  // convention). Callers can sort for display if alphabetical is desired.
  return Array.from(names);
}
