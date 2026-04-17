/**
 * migrate-player-emails.js
 *
 * One-time migration: patch email addresses into player documents
 * sourced from the Downtime 2 CSV submission form.
 *
 * Usage:
 *   node server/migrate-player-emails.js           — dry run (preview only)
 *   node server/migrate-player-emails.js --apply   — write to MongoDB
 */

import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }

const DRY_RUN = !process.argv.includes('--apply');

// display_name (as stored in players collection) → email from Downtime 2 CSV
const EMAIL_MAP = {
  'Angelus':      'angelus.v.morningstar@gmail.com',
  'Symon G':      'lucky.blue.suit@gmail.com',
  'Kurtis W':     'kurtis@trainwithkurtis.com',
  'Katherine H':  'honankatherine@gmail.com',
  'Katie H':      'i_live_the_dreame@yahoo.com.au',
  'Ashley K':     'asheknight@gmail.com',
  'Archer':       'ice.phoenix.x@gmail.com',
  'Brae C':       'goldentoratorachan@gmail.com',
  'Leo T':        null,   // did not submit DT2 — no email on file
  'Arnold W':     'arnie.walsh2@gmail.com',
  'Bill C':       'billcohen.au@gmail.com',
  'Arlo V':       'arlovalmai@gmail.com',
  'Nathan H':     'nathan.hodge@gmail.com',
  'Jamie H':      'jamie.heskett01@gmail.com',
  'Lyn':          'nolarpingmatter@gmail.com',
  'George T':     'george.tomossy@gmail.com',
  'Stefan S':     null,   // did not submit DT2 — no email on file
  'Clair H':      'clairehosking@gmail.com',
  'Sky K':        'kowe98@gmail.com',
  'Charlie BC':   'dlcharlier@gmail.com',
  'Tiana C':      null,   // did not submit DT2 — no email on file
  'Jessica BC':   'j.i.bokor.wright@gmail.com',
  'Conan F':      'conanfrench1@gmail.com',
  'Luca V':       'luca.f.venn@gmail.com',
  'Matt B':       'm.bennett87@gmail.com',
  'Patrick T':    'p4t.tr4p@gmail.com',
  'Marni K':      'marni.killick@gmail.com',
  'Alana W':      'crowleystailor@gmail.com',
  'Michael V':    'mvanderkolff@gmail.com',
  'Peter K':      'pkalt1970@gmail.com',
  'Amelia I':     'amelia.pond123@gmail.com',
  'Azure':        null,   // did not submit DT2 — no email on file
};

// CSV entries not matched to a known player record — kept for reference
// dbarale19@gmail.com  | Daniel Barale  — no matching player doc found
// james.goodsell.jg@gmail.com | James G — no matching player doc found

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  console.log('Connected to MongoDB\n');

  const col = client.db('tm_suite').collection('players');
  const players = await col.find({}).toArray();

  console.log(DRY_RUN ? '=== DRY RUN — no changes written ===\n' : '=== APPLYING CHANGES ===\n');

  let patched = 0, skipped = 0, notFound = 0;

  for (const [displayName, email] of Object.entries(EMAIL_MAP)) {
    const player = players.find(p => p.display_name === displayName);

    if (!player) {
      console.log(`  NOT FOUND  | "${displayName}"`);
      notFound++;
      continue;
    }

    if (!email) {
      console.log(`  SKIP       | "${displayName}" — no email available`);
      skipped++;
      continue;
    }

    if (player.email === email) {
      console.log(`  UNCHANGED  | "${displayName}" → ${email}`);
      skipped++;
      continue;
    }

    console.log(`  ${DRY_RUN ? 'WOULD PATCH' : 'PATCHING'}  | "${displayName}" → ${email}`);

    if (!DRY_RUN) {
      await col.updateOne({ _id: player._id }, { $set: { email } });
    }
    patched++;
  }

  console.log(`\n${DRY_RUN ? 'Would patch' : 'Patched'}: ${patched}  |  Skipped: ${skipped}  |  Not found: ${notFound}`);

  if (DRY_RUN) {
    console.log('\nRe-run with --apply to write changes.');
  }

  await client.close();
}

main().catch(err => { console.error(err); process.exit(1); });
