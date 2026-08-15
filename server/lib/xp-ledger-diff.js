const TRAIT_CATEGORIES = {
  attributes: 'attribute',
  skills: 'skill',
  disciplines: 'discipline',
};

/**
 * Merit identity key. `.name` ALONE is not stable — this project's own house
 * convention (server/schemas/character.schema.js's `sworn_by.attachments`
 * comment: "Attachments reference merits by name + qualifier, NOT by array
 * index") already documents that duplicate-named merit entries (Allies by
 * area, Contacts by sphere, Retainer, Language, ...) are the normal shape,
 * not an edge case. Code-review (2026-08-15, internal 3-layer) reproduced
 * fabricated/dropped rows against real fixture data on this exact mistake —
 * `.name`-only matching is a real, live bug, not an accepted limitation.
 * Keys on name + qualifier + area (both nullable/absent on most merits, so
 * this degrades to plain name matching for the common single-entry case).
 */
function meritKey(m) {
  return String(m.name || '') + '|' + String(m.qualifier || '') + '|' + String(m.area || '');
}

// xpl.1: pure diff, no I/O. `before`/`after` are character-document-shaped
// objects (or partial projections carrying just attributes/skills/
// disciplines/merits). Returns one row per trait whose `.xp` changed,
// {category, trait_name, delta, new_total} — the caller stamps
// character_id/at/st_username/reason before insert.
//
// Diffs the UNION of before/after keys per category (not just `after`'s
// keys) so a trait or merit REMOVED from the incoming body — a deletion, a
// refund — produces a negative-delta row instead of vanishing silently.
// Code-review (2026-08-15) found the original after-only iteration made the
// ledger blind to exactly the kind of disappearing XP it exists to catch.
// A category key entirely ABSENT from `after` (not present in this
// particular save's body at all) is still skipped — that means "not part of
// this request," not "every trait in it was deleted."
export function diffXpLedgerRows(before, after) {
  const rows = [];
  const beforeSafe = before || {};
  const afterSafe = after || {};

  for (const [key, category] of Object.entries(TRAIT_CATEGORIES)) {
    const afterObj = afterSafe[key];
    if (!afterObj || typeof afterObj !== 'object') continue;
    const beforeObj = beforeSafe[key] || {};
    const traitNames = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);
    for (const traitName of traitNames) {
      const newXp = Number(afterObj[traitName]?.xp) || 0;
      const oldXp = Number(beforeObj[traitName]?.xp) || 0;
      const delta = newXp - oldXp;
      if (delta !== 0) rows.push({ category, trait_name: traitName, delta, new_total: newXp });
    }
  }

  if (Array.isArray(afterSafe.merits)) {
    const beforeMerits = Array.isArray(beforeSafe.merits) ? beforeSafe.merits : [];
    const afterByKey = new Map();
    for (const m of afterSafe.merits) { if (m && m.name) afterByKey.set(meritKey(m), m); }
    const beforeByKey = new Map();
    for (const m of beforeMerits) { if (m && m.name) beforeByKey.set(meritKey(m), m); }
    const allKeys = new Set([...beforeByKey.keys(), ...afterByKey.keys()]);
    for (const key of allKeys) {
      const afterM = afterByKey.get(key);
      const beforeM = beforeByKey.get(key);
      const newXp = afterM ? (Number(afterM.xp) || 0) : 0;
      const oldXp = beforeM ? (Number(beforeM.xp) || 0) : 0;
      const delta = newXp - oldXp;
      if (delta !== 0) {
        rows.push({ category: 'merit', trait_name: (afterM || beforeM).name, delta, new_total: newXp });
      }
    }
  }

  return rows;
}
