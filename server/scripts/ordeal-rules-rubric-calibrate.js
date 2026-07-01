// Calibration ledger for the rules_mastery rubric. As we review gradings, the
// user flags expected-answers that are too narrow; each entry here rewrites that
// question's expected_answer to record the accepted variants. Default DRY-RUN;
// pass --apply to write. Re-runnable (overwrites the listed indices only).
// Run from repo root:  node server/scripts/ordeal-rules-rubric-calibrate.js [--apply]
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const APPLY = process.argv.includes('--apply');

// index -> recalibrated expected_answer (accepted variants folded in).
const CALIBRATIONS = [
  {
    index: 0, // Q1
    expected: `Attribute + Skill + Discipline (optional) + modifiers (optional). Minimum accepted: Attribute + Skill + Discipline. (A Specialty counts as one of the optional modifiers, so Attribute + Skill + Specialty also passes.)`,
  },
  {
    index: 3, // Q4
    expected: `Official rules (CofD): both parties roll and whoever scores the most successes wins. A tie produces no winner - it is a stalemate (re-roll/continue), NOT a win for the defender (that is a v1/WoD interpretation). Contested = both roll and compare successes; resisted = the opponent's relevant trait subtracts dice from the actor's pool before the roll.`,
  },
  {
    index: 16, // Q16
    expected: `Hunger, sunlight, fire, and conflict all qualify as frenzy triggers.`,
  },
  {
    index: 8, // Q9
    expected: `Created by drinking a vampire's Vitae THREE times across THREE separate nights - this is the key element required. Lasts ~a year from the last drink; resisted by spending 1 Willpower and rolling Blood Potency - Vitae ingested. Effects: raises the Regnant's standing and grants bonuses to social/manipulative rolls against the Thrall. Effect + duration alone is NOT enough - the three-feeds-over-three-nights creation must be stated.`,
  },
  {
    index: 13, // Q13
    expected: `Animalism, Celerity, Obfuscate, Resilience and Vigour can be self-taught; Auspex, Dominate, Majesty, Nightmare and Protean need a teacher (more dots than the student) plus imbibing 1 Vitae; Cruac and Theban need a teacher but no Vitae. REQUIRED for a pass: show the self-taught vs teacher-required split, not just "imbibe Vitae from a teacher".`,
  },
  {
    index: 17, // Q17
    expected: `The Bestial Triad sets which Power Attribute is used when lashing out and which Condition is imposed: Monstrous = Strength, imposes Bestial; Seductive = Presence, imposes Wanton; Competitive = Intelligence, imposes Competitive. REQUIRED: the Attribute + Condition mapping, not just a description of lashing out.`,
  },
  {
    index: 22, // Q22
    expected: `On a failure: lose a dot of Humanity AND gain your Triad Condition (Bestial/Wanton/Competitive). Key requirement: they must specifically name the Condition gained, not just the Humanity loss. (Full tiers for reference: dramatic failure = Humanity loss + Jaded; success = Condition, no loss; exceptional = Inspired, no loss - but the failure-with-Condition answer is sufficient.)`,
  },
  {
    index: 23, // Q23
    expected: `Full answer required: an attached Touchstone gives +2 to detachment rolls (+3 for multiple attached); no attached Touchstone gives -2; losing the final Touchstone can impose Languid. The +2/+3 bonus alone is near - the penalty/Languid side is needed for a pass.`,
  },
  {
    index: 37, // Q37
    expected: `Once Removed (childe/sire): +3, no range limit. Twice Removed (siblings, grandchilder, grandsires): +2, same continent. Thrice Removed (cousins, aunts/uncles, great-grandsires/childer): +1, same city. Clanmates: no bonus, within ~1 km. Naming the four tiers alone is NEAR; the numeric bonuses (+3/+2/+1/0) are required for a complete pass.`,
  },
  {
    index: 42, // Q42
    expected: `Equal to Blood Potency, scaling up to 10 and 15 at Blood Potency 9 and 10 respectively (1 at the lowest BP). The high-BP scaling is REQUIRED; "equal to BP" / "1 per turn" alone is near.`,
  },
  {
    index: 55, // Q55
    expected: `Several shared merits typically (not explicitly) require a coterie - chiefly Safe Place and Haven. Naming the shared merits (Safe Place / Haven) is enough for a pass; a purely thematic answer (shared feeding/protection) without the merit framing is near.`,
  },
  {
    index: 19, // Q19
    expected: `No single fixed threshold - any damage can trigger a fear-frenzy check, with penalties increasing for severe damage / the rightmost health boxes. Accept EITHER "no fixed threshold / any damage can trigger" OR a specific health-box answer; both are fine here.`,
  },
  {
    index: 39, // Q39
    expected: `Determined by Blood Potency and Humanity together: Humanity sets the baseline duration and Blood Potency multiplies it. A pass needs that detail - Humanity as baseline, BP as multiplier - not just naming the two factors.`,
  },
  {
    index: 33, // Q33
    expected: `Both Mask and Dirge have a lesser and a greater act (VtR 2e). Defending your Mask: a small hurdle (lesser) gains 1 Willpower; an atrocious or existentially risky act (greater) regains all spent Willpower. Likewise the Dirge: withdrawing from your outside life in defence of your truer self (lesser) gains 1 Willpower; a greater such act regains all.`,
  },
  {
    index: 34, // Q34
    expected: `Boons are favours owed between Kindred, functioning almost like social currency - accept this as correct. (The question is designed to probe 1e-vs-2e awareness, but describing boons as favours/currency is not an incorrect answer and must not fail the player.)`,
  },
  {
    index: 46, // Q46
    expected: `Rituals (Crúac Rites / Theban Miracles) differ from Disciplines in being EXTENDED actions, not instant powers. You buy dots in the Crúac/Theban Sorcery Discipline, then learn individual rites separately (each no higher than your Sorcery dots, ~2 XP each). Casting pool is Manipulation + Occult + Crúac, or Intelligence + Academics + Theban Sorcery; roll up to your dice pool (~30 min/roll) accumulating to the rite's target successes; must finish in one attempt, auto-fails if interrupted, no Defence while casting. Costs differ: Crúac spills Vitae; Theban needs 1 Willpower + a sacrament.`,
  },
  {
    index: 47, // Q47
    expected: `No automatic penalty for merely entering. Feeding in a territory without the Regent's permission is Poaching: -2 Vitae (TM Damnation City rule). Specific powers/effects can also punish trespassers - e.g. Oubliette (Obfuscate 5), Lord of the Land (Animalism 5), Lex Terrae, Oath of Serfdom. Socially, Kindred are expected to seek the domain-holder's leave; failing can invite political or violent reprisal.`,
  },
];

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }
const client = new MongoClient(uri);
await client.connect();
const db = client.db('tm_suite');

const doc = await db.collection('ordeal_rubrics').findOne({ ordeal_type: 'rules_mastery' });
if (!doc) { console.error('No rules_mastery rubric'); process.exit(1); }
const byIndex = new Map(doc.questions.map(q => [q.index, q]));

for (const cal of CALIBRATIONS) {
  const q = byIndex.get(cal.index);
  if (!q) { console.log(`SKIP index ${cal.index} — not found`); continue; }
  console.log(`[${cal.index}] ${q.question}`);
  console.log(`  was: ${q.expected_answer}`);
  console.log(`  now: ${cal.expected}\n`);
  if (APPLY) q.expected_answer = cal.expected;
}

if (APPLY) {
  await db.collection('ordeal_rubrics').updateOne({ _id: doc._id }, { $set: { questions: doc.questions } });
  console.log(`APPLIED ${CALIBRATIONS.length} calibration(s).`);
} else {
  console.log(`DRY-RUN: ${CALIBRATIONS.length} calibration(s). Re-run with --apply to write.`);
}
await client.close();
