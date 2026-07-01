// Replace Humongulus's junk "test" Rules answers with stock correct answers
// (clean player-style versions of the calibrated key), mapped to the doc's own
// q-keys. Default DRY-RUN; pass --apply to write the responses. Does NOT mark
// complete (approve via the app, or ask to extend this). Run from repo root.
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';

const APPLY = process.argv.includes('--apply');
const HUMONGULUS_RESPONSE_ID = '6a1d61d2220a74385450165b';

// Stock correct answers by RUBRIC INDEX (0..55). Index 51 (Clash of Wills) is
// non-scoring but still has a form key, so it gets a correct answer too.
const STOCK = [
  /*0  Q1 */ 'Attribute + Skill + Discipline (where relevant) + modifiers.',
  /*1  Q2 */ '5 or more successes.',
  /*2  Q3 */ '+3 dice to the pool (or +2 to a Resistance trait when defending).',
  /*3  Q4 */ 'Both sides roll and the most successes wins; a tie is a stalemate (re-roll/continue), not a defender win. Contested = both roll and compare; resisted = the opponent’s trait subtracts dice from your pool before you roll.',
  /*4  Q5 */ 'True.',
  /*5  Q6 */ 'Blood Potency 6.',
  /*6  Q7 */ 'Each Vitae drained is 1 lethal damage to the vessel; taking more Vitae than the vessel’s Stamina imposes the Drained Condition. (We allow 2 Vitae taken without risk for feeding rolls.)',
  /*7  Q8 */ 'Feed the mortal 1 Vitae and spend 1 Willpower.',
  /*8  Q9 */ 'Created by drinking a vampire’s Vitae three times across three separate nights; lasts about a year from the last drink; can be resisted by spending 1 Willpower and rolling Blood Potency - Vitae ingested. It raises the Regnant’s standing and grants bonuses to social and manipulative rolls against the Thrall.',
  /*9  Q10a*/ 'True.',
  /*10 Q10b*/ 'False.',
  /*11 Q11*/ 'Attribute + Skill + Discipline + modifiers.',
  /*12 Q12*/ 'A Clash of Wills: all parties roll Blood Potency + the relevant Discipline (Devotions use the highest prerequisite Discipline; sorcery uses Crúac/Theban). Ties re-roll until one side has more successes; the winner’s power resolves and the others fail.',
  /*13 Q13*/ 'Animalism, Celerity, Obfuscate, Resilience and Vigour can be self-taught; Auspex, Dominate, Majesty, Nightmare and Protean need a teacher with more dots plus imbibing 1 Vitae; Crúac and Theban need a teacher but no Vitae.',
  /*14 Q14*/ 'Their Blood Potency.',
  /*15 Q15*/ 'No.',
  /*16 Q16*/ 'Hunger, sunlight, fire, and conflict.',
  /*17 Q17*/ 'The Bestial Triad sets the Power Attribute used when lashing out and the Condition imposed: Monstrous = Strength / Bestial; Seductive = Presence / Wanton; Competitive = Intelligence / Competitive.',
  /*18 Q18*/ 'Spend 1 Willpower and roll Resolve + Composure (no Willpower bonus); each success holds off frenzy a turn. Reach 5 successes to take control of the frenzy, keeping its benefits but choosing the target and desire.',
  /*19 Q19*/ 'There is no fixed health threshold; any damage can trigger a fear-frenzy check, with penalties scaling for severe damage and the rightmost health boxes.',
  /*20 Q20*/ 'True.',
  /*21 Q21*/ 'An experience that threatens to detach the vampire, risking a loss of Humanity.',
  /*22 Q22*/ 'On a failure you lose a dot of Humanity and gain your Triad Condition (Bestial/Wanton/Competitive).',
  /*23 Q23*/ 'An attached Touchstone gives +2 to detachment rolls (+3 for multiple attached); with none attached you take -2, and losing your last Touchstone can impose Languid.',
  /*24 Q24*/ 'They become a draugr, lost to the Beast, and can no longer be played.',
  /*25 Q25*/ 'Sunlight and fire.',
  /*26 Q26*/ 'Roll 1d10 and add your Initiative Modifier (Dexterity + Composure + modifiers).',
  /*27 Q27*/ 'Defence is the lower of Wits or Dexterity plus Athletics; spend 1 Willpower to raise it by 2 against the first attacker; each attacker after the first offsets one point. Dodge: give up your action and roll double Defence, subtracting successes from attackers.',
  /*28 Q28*/ 'Bashing, lethal and aggravated. Mundane attacks are bashing; some powers/fighting styles (and sunlight at Humanity 5+) inflict lethal; sunlight, fire and some powers cause aggravated.',
  /*29 Q29*/ 'Based on the size and heat of the fire, each on roughly a 0-3 aggravated scale, summed.',
  /*30 Q30*/ '1 Vitae heals 2 bashing or 1 lethal; 1 aggravated needs 5 Vitae and a full day’s sleep.',
  /*31 Q31*/ 'The Social Manoeuvring system (the Doors).',
  /*32 Q32*/ 'Resolve a temporary Condition to gain a Beat; a Persistent Condition grants a Beat once per session when it impacts you.',
  /*33 Q33*/ 'Both Mask and Dirge have a lesser and a greater act: a lesser act (overcoming a small hurdle in defence of it) regains 1 Willpower; a greater (atrocious/existentially risky) act regains all spent Willpower.',
  /*34 Q34*/ 'Boons are favours owed between Kindred, used almost like social currency.',
  /*35 Q35*/ 'True.',
  /*36 Q36*/ 'A stake through the heart, starvation of Vitae, or the last health box filled with lethal damage.',
  /*37 Q37*/ 'Once Removed (childe/sire): +3, no range limit. Twice Removed (siblings/grandchilder/grandsires): +2, same continent. Thrice Removed (cousins, great-grandsires etc.): +1, same city. Clanmates: no bonus, within about a kilometre.',
  /*38 Q38*/ 'Add the Blood Sympathy bonus to the Discipline roll; this is doubled for Crúac.',
  /*39 Q39*/ 'Humanity and Blood Potency together: Humanity sets the baseline duration and Blood Potency multiplies it.',
  /*40 Q40*/ 'Automatically on torpor or Final Death, through intense emotion at the ST’s discretion, or deliberately by spending 1 Willpower and rolling Wits + Blood Sympathy.',
  /*41 Q41*/ 'They are put into torpor until the stake is removed, and are unaware of their surroundings while staked.',
  /*42 Q42*/ 'Equal to your Blood Potency (1 at the lowest), scaling up to 10 and 15 at Blood Potency 9 and 10.',
  /*43 Q43*/ 'Drinking another vampire completely dry, consuming their soul and causing Final Death.',
  /*44 Q44*/ 'The Kiss is non-violent feeding: it induces euphoria, clouds the memory of the encounter, and imposes the Swooning Condition.',
  /*45 Q45*/ 'The amount scales with Humanity (1 lethal up to 5 aggravated) and the frequency with Blood Potency (from once every ten minutes up to several times a turn).',
  /*46 Q46*/ 'Rituals (Crúac Rites / Theban Miracles) are extended actions, not instant powers: you buy the Sorcery Discipline then learn individual rites separately, rolling Manipulation + Occult + Crúac (or Intelligence + Academics + Theban) to a target of successes. Crúac spills Vitae; Theban needs Willpower and a sacrament.',
  /*47 Q47*/ 'No automatic penalty for merely entering, but feeding without the Regent’s permission is Poaching (-2 Vitae), and powers/effects like Oubliette, Lord of the Land, Lex Terrae or Oath of Serfdom can punish trespassers.',
  /*48 Q48*/ 'A dice-pool bonus to feeding rolls.',
  /*49 Q49*/ 'Willpower (and, for Theban rites, a sacrament/offering).',
  /*50 Q50*/ 'Yes.',
  /*51 Q51*/ 'A Clash of Wills - all parties roll Blood Potency + Discipline, ties re-roll, and the most successes wins.',
  /*52 Q52*/ '0 to 5 dots.',
  /*53 Q53*/ 'Both are game states: Conditions attach to a character with their own resolutions or expiry; Tilts are situational scene modifiers affecting combat only.',
  /*54 Q54*/ 'Specialised applications of a Discipline (or a combination), bought with the right prerequisite Discipline dots and used like a Discipline.',
  /*55 Q55*/ 'Several shared merits typically require a coterie, chiefly Safe Place and Haven.',
];

const keyToIndex = (k) => {
  const m = String(k).match(/^q0*(\d+)/i);
  if (!m) return null;
  const n = +m[1];
  return n <= 9 ? n - 1 : n === 10 ? (/bond/i.test(k) ? 10 : 9) : n;
};

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db('tm_suite');

const doc = await db.collection('ordeal_responses').findOne({ _id: new ObjectId(HUMONGULUS_RESPONSE_ID) });
if (!doc) { console.error('Humongulus response not found'); process.exit(1); }

const filled = {};
let mapped = 0, unmapped = [];
for (const k of Object.keys(doc.responses || {})) {
  const idx = keyToIndex(k);
  if (idx == null || idx >= STOCK.length) { unmapped.push(k); continue; }
  filled[k] = STOCK[idx];
  mapped++;
}

console.log(`Humongulus rules response ${doc._id} | ${mapped} keys filled, ${unmapped.length} unmapped${unmapped.length ? ': ' + unmapped.join(',') : ''}`);
for (const k of Object.keys(filled)) console.log(`  ${k.padEnd(28)} <- ${filled[k].slice(0, 60)}...`);

if (APPLY) {
  await db.collection('ordeal_responses').updateOne({ _id: doc._id }, { $set: { responses: filled, updated_at: new Date().toISOString() } });
  console.log('\nAPPLIED: stock answers written (status unchanged; approve via the app to complete + award XP).');
} else {
  console.log('\nDRY-RUN. Re-run with --apply to write.');
}
await client.close();
