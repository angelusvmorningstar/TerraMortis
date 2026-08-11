/**
 * BL-3b (issue #1008) — the 23 bloodline documents, frozen.
 *
 * Captured on 2026-08-11 by running the real seed builder
 * (`buildSeedDocs({ discs: BLOODLINE_DISCS, clans: BLOODLINE_CLANS })`) one last
 * time, immediately BEFORE that story deleted the constants and retired the
 * script to `server/scripts/archive/`. So this is provably the data that was
 * migrated, not a retyped copy of it.
 *
 * Shape is what `GET /api/bloodlines` serves: `_id`, `name`, `slug`, `clan`,
 * `disciplines`, `created_at`, `updated_at`. Only `notes` is projected out
 * (`PUBLIC_PROJECTION` in `server/routes/bloodlines.js`), so the two timestamps
 * ARE part of the served response and are carried here for full fidelity.
 * BL-3b's first cut dropped them; BL-3b's review put them back, because a
 * fixture that claims to be "the response shape" and is not is a fixture that
 * will one day be believed. Nothing in the cache or the accessors reads a
 * timestamp, so the value is frozen at `FIXTURE_TIMESTAMP` rather than being a
 * record of a wall-clock moment — and that is the same value the archived
 * builder is handed in `bl3b-archived-seed-smoke.test.js`, which is what keeps
 * this list provably reproducible from the migration itself.
 *
 * This is a FIXTURE, not a source of truth. The `bloodlines` collection is the
 * only place a bloodline is defined, and BL-4's admin screen is the only place
 * one is added. A bloodline added there will not appear here, and must not:
 * these specs assert the behaviour of the 23 that existed at migration, which
 * is the set every equivalence claim in BL-1/BL-2/BL-3a was made against.
 *
 * A second frozen copy lives in `public/js/dev-fixtures.js` as its
 * `var BLOODLINES=` blob, because that file cannot import anything (it is
 * guarded by `if(_isDev)` and patches `window.fetch`). The two are held equal by
 * `server/tests/bl3b-constants-deleted.test.js`, which parses the blob back out
 * of the source text and deep-equals it against this list.
 */

/**
 * The wall-clock value `buildSeedDocs` would have stamped, frozen. Both
 * timestamps carry it, because the builder sets `updated_at = created_at = now`
 * on a fresh document.
 */
export const FIXTURE_TIMESTAMP = '2026-08-11T00:00:00.000Z';

/** The 23 bloodlines as `GET /api/bloodlines` serves them, sorted by name. */
export const BLOODLINE_FIXTURES = [
  {"_id":"bl-0","name":"Ankou","slug":"ankou","clan":"Mekhet","disciplines":["Auspex","Celerity","Obfuscate","Vigour"],"created_at":"2026-08-11T00:00:00.000Z","updated_at":"2026-08-11T00:00:00.000Z"},
  {"_id":"bl-1","name":"Apollinaire","slug":"apollinaire","clan":"Ventrue","disciplines":["Animalism","Dominate","Resilience","Obfuscate"],"created_at":"2026-08-11T00:00:00.000Z","updated_at":"2026-08-11T00:00:00.000Z"},
  {"_id":"bl-2","name":"Bron","slug":"bron","clan":"Ventrue","disciplines":["Animalism","Auspex","Dominate","Resilience"],"created_at":"2026-08-11T00:00:00.000Z","updated_at":"2026-08-11T00:00:00.000Z"},
  {"_id":"bl-3","name":"Gorgons","slug":"gorgons","clan":"Ventrue","disciplines":["Animalism","Dominate","Protean","Resilience"],"created_at":"2026-08-11T00:00:00.000Z","updated_at":"2026-08-11T00:00:00.000Z"},
  {"_id":"bl-4","name":"Hounds of Actaeon","slug":"hounds-of-actaeon","clan":"Gangrel","disciplines":["Animalism","Obfuscate","Protean","Resilience"],"created_at":"2026-08-11T00:00:00.000Z","updated_at":"2026-08-11T00:00:00.000Z"},
  {"_id":"bl-5","name":"Icelus","slug":"icelus","clan":"Ventrue","disciplines":["Auspex","Dominate","Obfuscate","Resilience"],"created_at":"2026-08-11T00:00:00.000Z","updated_at":"2026-08-11T00:00:00.000Z"},
  {"_id":"bl-6","name":"Jharana","slug":"jharana","clan":"Mekhet","disciplines":["Auspex","Celerity","Obfuscate","Vigour"],"created_at":"2026-08-11T00:00:00.000Z","updated_at":"2026-08-11T00:00:00.000Z"},
  {"_id":"bl-7","name":"Kerberos","slug":"kerberos","clan":"Gangrel","disciplines":["Animalism","Majesty","Protean","Resilience"],"created_at":"2026-08-11T00:00:00.000Z","updated_at":"2026-08-11T00:00:00.000Z"},
  {"_id":"bl-8","name":"Khaibit","slug":"khaibit","clan":"Mekhet","disciplines":["Auspex","Celerity","Obfuscate","Vigour"],"created_at":"2026-08-11T00:00:00.000Z","updated_at":"2026-08-11T00:00:00.000Z"},
  {"_id":"bl-9","name":"Lasombra","slug":"lasombra","clan":"Ventrue","disciplines":["Animalism","Dominate","Nightmare","Resilience"],"created_at":"2026-08-11T00:00:00.000Z","updated_at":"2026-08-11T00:00:00.000Z"},
  {"_id":"bl-10","name":"Lidérc","slug":"liderc","clan":"Daeva","disciplines":["Celerity","Majesty","Obfuscate","Vigour"],"created_at":"2026-08-11T00:00:00.000Z","updated_at":"2026-08-11T00:00:00.000Z"},
  {"_id":"bl-11","name":"Lygos","slug":"lygos","clan":"Mekhet","disciplines":["Auspex","Nightmare","Obfuscate","Vigour"],"created_at":"2026-08-11T00:00:00.000Z","updated_at":"2026-08-11T00:00:00.000Z"},
  {"_id":"bl-12","name":"Malkovians","slug":"malkovians","clan":"Ventrue","disciplines":["Auspex","Dominate","Obfuscate","Resilience"],"created_at":"2026-08-11T00:00:00.000Z","updated_at":"2026-08-11T00:00:00.000Z"},
  {"_id":"bl-13","name":"Mnemosyne","slug":"mnemosyne","clan":"Mekhet","disciplines":["Auspex","Celerity","Obfuscate","Dominate"],"created_at":"2026-08-11T00:00:00.000Z","updated_at":"2026-08-11T00:00:00.000Z"},
  {"_id":"bl-14","name":"Morbus","slug":"morbus","clan":"Mekhet","disciplines":["Animalism","Auspex","Celerity","Obfuscate"],"created_at":"2026-08-11T00:00:00.000Z","updated_at":"2026-08-11T00:00:00.000Z"},
  {"_id":"bl-15","name":"Norvegi","slug":"norvegi","clan":"Mekhet","disciplines":["Auspex","Obfuscate","Celerity","Vigour"],"created_at":"2026-08-11T00:00:00.000Z","updated_at":"2026-08-11T00:00:00.000Z"},
  {"_id":"bl-16","name":"Nosoi","slug":"nosoi","clan":"Nosferatu","disciplines":["Dominate","Obfuscate","Protean","Resilience"],"created_at":"2026-08-11T00:00:00.000Z","updated_at":"2026-08-11T00:00:00.000Z"},
  {"_id":"bl-17","name":"Order of Sir Martin","slug":"order-of-sir-martin","clan":"Nosferatu","disciplines":["Nightmare","Obfuscate","Resilience","Vigour"],"created_at":"2026-08-11T00:00:00.000Z","updated_at":"2026-08-11T00:00:00.000Z"},
  {"_id":"bl-18","name":"Rotgrafen","slug":"rotgrafen","clan":"Ventrue","disciplines":["Animalism","Dominate","Protean","Resilience"],"created_at":"2026-08-11T00:00:00.000Z","updated_at":"2026-08-11T00:00:00.000Z"},
  {"_id":"bl-19","name":"Scions of the First City","slug":"scions-of-the-first-city","clan":"Gangrel","disciplines":["Animalism","Auspex","Obfuscate","Resilience"],"created_at":"2026-08-11T00:00:00.000Z","updated_at":"2026-08-11T00:00:00.000Z"},
  {"_id":"bl-20","name":"Vardyvle","slug":"vardyvle","clan":"Ventrue","disciplines":["Dominate","Obfuscate","Protean","Resilience"],"created_at":"2026-08-11T00:00:00.000Z","updated_at":"2026-08-11T00:00:00.000Z"},
  {"_id":"bl-21","name":"Vilseduire","slug":"vilseduire","clan":"Nosferatu","disciplines":["Majesty","Nightmare","Obfuscate","Resilience"],"created_at":"2026-08-11T00:00:00.000Z","updated_at":"2026-08-11T00:00:00.000Z"},
  {"_id":"bl-22","name":"Zelani","slug":"zelani","clan":"Daeva","disciplines":["Celerity","Majesty","Auspex","Vigour"],"created_at":"2026-08-11T00:00:00.000Z","updated_at":"2026-08-11T00:00:00.000Z"},
];

/** Fresh deep copy, so a spec that mutates a document cannot poison the next. */
export function bloodlineFixtures() {
  return BLOODLINE_FIXTURES.map(d => ({ ...d, disciplines: [...d.disciplines] }));
}

/** name -> disciplines, the shape `BLOODLINE_DISCS` had. */
export function fixtureDiscsByName() {
  const out = {};
  for (const d of BLOODLINE_FIXTURES) out[d.name] = [...d.disciplines];
  return out;
}

/** clan -> names, the shape `BLOODLINE_CLANS` had. */
export function fixtureNamesByClan() {
  const out = {};
  for (const d of BLOODLINE_FIXTURES) (out[d.clan] ??= []).push(d.name);
  return out;
}
