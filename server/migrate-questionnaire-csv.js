/**
 * migrate-questionnaire-csv.js
 *
 * Import Character Details.csv (Google Form questionnaire responses)
 * into the questionnaire_responses collection.
 *
 * Resolves player_id and character_id via the players collection, matched
 * by display_name (using the hardcoded email → display_name map below).
 * Does NOT use chars_v2.json.
 *
 * Usage:
 *   node server/migrate-questionnaire-csv.js           — dry run
 *   node server/migrate-questionnaire-csv.js --apply   — write to MongoDB
 *   node server/migrate-questionnaire-csv.js --apply --force — overwrite existing
 */

import 'dotenv/config';
import fs from 'fs';
import { createRequire } from 'module';
import { MongoClient, ObjectId } from 'mongodb';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }

const DRY_RUN = !process.argv.includes('--apply');
const FORCE   = process.argv.includes('--force');

// ── CSV email → players.display_name ──────────────────────────────────────────
// Source: questionnaire CSV emails matched to known player display_names.
// Entries set to null have no player record yet.
const EMAIL_TO_DISPLAY_NAME = {
  'crowleystailor@gmail.com':      'Alana W',
  'andrewgrech990@gmail.com':      null,  // Andrew Grech — no player record
  'soundwave.au@gmail.com':        'Archer',
  'arlovalmai@gmail.com':          'Arlo V',
  'arnie.walsh2@gmail.com':        'Arnold W',
  'billcohen.au@gmail.com':        'Bill C',
  'goldentoratorachan@gmail.com':  'Brae C',
  'asheknight@gmail.com':          'Ashley K',
  'conanfrench1@gmail.com':        'Conan F',
  'george.tomossy@gmail.com':      'George T',
  'jack.heskett@heskett.id.au':    'Jamie H',
  'honankatherine@gmail.com':      'Katherine H',
  'kitten.morag@gmail.com':        'Katie H',
  'kurtisorama@gmail.com':         'Kurtis W',
  'leo.tomossy@gmail.com':         'Leo T',
  'luca.f.venn@gmail.com':         'Luca V',
  'nolarpingmatter@gmail.com':     'Lyn',
  'dlcharlier@gmail.com':          'Charlie BC',
  'nathan.hodge@gmail.com':        'Nathan H',
  'pkalt1970@gmail.com':           'Peter K',
  'phillip.garth@outlook.com':     null,  // Phillip Garth — no player record yet
  'kowe98@gmail.com':              'Sky K',
  'lucky.blue.suit@gmail.com':     'Symon G',
  'p4t.tr4p@gmail.com':            'Patrick T',
  'dbarale19@gmail.com':           null,  // Daniel Barale (Etsy) — no player record
  'amelia.m.inglis@gmail.com':     'Amelia I',
  'james.goodsell.jg@gmail.com':   null,  // James Goodsell (Xavier) — no player record
};

// ── Mask and Dirge column headers ─────────────────────────────────────────────
const MASK_DIRGE_HEADERS = [
  '12. Mask and Dirge   [Authoritarian: Must control and dominate.]',
  '12. Mask and Dirge   [Child: Seeks protection, avoids responsibility.]',
  '12. Mask and Dirge   [Competitor: Must test themselves constantly.]',
  '12. Mask and Dirge   [Conformist: Needs structure and hierarchy.]',
  '12. Mask and Dirge   [Conspirator: Adds unnecessary complexity.]',
  '12. Mask and Dirge   [Courtesan: Lives to entertain.]',
  '12. Mask and Dirge   [Cult Leader: Demands faith and devotion.]',
  '12. Mask and Dirge   [Deviant: Breaks norms through crime and debauchery.]',
  '12. Mask and Dirge   [Follower: Needs direction from others.]',
  '12. Mask and Dirge   [Guru: Learns and teaches .]',
  '12. Mask and Dirge   [Idealist: Pursues perfect future, no compromise.]',
  '12. Mask and Dirge   [Jester: Makes everything absurd.]',
  '12. Mask and Dirge   [Junkie: Prioritises indulgence.]',
  '12. Mask and Dirge   [Martyr: Sacrifices for others.]',
  '12. Mask and Dirge   [Masochist: Seeks suffering.]',
  '12. Mask and Dirge   [Monster: Exists to torment.]',
  '12. Mask and Dirge   [Nomad: Cannot remain stationary.]',
  '12. Mask and Dirge   [Nurturer: Helps others succeed.]',
  '12. Mask and Dirge   [Penitent: Embodies regret.]',
  '12. Mask and Dirge   [Perfectionist: Demands flawless execution.]',
  '12. Mask and Dirge   [Questioner: Challenges assumptions.]',
  '12. Mask and Dirge   [Rebel: Rejects tradition.]',
  '12. Mask and Dirge   [Scholar: Must uncover truth.]',
  '12. Mask and Dirge   [Social Chameleon: Blends everywhere.]',
  '12. Mask and Dirge   [Spy: Uncovers secrets.]',
  '12. Mask and Dirge   [Survivor: Prioritises safety.]',
  '12. Mask and Dirge   [Visionary: Pursues greater vision.]',
];

// Extract archetype name from header: "[Authoritarian: Must..." → "Authoritarian"
function archetypeName(header) {
  const m = header.match(/\[([^:]+):/);
  return m ? m[1].trim() : header;
}

// ── Build structured responses object from a CSV row ─────────────────────────
function buildResponses(row) {
  const mask = [];
  const dirge = [];
  for (const h of MASK_DIRGE_HEADERS) {
    const val = (row[h] || '').trim();
    if (val === 'Mask')  mask.push(archetypeName(h));
    if (val === 'Dirge') dirge.push(archetypeName(h));
  }

  // q21 key has smart-quote in UTF-8 which xlsx may decode differently — find it
  const q21Key = Object.keys(row).find(k => k.startsWith('21. What')) || '';

  return {
    gaming_preferences:     (row['To help the Storytellers create the best possible experience for you, please share your gaming preferences:  '] || '').trim(),
    support_needed:         (row['What support would help you thrive in this chronicle?  '] || '').trim(),
    character_name:         (row['1. Character Name'] || '').trim(),
    high_concept:           (row['2. High Concept'] || '').trim(),
    clan:                   (row['3. Clan'] || '').trim(),
    bloodline:              (row['4. Bloodline'] || '').trim(),
    bloodline_rationale:    (row['5. Bloodline rationale'] || '').trim(),
    covenant:               (row['6. Covenant'] || '').trim(),
    covenant_factions:      (row['7. Covenant Factions'] || '').trim(),
    embrace_date:           (row['8. Embrace'] || '').trim(),
    blood_potency:          (row['9. Blood Potency'] || '').trim(),
    apparent_age:           (row['10. Apparent Age'] || '').trim(),
    conflict_approach:      (row['11. What is your preferred approach to conflict?  '] || '').trim(),
    mask,
    dirge,
    court_motivation:       (row['14. What motivates your character to attend Court?'] || '').trim(),
    sydney_goals:           (row['15. What does your character hope to achieve in Sydney?  '] || '').trim(),
    why_sydney:             (row['16. Why did your character come to Sydney?  '] || '').trim(),
    why_covenant:           (row['17. Why did your character join their Covenant?'] || '').trim(),
    covenant_goals:         (row["18. What are your character's goals within their Covenant?  "] || '').trim(),
    clan_goals:             (row["19. What are your character's goals within their Clan?"] || '').trim(),
    aspired_position:       (row['20. What position or role does your character aspire to hold?'] || '').trim(),
    view_traditions:        (row[q21Key] || '').trim(),
    respect_elysium:        (row['22. Does your character respect the sanctity of Elysium?'] || '').trim(),
    view_mortals_ghouls:    (row['23. How does your character view mortals and ghouls?'] || '').trim(),
    embrace_description:    (row['24. Describe your Embrace  '] || '').trim(),
    sire:                   (row['25. Who is your sire?'] || '').trim(),
    early_nights:           (row['26. Early Nights'] || '').trim(),
    political_landscape:    (row['27. Political Landscape of Last City  '] || '').trim(),
    mortal_family:          (row['28. Mortal Family  '] || '').trim(),
    touchstones:            (row['29. Current Touchstones  '] || '').trim(),
    hunting_style:          (row['30. Hunting Style  '] || '').trim(),
    first_kill:             (row['31. First Kill'] || '').trim(),
    common_indulgences:     (row['32. Common Indulgences  '] || '').trim(),
    pc_allies:              (row['33. Do you have allies or friends among other player characters?  '] || '').trim(),
    coterie:                (row['34. Are you in a coterie with any other PCs?  '] || '').trim(),
    pc_enemies:             (row['35. Do you have enemies or rivals among the PCs?  '] || '').trim(),
    opposed_covenant:       (row['36. Is there any covenant you particularly oppose?  '] || '').trim(),
    intolerable_behaviours: (row['37. What Kindred behaviours, manners, or habits which your character does not tolerate?  '] || '').trim(),
    favours:                (row['38. Who among the PCs do you owe favours to, or who owes you? '] || '').trim(),
    dangerous_secrets:      (row['39. Do any PCs know a dangerous secret about your character? Or do you know one about another?  '] || '').trim(),
  };
}

// ── Parse Google Forms timestamp: "M/D/YYYY HH:MM:SS" → ISO string ────────────
function parseTimestamp(ts) {
  if (!ts) return null;
  const m = String(ts).match(/^(\d+)\/(\d+)\/(\d{4})\s+(\d+):(\d+):(\d+)/);
  if (!m) return null;
  const [, month, day, year, h, min, sec] = m;
  return new Date(
    `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}` +
    `T${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}Z`
  ).toISOString();
}

async function main() {
  // ── Load CSV ──────────────────────────────────────────────────────────────
  const csvPath = new URL('../Character Details.csv', import.meta.url).pathname
    .replace(/^\/([A-Z]:)/, '$1')
    .replace(/%20/g, ' ');

  if (!fs.existsSync(csvPath)) {
    console.error('Source file not found:', csvPath);
    process.exit(1);
  }

  const wb   = XLSX.readFile(csvPath, { type: 'file', raw: false });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
  console.log(`Loaded ${rows.length} rows from Character Details.csv\n`);

  // ── Connect ───────────────────────────────────────────────────────────────
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  console.log('Connected to MongoDB\n');

  const db         = client.db('tm_suite');
  const playersCol = db.collection('players');
  const qCol       = db.collection('questionnaire_responses');

  // ── Load players — index by display_name ──────────────────────────────────
  const allPlayers   = await playersCol.find({}).toArray();
  const playerByName = new Map(allPlayers.map(p => [p.display_name, p]));
  console.log(`Loaded ${allPlayers.length} players from players collection\n`);

  // ── Existing doc guard ────────────────────────────────────────────────────
  const existingCount = await qCol.countDocuments({});
  if (existingCount > 0 && !FORCE) {
    console.log(`${existingCount} questionnaire_responses already exist. Add --force to overwrite.\n`);
  }

  console.log(DRY_RUN ? '=== DRY RUN — no changes written ===\n' : '=== APPLYING CHANGES ===\n');

  let inserted = 0, updated = 0, skipped = 0;

  for (const row of rows) {
    const email      = (row['Email Address'] || '').toLowerCase().trim();
    const playerName = (row['Player Name'] || '').trim();
    const charName   = (row['1. Character Name'] || '').trim();
    const timestamp  = row['Timestamp'];

    if (!email) {
      console.log(`  SKIP (no email)        | ${playerName}`);
      skipped++; continue;
    }

    // Check if this email is in our map
    if (!(email in EMAIL_TO_DISPLAY_NAME)) {
      console.log(`  SKIP (unknown email)   | ${playerName} <${email}>`);
      skipped++; continue;
    }

    const displayName = EMAIL_TO_DISPLAY_NAME[email];
    if (!displayName) {
      console.log(`  SKIP (no player record)| ${playerName} <${email}> — needs a player document first`);
      skipped++; continue;
    }

    const player = playerByName.get(displayName);
    if (!player) {
      console.log(`  SKIP (player not found)| ${displayName} (from ${email})`);
      skipped++; continue;
    }

    const charIds = player.character_ids || [];
    if (charIds.length === 0) {
      console.log(`  SKIP (no character_ids)| ${displayName}`);
      skipped++; continue;
    }

    // Use first character_id (each active player has one current character)
    const charOid   = new ObjectId(String(charIds[0]));
    const playerOid = player._id instanceof ObjectId ? player._id : new ObjectId(String(player._id));

    // Check for existing doc
    const existing = await qCol.findOne({ character_id: { $in: [charOid, charOid.toString()] } });
    if (existing && !FORCE) {
      console.log(`  SKIP (exists)          | ${displayName} — ${charName}`);
      skipped++; continue;
    }

    const responses   = buildResponses(row);
    const submittedAt = parseTimestamp(timestamp);
    const now         = new Date().toISOString();

    const maskStr  = responses.mask.join(', ')  || '—';
    const dirgeStr = responses.dirge.join(', ') || '—';
    const action   = existing
      ? (DRY_RUN ? 'WOULD UPDATE' : 'UPDATING ')
      : (DRY_RUN ? 'WOULD INSERT' : 'INSERTING');

    console.log(`  ${action} | ${displayName} — ${charName}`);
    console.log(`            Mask: ${maskStr}  |  Dirge: ${dirgeStr}`);

    if (!DRY_RUN) {
      const doc = {
        character_id:   charOid,
        character_name: charName,
        player_id:      playerOid,
        player_name:    playerName,
        status:         'approved',
        responses,
        submitted_at:   submittedAt,
        approved_at:    now,
        created_at:     submittedAt || now,
        updated_at:     now,
      };

      if (existing) {
        await qCol.updateOne({ _id: existing._id }, { $set: doc });
        updated++;
      } else {
        await qCol.insertOne(doc);
        inserted++;
      }
    } else {
      if (existing) updated++; else inserted++;
    }
  }

  console.log(`\n${DRY_RUN ? 'Would insert' : 'Inserted'}: ${inserted}  |  ${DRY_RUN ? 'Would update' : 'Updated'}: ${updated}  |  Skipped: ${skipped}`);

  if (DRY_RUN) {
    console.log('\nRe-run with --apply to write changes.');
    console.log('Add --force to overwrite existing records.');
  }

  await client.close();
}

main().catch(err => { console.error(err); process.exit(1); });
