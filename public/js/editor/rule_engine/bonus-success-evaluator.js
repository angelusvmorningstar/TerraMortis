/**
 * Bonus-success evaluator — processes rule_bonus_success docs at ROLL time.
 *
 * Every other evaluator in this directory runs during a character render and
 * produces dots. This one runs once per dice roll, after the dice have been
 * counted, and produces successes. It is deliberately NOT wired into
 * applyDerivedMerits: a bonus success is a property of a roll, not of a sheet.
 *
 * The first rule to use it is Stronger Than You (Strength Performance rank 4):
 * "Successful Strength rolls add an additional free success." Defined in
 * public/data/man_db.json since project inception, never enforced until now.
 *
 * No external imports — pure functions, safe in Node.js test contexts, same
 * contract as every sibling evaluator here.
 *
 * Contract notes:
 *   - Bonus successes apply only when the roll ALREADY scored at least one
 *     rolled success. A failed roll stays failed; nothing rescues it.
 *   - A chance die showing 10 is a rolled success, so it qualifies.
 *   - Rolled and bonus counts are kept apart in the result so a future rule
 *     that must ignore bonus successes (Street Fighting "Kick 'Em While
 *     They're Down", Merits Errata:693) can read `rolled` on its own.
 *   - Multiple matching rules stack additively, including two rules that
 *     share a `source`.
 */

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Which bonus-success rules fire for this character on this roll.
 *
 * @param {object}  c            character document (never mutated)
 * @param {object}  rollContext  { attr, skill, disc, spec, rolledSuccesses }
 * @param {Array}   rules        rule_bonus_success docs (the whole collection)
 * @returns {Array<{source: string, count: number}>} empty when nothing fires
 */
export function resolveBonusSuccesses(c, rollContext = {}, rules = []) {
  if (!c || !Array.isArray(rules) || rules.length === 0) return [];

  // Failed-roll gate. Also covers the "no count supplied" case, which must
  // never silently grant successes.
  const rolled = _int(rollContext?.rolledSuccesses);
  if (rolled < 1) return [];

  const out = [];
  for (const rule of rules) {
    if (!rule || typeof rule !== 'object') continue;
    if (!rule.source) continue;
    if (!_matches(c, rollContext, rule.predicate)) continue;

    const extra = Array.isArray(rule.also_requires) ? rule.also_requires : [];
    if (!extra.every(p => _matches(c, rollContext, p))) continue;

    const count = _count(c, rule);
    if (count > 0) out.push({ source: String(rule.source), count });
  }
  return out;
}

/**
 * Fold a rolled-success count together with whatever bonus successes apply.
 *
 * Kept separate from resolveSuccesses(cols, ...) in shared/dice.js because the
 * rote path has already reduced two dice pools to one winning ROLLED count by
 * the time the bonus is added — the bonus is added once, to the winner, never
 * to each candidate roll.
 *
 * @returns {{rolled: number, bonus: Array, total: number}}
 */
export function combineSuccesses(rolled, c, rollContext = {}, rules = []) {
  const r = _int(rolled);
  const bonus = resolveBonusSuccesses(c, { ...rollContext, rolledSuccesses: r }, rules || []);
  const total = r + bonus.reduce((sum, b) => sum + b.count, 0);
  return { rolled: r, bonus, total };
}

/**
 * The verdict-line breakdown, e.g.
 *   "4 rolled + 1 (Stronger Than You) = 5 successes"
 *
 * Returns '' when no bonus applies, so every display surface can append it
 * unconditionally and leave the existing line untouched on a normal roll.
 */
export function formatSuccessBreakdown(result) {
  if (!result || !Array.isArray(result.bonus) || result.bonus.length === 0) return '';
  const parts = result.bonus.map(b => `+ ${b.count} (${b.source})`).join(' ');
  const total = _int(result.total);
  return `${_int(result.rolled)} rolled ${parts} = ${total} success${total === 1 ? '' : 'es'}`;
}

// ── Predicates ───────────────────────────────────────────────────────────────

function _matches(c, ctx, pred) {
  if (!pred || typeof pred !== 'object' || !pred.kind || !pred.name) return false;
  const name = String(pred.name);

  switch (pred.kind) {
    case 'roll_attr':
      return _sameName(ctx?.attr, name);

    case 'roll_skill':
      return _sameName(ctx?.skill, name);

    case 'merit_present': {
      const min = Number.isInteger(pred.min_rating) && pred.min_rating > 0 ? pred.min_rating : 1;
      return (c.merits || []).some(m => _sameName(m?.name, name) && _meritRating(m) >= min);
    }

    // Manoeuvre possession is flat fighting_picks[] membership by name, not a
    // style-rating threshold — a character has picked the manoeuvre or has
    // not. Mirrors the existing check in public/js/admin/rules-view.js:99-102.
    // Style dots alone never grant it.
    case 'manoeuvre_present':
      return (c.fighting_picks || []).some(pk =>
        _sameName(typeof pk === 'string' ? pk : pk?.manoeuvre, name)
      );

    default:
      return false;
  }
}

// ── Amounts ──────────────────────────────────────────────────────────────────

function _count(c, rule) {
  switch (rule.count_basis) {
    case 'flat':
      return _int(rule.flat_amount ?? 1);

    // Only meaningful against a merit_present predicate; the route rejects any
    // other pairing, and this returns 0 rather than throwing if one slips in.
    //
    // Review fix (Codex, external, dtlt.1): a repeatable/qualified merit (e.g.
    // Allies — real characters carry several same-named entries distinguished
    // only by a separate `qualifier` field, chars_v3.json:319,336,353,370)
    // can have multiple entries sharing this name at different ratings. The
    // gate this rule actually fired on is _matches()'s merit_present case —
    // read the SAME entry that satisfied it, not just the first same-named
    // one, or a low-rating duplicate earlier in the array silently undercounts
    // a rule that matched on a later, higher-rating entry.
    case 'rating': {
      if (rule.predicate?.kind !== 'merit_present') return 0;
      const name = String(rule.predicate.name);
      const pred = rule.predicate || {};
      const min = Number.isInteger(pred.min_rating) && pred.min_rating > 0 ? pred.min_rating : 1;
      const m = (c.merits || []).find(x => _sameName(x?.name, name) && _meritRating(x) >= min);
      return m ? _meritRating(m) : 0;
    }

    default:
      return 0;
  }
}

/**
 * ADR-001 trait-reference primitive: a rule referencing a merit's rating reads
 * `m.rating`, which is already the effective sum (inherent dots plus every
 * free_* channel) after the render's phase-5 rating sync. There is deliberately
 * no inherent-only fallback here — reading purchased dots would reintroduce the
 * exact bug class the effective-rating contract exists to prevent.
 */
function _meritRating(m) {
  const n = Number(m?.rating);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

// ── Small helpers ────────────────────────────────────────────────────────────

function _sameName(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function _int(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
