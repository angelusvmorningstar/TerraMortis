/* Relationship kind taxonomy (NPCR.2).
   Closed enum of 18 kinds grouped into four families.
   Each kind carries UI display metadata and default-endpoint hints. */

export const FAMILIES = ['Lineage', 'Political', 'Mortal', 'Other'];

/**
 * Each entry:
 *   code:                   canonical enum code (matches server KIND_ENUM)
 *   label:                  UI display label
 *   family:                 one of FAMILIES
 *   direction:              'directed' | 'mutual' — default direction semantics
 *   typicalEndpoints:       hint for endpoint-picker defaults; 'any' if both sides free
 *                           e.g., { a: 'pc|npc', b: 'npc' } for touchstone
 *   custom_label_allowed:   true only for 'other'
 *   description:            short prose for the kind picker
 */
export const RELATIONSHIP_KINDS = [
  // ── Lineage ────────────────────────────────────────────────────────────────
  { code: 'sire',        label: 'Sire',        family: 'Lineage',   direction: 'directed', typicalEndpoints: { a: 'any', b: 'any' }, custom_label_allowed: false, description: 'a is the sire of b' },
  { code: 'childe',      label: 'Childe',      family: 'Lineage',   direction: 'directed', typicalEndpoints: { a: 'any', b: 'any' }, custom_label_allowed: false, description: 'a is the childe of b (inverse of sire)' },
  { code: 'grand-sire',  label: 'Grand-sire',  family: 'Lineage',   direction: 'directed', typicalEndpoints: { a: 'any', b: 'any' }, custom_label_allowed: false, description: 'a is the grand-sire of b' },
  { code: 'grand-childe', label: 'Grand-childe', family: 'Lineage', direction: 'directed', typicalEndpoints: { a: 'any', b: 'any' }, custom_label_allowed: false, description: 'a is the grand-childe of b' },
  { code: 'clan-mate',   label: 'Clan-mate',   family: 'Lineage',   direction: 'mutual',   typicalEndpoints: { a: 'any', b: 'any' }, custom_label_allowed: false, description: 'a and b share a clan' },

  // ── Political ──────────────────────────────────────────────────────────────
  { code: 'coterie',     label: 'Coterie',     family: 'Political', direction: 'mutual',   typicalEndpoints: { a: 'any', b: 'any' }, custom_label_allowed: false, description: 'shared coterie membership' },
  { code: 'ally',        label: 'Ally',        family: 'Political', direction: 'mutual',   typicalEndpoints: { a: 'any', b: 'any' }, custom_label_allowed: false, description: 'political ally' },
  { code: 'rival',       label: 'Rival',       family: 'Political', direction: 'mutual',   typicalEndpoints: { a: 'any', b: 'any' }, custom_label_allowed: false, description: 'political rival' },
  { code: 'enemy',       label: 'Enemy',       family: 'Political', direction: 'mutual',   typicalEndpoints: { a: 'any', b: 'any' }, custom_label_allowed: false, description: 'declared enemy' },
  { code: 'mentor',      label: 'Mentor',      family: 'Political', direction: 'directed', typicalEndpoints: { a: 'any', b: 'any' }, custom_label_allowed: false, description: 'a mentors b' },
  { code: 'debt-holder', label: 'Debt-holder', family: 'Political', direction: 'directed', typicalEndpoints: { a: 'any', b: 'any' }, custom_label_allowed: false, description: 'a holds a debt owed by b' },
  { code: 'debt-bearer', label: 'Debt-bearer', family: 'Political', direction: 'directed', typicalEndpoints: { a: 'any', b: 'any' }, custom_label_allowed: false, description: 'a owes a debt to b (inverse of debt-holder)' },

  // ── Mortal ─────────────────────────────────────────────────────────────────
  { code: 'touchstone',    label: 'Touchstone',    family: 'Mortal', direction: 'directed', typicalEndpoints: { a: 'pc', b: 'npc' },  custom_label_allowed: false, description: "a's Humanity is anchored by b" },
  { code: 'family',        label: 'Family',        family: 'Mortal', direction: 'mutual',   typicalEndpoints: { a: 'any', b: 'npc' }, custom_label_allowed: false, description: 'mortal family tie' },
  { code: 'contact',       label: 'Contact',       family: 'Mortal', direction: 'directed', typicalEndpoints: { a: 'any', b: 'npc' }, custom_label_allowed: false, description: "a's mortal contact is b" },
  { code: 'retainer',      label: 'Retainer',      family: 'Mortal', direction: 'directed', typicalEndpoints: { a: 'any', b: 'npc' }, custom_label_allowed: false, description: "a's retainer is b" },
  { code: 'correspondent', label: 'Correspondent', family: 'Mortal', direction: 'mutual',   typicalEndpoints: { a: 'any', b: 'npc' }, custom_label_allowed: false, description: 'regular correspondence between a and b' },
  { code: 'romantic',      label: 'Romantic',      family: 'Mortal', direction: 'mutual',   typicalEndpoints: { a: 'any', b: 'any' }, custom_label_allowed: false, description: 'romantic entanglement' },

  // ── Other ──────────────────────────────────────────────────────────────────
  { code: 'other',       label: 'Other',       family: 'Other',     direction: 'directed', typicalEndpoints: { a: 'any', b: 'any' }, custom_label_allowed: true,  description: 'custom relationship (requires label)' },
];

const _byCode = Object.fromEntries(RELATIONSHIP_KINDS.map(k => [k.code, k]));

export function kindByCode(code) {
  return _byCode[code] || null;
}

export function kindsByFamily() {
  const out = Object.fromEntries(FAMILIES.map(f => [f, []]));
  for (const k of RELATIONSHIP_KINDS) out[k.family].push(k);
  return out;
}

/** Default direction for a new edge of this kind. */
export function defaultDirectionFor(code) {
  const k = kindByCode(code);
  if (!k) return 'a_to_b';
  return k.direction === 'mutual' ? 'mutual' : 'a_to_b';
}
