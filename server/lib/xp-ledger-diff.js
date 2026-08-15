const TRAIT_CATEGORIES = {
  attributes: 'attribute',
  skills: 'skill',
  disciplines: 'discipline',
};

// xpl.1: pure diff, no I/O. `before`/`after` are character-document-shaped
// objects (or partial projections carrying just attributes/skills/
// disciplines/merits). Returns one row per trait whose `.xp` changed,
// {category, trait_name, delta, new_total} — the caller stamps
// character_id/at/st_username/reason before insert.
export function diffXpLedgerRows(before, after) {
  const rows = [];
  const beforeSafe = before || {};

  for (const [key, category] of Object.entries(TRAIT_CATEGORIES)) {
    const afterObj = after[key];
    if (!afterObj || typeof afterObj !== 'object') continue;
    const beforeObj = beforeSafe[key] || {};
    for (const [traitName, traitAfter] of Object.entries(afterObj)) {
      const newXp = Number(traitAfter?.xp) || 0;
      const oldXp = Number(beforeObj[traitName]?.xp) || 0;
      const delta = newXp - oldXp;
      if (delta !== 0) rows.push({ category, trait_name: traitName, delta, new_total: newXp });
    }
  }

  // Merits have no stable per-entry id (data-map.md Known Drift Pattern #11
  // applies one level removed) — matched by .name, exact/case-sensitive. A
  // character with two identically-named merit entries could misattribute
  // which one changed; accepted per this story's own Design Decisions.
  if (Array.isArray(after.merits)) {
    const beforeMerits = Array.isArray(beforeSafe.merits) ? beforeSafe.merits : [];
    for (const merit of after.merits) {
      if (!merit || !merit.name) continue;
      const match = beforeMerits.find(bm => bm && bm.name === merit.name);
      const newXp = Number(merit.xp) || 0;
      const oldXp = match ? (Number(match.xp) || 0) : 0;
      const delta = newXp - oldXp;
      if (delta !== 0) rows.push({ category: 'merit', trait_name: merit.name, delta, new_total: newXp });
    }
  }

  return rows;
}
