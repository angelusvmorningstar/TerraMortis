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
 * Total engine-granted free dots on a merit.
 *
 * Builds the union of all slugs present in either the `free_grants` map or the
 * 14 legacy `free_<slug>` flat fields, then reads each via `freeOf` (map-wins).
 * This prevents double-counting when both channels are simultaneously non-zero —
 * which happens after the N-2 backfill migrates a flat field to the map while a
 * clear-and-rewrite evaluator (PT, OHM, MDB, etc.) repopulates the flat field at
 * the next render cycle. Pre-N-2 characters (only flat fields set) and fully
 * migrated characters (only map set) are both correct by the `freeOf` fallback.
 *
 * `m.free` (the unprefixed, player-allocated channel) is OUT of this sum
 * deliberately — it is player-allocated, not engine-granted, and is summed
 * separately by the callers that need it (see `domain.js`).
 *
 * @param {object} m  - merit instance
 * @returns {number}
 */
export function meritFreeSum(m) {
  if (!m) return 0;
  const slugsInMap = Object.keys(m.free_grants || {});
  const slugsInLegacy = LEGACY_FREE_SLUGS.filter(s => m['free_' + s]);
  const allSlugs = new Set([...slugsInMap, ...slugsInLegacy]);
  let total = 0;
  for (const slug of allSlugs) {
    total += freeOf(m, slug);
  }
  return total;
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

// -- OATH-A (issue #1111, ADR-010 D1 / D1b / D4) - Swear By oaths ------------

/**
 * ADR-010 D4 - resolve a rule's variable rating basis against a character.
 *
 * `rating_range` stays as-is for fixed powers and stays `null` for the two
 * derived oaths; a sibling `rating_basis` field supplies the basis, following
 * the ADR-005 D3/D5 discriminator pattern - each variant carries its own
 * neighbouring fields and never overloads another variant's.
 *
 *   { type: 'blood_potency_multiple', factor: 2 }          - Oath of Abstinence
 *   { type: 'highest_status', pools: ['covenant','clan'] }  - Oath of the Model Prisoner
 *   absent / null                                           - every other power
 *
 * Returns `null` when the rule has no basis, so the caller falls back to
 * `rating_range`. An UNKNOWN discriminator warns and also returns `null`
 * (ADR-005 D5 safe degradation) rather than throwing or guessing - a new
 * variant deployed to data before code must not break the sheet.
 *
 * NEVER stored on the character (the never-store-derived rule). This is the
 * value the purchase UI OFFERS; what was actually sworn is snapshotted into
 * `sworn_by.dots_required` (D1b) and does not move afterwards.
 *
 * Pure - no imports, no rules-cache access.
 *
 * @param {object} c    - character
 * @param {object} rule - the purchasable_power doc
 * @returns {number|null} dots, or null to fall back to rating_range
 */
export function resolveRatingBasis(c, rule) {
  const basis = rule && rule.rating_basis;
  if (!basis || !basis.type) return null;
  if (!c) return null;
  switch (basis.type) {
    case 'blood_potency_multiple': {
      const factor = basis.factor == null ? 1 : basis.factor;
      return Math.max(0, (c.blood_potency || 0) * factor);
    }
    case 'highest_status': {
      const pools = Array.isArray(basis.pools) ? basis.pools : [];
      const st = c.status || {};
      let best = 0;
      for (const pool of pools) {
        // `covenant` is an object keyed by covenant NAME (see
        // project_status_unified_shape) - read the character's own covenant.
        // Every other pool ('clan', 'city') is a plain integer.
        const v = pool === 'covenant'
          ? ((st.covenant && st.covenant[c.covenant]) || 0)
          : (st[pool] || 0);
        if (v > best) best = v;
      }
      return best;
    }
    default:
      try { console.warn('[rules-helpers] unknown rating_basis.type:', basis.type); } catch { /* console may be absent */ }
      return null;
  }
}

/**
 * ADR-010 D1 - does a merit match an attachment reference?
 *
 * References are by name + qualifier, never by array index: `c.merits` is
 * array-indexed and indices move under splice. This is the single matching
 * rule, so the multi-instance cases (Safe Place, Contacts) behave the same
 * at every call site rather than each inventing their own.
 *
 * A missing/empty qualifier on EITHER side is normalised to null, so
 * `{ name: 'Resources' }` matches a Resources row with no qualifier and does
 * not match `Contacts (Police)`.
 *
 * @param {object} m - a merit row
 * @param {{name: string, qualifier?: string|null}} ref
 * @returns {boolean}
 */
export function meritMatchesRef(m, ref) {
  if (!m || !ref || !ref.name) return false;
  if (m.name !== ref.name) return false;
  const a = m.qualifier == null || m.qualifier === '' ? null : m.qualifier;
  const b = ref.qualifier == null || ref.qualifier === '' ? null : ref.qualifier;
  return a === b;
}

/**
 * ADR-010 D1 - resolve an attachment reference to the merit row it names.
 *
 * @param {object} c
 * @param {{name: string, qualifier?: string|null}} ref
 * @returns {object|null}
 */
export function resolveAttachment(c, ref) {
  if (!c || !Array.isArray(c.merits)) return null;
  return c.merits.find(m => meritMatchesRef(m, ref)) || null;
}

/**
 * Every merit row on `c` that is a standing Swear By oath - i.e. carries a
 * `sworn_by` pledge.
 *
 * @param {object} c
 * @returns {object[]}
 */
export function swornOaths(c) {
  if (!c || !Array.isArray(c.merits)) return [];
  return c.merits.filter(m => m && m.sworn_by && Array.isArray(m.sworn_by.attachments));
}

/**
 * Lookup key for the reverse index. Accepts a merit row or a reference -
 * both carry `name` and `qualifier`.
 *
 * @param {{name: string, qualifier?: string|null}} m
 * @returns {string}
 */
export function pledgeKeyFor(m) {
  if (!m || !m.name) return '';
  const q = m.qualifier == null || m.qualifier === '' ? '' : m.qualifier;
  // NUL separator, written as an escape so it stays visible in source and
  // greppable. NOT a space: merit names contain spaces, so a space join
  // makes { name: 'Safe', qualifier: 'Place' } collide with
  // { name: 'Safe Place', qualifier: null }. NUL cannot occur in either.
  return m.name + '\u0000' + q;
}

/**
 * ADR-010 D1 - the RENDER-TIME reverse index: "is this merit pledged, and to
 * what?".
 *
 * The forward direction (oath -> merits) is persisted on the oath row. The
 * reverse direction is rebuilt per render and NEVER persisted - the
 * ADR-005 D3 render-time-synthesis discipline and the project's
 * never-store-derived rule applied to a relationship rather than a stat.
 *
 * Keyed via `pledgeKeyFor`, which joins on NUL so a qualifier can never
 * collide with a name that happens to contain the separator.
 *
 * @param {object} c
 * @returns {Map<string, {dots: number, oaths: {oath: string, qualifier: string|null, dots: number}[]}>}
 */
export function buildPledgeIndex(c) {
  const index = new Map();
  for (const oath of swornOaths(c)) {
    for (const att of oath.sworn_by.attachments) {
      if (!att || !att.name) continue;
      const key = pledgeKeyFor(att);
      const entry = index.get(key) || { dots: 0, oaths: [] };
      entry.dots += att.dots || 0;
      entry.oaths.push({
        oath: oath.name,
        qualifier: oath.qualifier == null || oath.qualifier === '' ? null : oath.qualifier,
        dots: att.dots || 0,
      });
      index.set(key, entry);
    }
  }
  return index;
}

/**
 * Dots on the merit named by `ref` already pledged to standing oaths.
 *
 * `exceptOath` lets the swear/edit UI ask "how many dots are pledged by
 * OTHER oaths", so re-editing an existing pledge does not count itself as
 * competing with itself.
 *
 * @param {object} c
 * @param {{name: string, qualifier?: string|null}} ref
 * @param {object} [exceptOath] - an oath merit row to exclude
 * @returns {number}
 */
export function pledgedDots(c, ref, exceptOath) {
  let sum = 0;
  for (const oath of swornOaths(c)) {
    if (exceptOath && oath === exceptOath) continue;
    for (const att of oath.sworn_by.attachments) {
      if (meritMatchesRef(att, ref)) sum += att.dots || 0;
    }
  }
  return sum;
}

/**
 * ADR-010 D1b - dots on `m` available to pledge: the dots the character
 * actually owns, minus dots already pledged to other standing oaths.
 *
 * `ratingOf` is REQUIRED and injected deliberately. The owned-dots formula
 * lives in `meritRating` (`public/js/editor/xp.js`), which sits behind the
 * browser import chain this module must stay clear of. Re-implementing it
 * here would create a SIXTH fork of merit-dot arithmetic in a codebase where
 * the existing five already disagree - so there is no default. Callers pass
 * `meritRating`.
 *
 * Note this is the OWNED rating, not the effective one: pledging is about
 * what you bought, and encumbrance deliberately reduces no sum anywhere
 * (ADR-010 D2 - zero accessor changes).
 *
 * @param {object} c
 * @param {object} m - the candidate merit row
 * @param {(c: object, m: object) => number} ratingOf
 * @param {object} [exceptOath]
 * @returns {number}
 */
export function pledgeableDots(c, m, ratingOf, exceptOath) {
  if (!c || !m || typeof ratingOf !== 'function') return 0;
  const owned = ratingOf(c, m) || 0;
  return Math.max(0, owned - pledgedDots(c, m, exceptOath));
}

/**
 * ADR-010 D1b - validate a proposed pledge.
 *
 * Parity is DOT COUNT, not XP maths: merits are 1 XP per dot (`xpSpentMerits`
 * sums `m.xp` with no multiplier, `xp.js:119`), so "an equal XP value of
 * merits" reduces to `sum(attachments[].dots) === dots_required`. Integer
 * addition - no cost table, no XP lookup.
 *
 * Checks, in the order a player would hit them:
 *   - every attachment resolves to a merit the character owns
 *   - no attachment pledges more dots than that merit has spare
 *   - no duplicate references
 *   - the total equals `dotsRequired` exactly
 *
 * @returns {{valid: boolean, message: string|null, total: number}}
 */
export function validatePledge(c, attachments, dotsRequired, ratingOf, exceptOath) {
  const list = Array.isArray(attachments) ? attachments : [];
  let total = 0;
  const seen = new Set();

  for (const att of list) {
    if (!att || !att.name) {
      return { valid: false, message: 'A pledged merit is missing its name.', total: 0 };
    }
    const label = att.name + (att.qualifier ? ' (' + att.qualifier + ')' : '');
    const dots = att.dots || 0;
    if (dots < 1) {
      return { valid: false, message: label + ' must pledge at least 1 dot.', total: 0 };
    }
    const key = pledgeKeyFor(att);
    if (seen.has(key)) {
      return { valid: false, message: label + ' is pledged twice - combine it into one entry.', total: 0 };
    }
    seen.add(key);

    const m = resolveAttachment(c, att);
    if (!m) {
      return { valid: false, message: label + ' is not a merit this character owns.', total: 0 };
    }
    const spare = pledgeableDots(c, m, ratingOf, exceptOath);
    if (dots > spare) {
      return {
        valid: false,
        message: label + ' has only ' + spare + ' dot' + (spare === 1 ? '' : 's')
          + ' free to pledge (asked for ' + dots + ').',
        total: 0,
      };
    }
    total += dots;
  }

  const required = dotsRequired || 0;
  if (total !== required) {
    const diff = Math.abs(required - total);
    const word = diff === 1 ? 'dot' : 'dots';
    return {
      valid: false,
      message: total < required
        ? 'Pledge is ' + diff + ' ' + word + ' short - ' + total + ' of ' + required + ' pledged.'
        : 'Pledge is ' + diff + ' ' + word + ' over - ' + total + ' pledged, ' + required + ' required.',
      total,
    };
  }
  return { valid: true, message: null, total };
}

/**
 * Build the persisted `sworn_by` object for a newly sworn oath (ADR-010 D1).
 *
 * `dotsRequired` is SNAPSHOTTED here and never recomputed. For the two
 * derived-rating oaths (D4) the basis moves - Blood Potency rises, Status
 * changes - and a live-recomputed requirement would silently invalidate a
 * standing oath's parity every time it moved. Rules-wise the pledge was made
 * at a rating; that rating is what was pledged.
 *
 * `history` starts empty. OATH-A never appends to it; OATH-B (exit events)
 * is its only writer.
 *
 * @returns {object} the `sworn_by` value
 */
export function buildSwornBy(dotsRequired, attachments, swornAt) {
  return {
    dots_required: dotsRequired || 0,
    attachments: (Array.isArray(attachments) ? attachments : []).map(a => ({
      name: a.name,
      qualifier: a.qualifier == null || a.qualifier === '' ? null : a.qualifier,
      dots: a.dots || 0,
    })),
    sworn_at: swornAt || null,
    history: [],
  };
}

// -- OATH-B (issue #1111, ADR-010 D2 / D3a / D6 / D7) - breach + suspension --

/**
 * ADR-010 D6 - the exit reasons, and which of them forfeit.
 *
 * Only `broken` and `abandoned` forfeit. `released_by_liege` is the explicit
 * no-forfeiture exit from the source text; `fulfilled` is required by Oath of
 * Action, whose rules text ends the oath on successful completion with the
 * consequences falling on the LIEGE; `st_void` is the escape hatch for
 * adjudication error - without it the only way to undo a mis-recorded breach
 * would be to edit history, which defeats an append-only log.
 */
export const OATH_EXIT_REASONS = ['broken', 'abandoned', 'released_by_liege', 'fulfilled', 'st_void'];
const FORFEITING_REASONS = new Set(['broken', 'abandoned']);

/** True when this exit reason suspends the pledged dots. */
export function oathReasonForfeits(reason) {
  return FORFEITING_REASONS.has(reason);
}

/**
 * ADR-010 D7 - resolve a rule's forfeiture schedule, discriminator-typed.
 *
 * ONLY the default variant ships. `{ type: 'session' }` is deliberately NOT
 * accepted: its entire content is "this suspension ends automatically at the
 * end of the session", and with restoration deferred (D3b) nothing ends it -
 * so shipping it would start a suspension that never terminates, and the
 * failure would be invisible (a correct-looking suspension that never lifts).
 * It defers together with restoration.
 *
 * Unknown types warn and fall back to the default rather than releasing dots:
 * a schedule nobody recognises must not silently mean "no forfeiture".
 *
 * NOTE both parameters are RESTORATION parameters, so nothing reads either in
 * the shipped scope. That is fine because D8 makes the field declared,
 * schema-valid and ST-editable - declared-and-manageable-but-not-yet-consumed
 * is ordinary forward-declared rules data. Do not "clean up" an unread field.
 *
 * @param {object} [rule]
 * @returns {{type: string, chapters: number, restore_per_month: number}}
 */
export function resolveForfeitureSchedule(rule) {
  const DEFAULT = { type: 'chapter_span_then_monthly', chapters: 2, restore_per_month: 1 };
  const f = rule && rule.forfeiture;
  if (!f || !f.type) return DEFAULT;
  if (f.type === 'chapter_span_then_monthly') {
    return {
      type: f.type,
      chapters: f.chapters == null ? DEFAULT.chapters : f.chapters,
      restore_per_month: f.restore_per_month == null ? DEFAULT.restore_per_month : f.restore_per_month,
    };
  }
  try { console.warn('[rules-helpers] unknown forfeiture.type, using default:', f.type); } catch { /* console may be absent */ }
  return DEFAULT;
}

/**
 * ADR-010 D6 - build an exit event for `sworn_by.history`.
 *
 * `chapter_number` is captured HERE and is the single most important field in
 * this story, despite nothing reading it in the shipped scope. Which chapter
 * an oath broke in is UNRECOVERABLE after the fact: miss it and the deferred
 * restoration work has no anchor, and the remedy is ST archaeology across
 * session logs. It records `null` rather than inventing an ordinal when no
 * chapter context is loaded - a wrong ordinal is worse than an absent one,
 * and the resolver tolerates null without throwing (AC11).
 *
 * A CHAPTER IS A MONTH (Peter, 2026-08-06): "one dot per month" and "one dot
 * per chapter" are the same rate in different units, so the whole mechanic
 * anchors on chapter_number and there is NO date arithmetic anywhere. `at` is
 * a provenance stamp for the audit trail, never an input to a computation.
 * ADR-010 Rev 1 argued otherwise and was retracted.
 */
export function buildOathExitEvent(reason, chapterNumber, at, by) {
  return {
    event: 'exited',
    reason,
    chapter_number: Number.isInteger(chapterNumber) ? chapterNumber : null,
    at: at || null,
    ...(by ? { by } : {}),
  };
}

/**
 * ADR-010 D6 - build a restoration event.
 *
 * Restoration TIMING is deferred; the restoration EVENT is not. Suspension is
 * a derived value computed from this history, so it cannot be hand-cleared -
 * appending this event is the ONLY way an ST lifts a suspension. Dropping it
 * as part of "deferring restoration" would leave dots dark at breach with no
 * route back except hand-editing a character document, which is precisely
 * what an append-only log exists to prevent.
 */
export function buildOathRestoredEvent(dots, chapterNumber, at, by) {
  return {
    event: 'restored',
    dots: Math.max(0, dots || 0),
    chapter_number: Number.isInteger(chapterNumber) ? chapterNumber : null,
    at: at || null,
    ...(by ? { by } : {}),
  };
}

/**
 * Total dots currently suspended on ONE oath, derived from its history.
 *
 * Walks the append-only log in order, which is what makes sworn -> broken ->
 * partly restored -> re-sworn expressible at all; a single mutable status
 * field would lose it.
 *
 *   exited, forfeiting reason  -> suspend the whole pledge
 *   exited, non-forfeiting     -> the oath ends with no suspension
 *   restored { dots: n }       -> release n, floored at 0
 *
 * NEVER stored. Recomputed per render from the persisted history.
 *
 * @param {object} oath - a merit row carrying `sworn_by`
 * @returns {number}
 */
export function oathSuspendedDots(oath) {
  const sb = oath && oath.sworn_by;
  if (!sb || !Array.isArray(sb.attachments)) return 0;
  const pledged = sb.attachments.reduce((s, a) => s + (a.dots || 0), 0);
  let suspended = 0;
  for (const ev of (Array.isArray(sb.history) ? sb.history : [])) {
    if (!ev) continue;
    if (ev.event === 'exited') {
      suspended = oathReasonForfeits(ev.reason) ? pledged : 0;
    } else if (ev.event === 'restored') {
      suspended = Math.max(0, suspended - (ev.dots || 0));
    }
  }
  return Math.min(suspended, pledged);
}

/**
 * Per-merit suspended dots across every oath on the character.
 *
 * An oath's suspension is allocated to its attachments in order, so a
 * partially restored oath releases its earliest-pledged merits first. That
 * ordering is arbitrary but it must be DETERMINISTIC - the alternative is a
 * suspension total that reshuffles between renders.
 *
 * Returns a Map keyed by `pledgeKeyFor`, the same key the OATH-A reverse
 * index uses, so both directions of the relationship share one key rule.
 *
 * @param {object} c
 * @returns {Map<string, number>}
 */
export function suspendedDotsByMerit(c) {
  const out = new Map();
  for (const oath of swornOaths(c)) {
    let remaining = oathSuspendedDots(oath);
    if (remaining <= 0) continue;
    for (const att of oath.sworn_by.attachments) {
      if (remaining <= 0) break;
      if (!att || !att.name) continue;
      const take = Math.min(remaining, att.dots || 0);
      if (take <= 0) continue;
      const key = pledgeKeyFor(att);
      out.set(key, (out.get(key) || 0) + take);
      remaining -= take;
    }
  }
  return out;
}

/**
 * Apply a merit's oath suspension to a dot figure, floored at zero.
 *
 * The ONE place the subtraction is written. `meritEffectiveRating` uses it at
 * its single exit, and the three display sites that legitimately compute dots
 * without going through that helper use it too — so there is one rule for
 * what a suspension does to a number, not four copies that can drift.
 *
 * This is NOT a sixth merit-dot sum: it sums nothing. It takes a figure the
 * caller already computed and applies the suspension to it.
 *
 * @param {object} m    - the merit row (carries the transient _suspended_dots)
 * @param {number} dots - the unsuspended figure
 * @returns {number}
 */
export function applySuspensionTo(m, dots) {
  return Math.max(0, (dots || 0) - ((m && m._suspended_dots) || 0));
}

/**
 * ADR-010 D2 - materialise suspension onto the in-memory character as the
 * transient `m._suspended_dots`.
 *
 * Called from the SAME composition site that already runs the derived-merit
 * evaluators, before any accessor reads - the ADR-004 §D8 cache-entry
 * invariant. Every consumer of `meritEffectiveRating` therefore sees the
 * suspension without a single per-callsite change.
 *
 * `_`-prefixed, so both existing save paths strip it PER MERIT
 * (`buildSaveBody` in admin.js, `charsForSave` in export.js, both inside the
 * N-1 Concern #3 loop) and it can never reach a persisted document or the
 * localStorage mirror.
 *
 * Deletes the key when there is no suspension rather than writing 0, so a
 * lifted suspension leaves no residue on the object.
 *
 * @param {object} c
 */
export function applySuspensions(c) {
  if (!c || !Array.isArray(c.merits)) return;
  const byMerit = suspendedDotsByMerit(c);
  for (const m of c.merits) {
    if (!m) continue;
    const n = byMerit.get(pledgeKeyFor(m)) || 0;
    if (n > 0) m._suspended_dots = n;
    else delete m._suspended_dots;
  }
}
