#!/usr/bin/env node
// roller-live/server.mjs — local server for the RLV roller convergence mockup, driven by REAL
// TM Game dev-fixture data instead of hand-typed numbers.
//
// Reads data/dev-fixtures/characters.json from the real TM Game repo (read-only, never writes),
// picks Yusuf Kalusicj (has both Nightmare AND the Air of Menace merit — real continuity with the
// prior static mockup), computes real skill/power pools using the same attribute+skill arithmetic
// the real app uses, and serves them to the client over a tiny JSON API. No npm install needed —
// Node built-ins only.
//
// Run:  node server.mjs
// Then open http://localhost:5175 in a browser.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 5175;
const HOST = '127.0.0.1';
const FIXTURES_PATH = 'D:/Terra Mortis/TM Game/data/dev-fixtures/characters.json';
const CHARACTER_NAME = 'Yusuf Kalusicj';

// ── CRD mockup: contested-roll handshake (party-mode scoping, 2026-08-22) ──
// In-memory only, cleared on restart, no auth. Demonstrates the routing mechanism the room
// converged on (write-once pending record, short poll, no sockets — Winston's proposal) so it
// can be seen working across two independent "devices" (duo.html's two iframes, or two
// browser tabs on ?as=<name>). Not a production implementation — see
// specs/epic-crd-contested-roll-defence.md, crd.1/crd.2.
const challenges = new Map();
let nextChallengeId = 1;
const CHALLENGE_TTL_MS = 10 * 60 * 1000; // unclaimed pending challenges expire after 10 minutes
const RESOLVED_GRACE_MS = 4000;          // resolved challenges stay visible briefly (Sally's "resolved-but-recent")

function pruneChallenges() {
  const now = Date.now();
  for (const [id, c] of challenges) {
    if (c.status === 'pending' && now - c.createdAt > CHALLENGE_TTL_MS) challenges.delete(id);
    else if (c.status === 'resolved' && now - c.resolvedAt > RESOLVED_GRACE_MS) challenges.delete(id);
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}

function dotsOf(entry) {
  if (!entry) return 0;
  return (entry.dots || 0) + (entry.bonus || 0);
}

// "Effects of Blood Potency" table, st-working/reference/Vampire the Requiem 2e Rulebook.md
// (~line 5543): [attribute/skill max, max Vitae, Vitae per turn, can feed from]. BP0 is the one
// irregular row — max Vitae equals the character's own Stamina score, not a fixed number.
const BLOOD_POTENCY_TABLE = {
  0: { vitaeMax: 'stamina', perTurn: 1 },
  1: { vitaeMax: 10, perTurn: 1 },
  2: { vitaeMax: 11, perTurn: 2 },
  3: { vitaeMax: 12, perTurn: 3 },
  4: { vitaeMax: 13, perTurn: 4 },
  5: { vitaeMax: 15, perTurn: 5 },
  6: { vitaeMax: 20, perTurn: 6 },
  7: { vitaeMax: 25, perTurn: 7 },
  8: { vitaeMax: 30, perTurn: 8 },
  9: { vitaeMax: 50, perTurn: 10 },
  10: { vitaeMax: 75, perTurn: 15 },
};

// Mirrors char-pools.js's own documented special-case: Air of Menace adds the character's
// Nightmare discipline dots onto Intimidation-based rolls.
function computeCharacterPayload(c) {
  const A = c.attributes;
  const S = c.skills;
  const D = c.disciplines;

  const hasAirOfMenace = (c.merits || []).some((m) => m.name === 'Air of Menace');
  const nightmareDots = dotsOf(D.Nightmare);
  // Indomitable (p.211): "add a +2 die bonus to the dice pool to contest" supernatural
  // mental/emotional influence. Only offered on the Defensive Reaction pool (CRD mockup) when
  // the character's own sheet actually carries the merit — never assumed client-side.
  const hasIndomitable = (c.merits || []).some((m) => m.name === 'Indomitable');
  // Closed Book (docs/merits/CoD Core Merits.md — not in the core VtR 2e book, this project's
  // own merit reference): "add her Merit dots to any contested rolls" resisting attempts "to
  // uncover her true feelings, motives, and position." Scales with dots (1-5), unlike
  // Indomitable's flat +2 — real dots read here, never assumed or hardcoded.
  const closedBookMerit = (c.merits || []).find((m) => m.name === 'Closed Book');
  const closedBookDots = closedBookMerit ? closedBookMerit.rating : 0;

  function skillPool(attrName, skillName) {
    const attr = dotsOf(A[attrName]);
    const sk = S[skillName];
    return {
      base: attr + dotsOf(sk),
      specs: (sk && sk.specs) || [],
      full: `${attrName} + ${skillName}`,
      nineAgain: !!(sk && sk.nine_again),
    };
  }

  const intimidation = skillPool('Presence', 'Intimidation');
  const empathy = skillPool('Wits', 'Empathy');
  const subterfuge = skillPool('Manipulation', 'Subterfuge');

  const skills = [
    {
      id: 'sk-intimidation',
      kind: 'skill',
      name: 'Intimidation',
      formula: 'Pre+Itm',
      fullFormula: intimidation.full,
      base: intimidation.base,
      specs: intimidation.specs,
      nineAgain: intimidation.nineAgain,
      merit: hasAirOfMenace
        ? { name: 'Air of Menace', bonus: nightmareDots, note: `adds this character's Nightmare dots (${nightmareDots}) to Intimidation` }
        : null,
    },
    { id: 'sk-empathy', kind: 'skill', name: 'Empathy', formula: 'Wit+Emp', fullFormula: empathy.full, base: empathy.base, specs: empathy.specs, nineAgain: empathy.nineAgain, merit: null },
    { id: 'sk-subterfuge', kind: 'skill', name: 'Subterfuge', formula: 'Man+Sub', fullFormula: subterfuge.full, base: subterfuge.base, specs: subterfuge.specs, nineAgain: subterfuge.nineAgain, merit: null },
  ];

  const powers = (c.powers || [])
    .filter((p) => p.pool_size != null)
    .map((p) => ({
      id: `pw-${p.rule_key}`,
      kind: 'power',
      name: p.name,
      discipline: p.discipline,
      rank: p.rank,
      base: p.pool_size,
      formula: `${p.discipline} ${p.rank}`,
      stats: p.stats,
      effect: p.effect,
      merit: null,
      // Not present per-power in the fixture (unlike skills' own `nine_again` flag) — default
      // to the baseline 10-again rather than guessing a discipline-specific grant.
      nineAgain: false,
    }));

  // Real VtR 2e formula ("Willpower score is equal to her Resolve + Composure dots" —
  // st-working/reference/Vampire the Requiem 2e Rulebook.md), not a fixture lookup — there is
  // no tracker_state entry cross-referenced to this character in the dev fixtures (its char_ids
  // are unrelated placeholder seed data), so a *current* balance can't honestly be pulled as
  // "real." Starting current == max (a full-pool assumption, clearly not a live tracker read).
  const willpowerMax = dotsOf(A.Resolve) + dotsOf(A.Composure);

  // Same honesty rule as willpowerMax: this is a real, correctly-sourced MAXIMUM, not a live
  // tracker read (no tracker_state fixture is cross-referenced to this character — see the note
  // above). BP0's table row is Stamina-keyed rather than a fixed number; every other row is a
  // direct table lookup off the character's real Blood Potency dot.
  const bpRow = BLOOD_POTENCY_TABLE[c.blood_potency] || BLOOD_POTENCY_TABLE[1];
  const vitaeMax = bpRow.vitaeMax === 'stamina' ? dotsOf(A.Stamina) : bpRow.vitaeMax;

  const professionalTraining = (c.merits || []).find((m) => m.name === 'Professional Training');
  const rulesOrdeal = (c.ordeals || []).find((o) => o.name === 'rules');

  // ── Free Build data: the real 9-Attribute grid (Mental/Physical/Social ×
  // Power/Finesse/Resistance — the genuine VtR 2e 3×3 layout, not a design choice), every skill
  // actually present on this character's own sheet (not the full 24-skill catalogue — this
  // character's document only lists the ones with real data), and every discipline this
  // character actually owns. ──
  const ATTR_GRID = [
    ['Intelligence', 'Wits', 'Resolve'],
    ['Strength', 'Dexterity', 'Stamina'],
    ['Presence', 'Manipulation', 'Composure'],
  ];
  // `value` is effective dots (dots + bonus) — what every normal pool (Free Build included)
  // should read. `inherentDots` is dots alone, with any bonus stripped — Lashing Out with the
  // Beast is a specific rules exception (per the player) that must use inherent dots, not
  // effective, so it's carried separately rather than derived client-side from `value`.
  const attributeGrid = ATTR_GRID.map((row) => row.map((name) => ({
    name,
    value: dotsOf(A[name]),
    inherentDots: (A[name] && A[name].dots) || 0,
  })));

  // Only skills the character actually has dots in — a 0-dot skill isn't picked from a named
  // button, it's covered by the two generic Unskilled options the client adds below the grid.
  const skillGrid = Object.keys(S)
    .map((name) => ({ name, value: dotsOf(S[name]), specs: S[name].specs || [], nineAgain: !!S[name].nine_again }))
    .filter((s) => s.value > 0);

  const disciplineGrid = Object.keys(D).map((name) => ({ name, value: dotsOf(D[name]) }));

  return {
    character: {
      name: c.name,
      clan: c.clan,
      covenant: c.covenant,
      bloodPotency: c.blood_potency,
      willpowerMax,
      vitaeMax,
      vitaePerTurn: bpRow.perTurn,
      rulesOrdealComplete: !!(rulesOrdeal && rulesOrdeal.complete),
      professionalTrainingDots: professionalTraining ? professionalTraining.rating : 0,
      hasIndomitable,
      closedBookDots,
      // Real current Humanity rating (not a max/current split like Vitae/WP — Humanity only
      // has one number). Feeds the Humanity Check errata formula and touchstone attachment.
      humanityCurrent: c.humanity,
      // Each real Touchstone as written on the sheet: {humanity, name}. `humanity` is the dot
      // slot it's written next to (p.87-88) — a Touchstone is "attached" only when the
      // character's CURRENT Humanity is at or above that slot; if Humanity has dropped below
      // it, that Touchstone is detached and grants no roll bonus until Humanity is regained.
      touchstones: (c.touchstones || []).map((t) => ({ humanity: t.humanity, name: t.name })),
    },
    skills,
    powers,
    // Special rolls (initiative, frenzy resistance, lashing out, ...) — built one at a time as
    // each one's real rules are confirmed. Four of the five shipped so far (Humanity Breaking
    // Point, Lashing Out, Detecting Blood Sympathy, Resist Blood Bond, Clash of Wills) turned
    // out to have a real branching choice the player makes once per card, so those are
    // client-built via their own pop-up rather than shipped statically here. Surprise
    // Perception (p.176) has no branching choice at all — fixed Wits + Composure, contested by
    // the attacker's Dexterity + Stealth using the generic Contested Roll toggle every item
    // already has — so it's a normal always-present item, computed here like a skill.
    special: [
      {
        id: 'surpriseperception',
        kind: 'special',
        rulesKind: 'surpriseperception',
        name: 'Surprise / Perception',
        formula: 'Wit+Com',
        fullFormula: 'Wits + Composure',
        base: dotsOf(A.Wits) + dotsOf(A.Composure),
        specs: [],
        nineAgain: false,
        merit: null,
      },
      // Resisting Frenzy (p.103-104) also has no branching choice — fixed Resolve + Composure
      // ("Willpower is Resolve + Composure" per the player, not a separately-stored rating).
      // The real Suggested Modifiers table and the Willpower-holds-off-the-Beast mechanic are
      // both live, continuously-adjustable per-roll factors (situational chips, a turns-held
      // stepper), not one-time picks, so this is a normal always-present item too.
      {
        id: 'resistfrenzy',
        kind: 'special',
        rulesKind: 'resistfrenzy',
        name: 'Resisting Frenzy',
        formula: 'Res+Com',
        fullFormula: 'Resolve + Composure',
        base: dotsOf(A.Resolve) + dotsOf(A.Composure),
        specs: [],
        nineAgain: false,
        merit: null,
      },
    ],
    freeBuild: { attributeGrid, skillGrid, disciplineGrid },
  };
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

const server = createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${HOST}:${PORT}`);
    const pathname = parsedUrl.pathname;

    if (pathname === '/api/character' && req.method === 'GET') {
      const chars = JSON.parse(await readFile(FIXTURES_PATH, 'utf8'));
      // ?char=<name> lets duo.html (or two tabs on ?as=<name>) load two different real
      // characters as two independent "devices" — defaults to the original single-character
      // mockup's character when absent, so index.html with no query string is unchanged.
      const requestedName = parsedUrl.searchParams.get('char') || CHARACTER_NAME;
      const c = chars.find((x) => x.name === requestedName);
      if (!c) throw Object.assign(new Error(`Fixture character "${requestedName}" not found`), { code: 'ENOENT' });
      const payload = computeCharacterPayload(c);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
      return;
    }

    if (pathname === '/api/roster' && req.method === 'GET') {
      const chars = JSON.parse(await readFile(FIXTURES_PATH, 'utf8'));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(chars.map((c) => ({ name: c.name }))));
      return;
    }

    if (pathname === '/api/challenges' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!body.sourceName || !body.targetName || !body.rollLabel) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'sourceName, targetName and rollLabel are required' }));
        return;
      }
      pruneChallenges();
      const id = String(nextChallengeId++);
      const record = {
        id,
        sourceName: body.sourceName,
        targetName: body.targetName,
        rollLabel: body.rollLabel,
        rollFormula: body.rollFormula || '',
        status: 'pending',
        createdAt: Date.now(),
        resolvedAt: null,
      };
      challenges.set(id, record);
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify(record));
      return;
    }

    if (pathname === '/api/challenges' && req.method === 'GET') {
      pruneChallenges();
      const target = parsedUrl.searchParams.get('target');
      const rows = Array.from(challenges.values())
        .filter((c) => !target || c.targetName === target)
        .sort((a, b) => a.createdAt - b.createdAt);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(rows));
      return;
    }

    const resolveMatch = pathname.match(/^\/api\/challenges\/([^/]+)\/resolve$/);
    if (resolveMatch && req.method === 'PUT') {
      const record = challenges.get(resolveMatch[1]);
      if (!record) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }
      record.status = 'resolved';
      record.resolvedAt = Date.now();
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(record));
      return;
    }

    const urlPath = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.join(__dirname, 'public', urlPath);
    const data = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch (err) {
    res.writeHead(err.code === 'ENOENT' ? 404 : 500, { 'content-type': 'text/plain' });
    res.end(err.code === 'ENOENT' ? 'Not found' : `Server error: ${err.message}`);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Roller convergence live mockup: http://${HOST}:${PORT}`);
  console.log(`Reading real fixture data from: ${FIXTURES_PATH}`);
  console.log(`Character: ${CHARACTER_NAME}`);
  console.log('Read-only. Never writes to TM Game.');
});
