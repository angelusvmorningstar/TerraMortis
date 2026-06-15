/**
 * Equipment catalogue parity test (issue #754).
 *
 * Compares the two EQUIPMENT_CATALOGUE exports — client at
 * `public/js/data/equipment-data.js` and server at
 * `server/data/equipment-catalogue.js` — and fails fast when they drift.
 *
 * Why a parity test instead of a single shared module: the root
 * `package.json` is `"type": "commonjs"` while `server/` is
 * `"type": "module"`. A neutral shared module needs restructuring beyond
 * the scope of this story. This test catches drift at PR time at
 * near-zero cost (sub-millisecond — pure compute, no DB).
 *
 * Fields compared per entry:
 *   bucket, name, availability, skill_domain, bonus_dice, damage_mod,
 *   damage_type, weapon_type, armour_value, defence_penalty.
 *   Plus length parity + id-set parity.
 *
 * Intentionally NOT compared:
 *   description — long-form text; drift here is cosmetic, not functional.
 *   tags — arrays; order-insensitive comparison would add cost without
 *          functional value (tags aren't used for any server-side gate).
 *
 * If drift surfaces, the test names the offending id and the divergent
 * field, so the fix is mechanical: align the two files in the same commit.
 */

import { describe, it, expect } from 'vitest';
import { EQUIPMENT_CATALOGUE as CLIENT } from '../../public/js/data/equipment-data.js';
import { EQUIPMENT_CATALOGUE as SERVER } from '../data/equipment-catalogue.js';

const COMPARED_FIELDS = [
  'bucket', 'name', 'availability',
  'skill_domain', 'bonus_dice',
  'damage_mod', 'damage_type', 'weapon_type',
  'armour_value', 'defence_penalty',
];

describe('Equipment catalogue parity (client ↔ server)', () => {
  it('both catalogues are non-empty arrays', () => {
    expect(Array.isArray(CLIENT)).toBe(true);
    expect(Array.isArray(SERVER)).toBe(true);
    expect(CLIENT.length).toBeGreaterThan(0);
    expect(SERVER.length).toBeGreaterThan(0);
  });

  it('same length', () => {
    expect(CLIENT).toHaveLength(SERVER.length);
  });

  it('same id set (no missing or extra entries on either side)', () => {
    const clientIds = new Set(CLIENT.map(e => e.id));
    const serverIds = new Set(SERVER.map(e => e.id));
    const onlyInClient = [...clientIds].filter(id => !serverIds.has(id));
    const onlyInServer = [...serverIds].filter(id => !clientIds.has(id));
    expect(onlyInClient, `Client has entries the server is missing: ${onlyInClient.join(', ')}`).toEqual([]);
    expect(onlyInServer, `Server has entries the client is missing: ${onlyInServer.join(', ')}`).toEqual([]);
  });

  it('every compared field matches per id', () => {
    // Per-id deep compare on the functional fields. Build a per-id diff
    // report so the failure message names the offending entry + field.
    const serverById = new Map(SERVER.map(e => [e.id, e]));
    const diffs = [];
    for (const c of CLIENT) {
      const s = serverById.get(c.id);
      if (!s) continue; // id-set parity test reports this case
      for (const f of COMPARED_FIELDS) {
        if (c[f] !== s[f]) {
          diffs.push(`  ${c.id}.${f}: client=${JSON.stringify(c[f])}, server=${JSON.stringify(s[f])}`);
        }
      }
    }
    expect(diffs, `Catalogue drift detected on ${diffs.length} field(s):\n${diffs.join('\n')}`).toEqual([]);
  });
});
