/**
 * One-off script: import Mammon's Game 2 downtime from the Excel file.
 * Run: cd server && node import-mammon-dt.js
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const xlsxPath = resolve(__dirname, '..', 'Downtime Mammon.xlsx');

const MONGO_URI = process.env.MONGODB_URI;

async function run() {
  // Parse Excel
  const wb = XLSX.readFile(xlsxPath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  // Should be 1 data row (row index 0 is empty, row index 1 is Mammon)
  const data = rows.find(r => r['Character Name:'] && r['Character Name:'].includes('Yusuf'));
  if (!data) {
    // Try finding any non-empty row
    const nonEmpty = rows.find(r => r['Player Name:'] && r['Player Name:'].trim());
    if (!nonEmpty) { console.error('No data row found'); process.exit(1); }
    Object.assign(data || {}, nonEmpty);
  }

  console.log('Found submission for:', data['Character Name:'], 'by', data['Player Name:']);

  // Connect to MongoDB
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db('tm_suite');

  // Find Mammon's character _id
  const char = await db.collection('characters').findOne({ $or: [{ name: /Mammon/i }, { moniker: 'Mammon' }] });
  if (!char) { console.error('Character "Mammon" not found'); await client.close(); process.exit(1); }

  // Find or determine cycle (Game 2)
  const cycle = await db.collection('downtime_cycles').findOne({ game_number: 2 });
  const cycleId = cycle?._id || null;

  // Map CSV columns to response keys
  const responses = {
    // Gate values
    _gate_attended: data['Did you attend last game?'] || '',
    _gate_is_regent: data['Are you the current Regent of a Territory?'] === 'No' ? 'no' : 'yes',

    // Section 1: Travel
    travel: data['How did your character travel to and from last Court specifically and what precautions did you take, if any? '] || '',

    // Section 2: Game Recount
    game_recount: data['Game Recount'] || '',

    // Section 3: Standout RP
    standout_rp: data['Name one or two players/characters who gave you standout roleplay moments:'] || '',

    // Section 4: IC Correspondence
    ic_correspondence: data['Dear X: A short IC correspondence to an NPC back home'] || '',

    // Section 5: Trust / Harm / Aspirations
    trust: data["Who does your character currently 'trust' the most among the other PCs?"] || '',
    harm: data['Who is your character currently trying to actively harm or hamper among the other PCs?'] || '',
    aspirations: data['What are your current Short/Medium/Long term Aspirations?'] || '',

    // Section 6: Regency
    regent_territory: data['Which Territory are you the Regent of?'] || '',
    regency_residency: data['Which PCs have been granted Residency (Feeding Rights) this month:'] || '',
    regency_residency_count: data['Total PCs granted Residency (Feeding Rights) including you:'] || '',
    regency_action: data['Regency Action: '] || '',

    // Section 7: Feeding
    feeding_description: data['How did your character feed from the city, not Herd, this month?'] || '',
    feeding_territory_academy: data['Which Territory does your character feed or poach in? [The Academy]'] || '',
    feeding_territory_harbour: data['Which Territory does your character feed or poach in? [The City Harbour]'] || '',
    feeding_territory_docklands: data['Which Territory does your character feed or poach in? [The Docklands]'] || '',
    feeding_territory_secondcity: data['Which Territory does your character feed or poach in? [The Second City]'] || '',
    feeding_territory_northshore: data['Which Territory does your character feed or poach in? [The Northern Shore]'] || '',
    feeding_territory_barrens: data['Which Territory does your character feed or poach in? [The Barrens (No Territory)]'] || '',

    // Section 8: Influence spend
    influence_academy: data['Which Territories would you like to spend Influence on, if at all? [The Academy ]'] || '',
    influence_harbour: data['Which Territories would you like to spend Influence on, if at all? [The Harbour]'] || '',
    influence_docklands: data['Which Territories would you like to spend Influence on, if at all? [The Docklands]'] || '',
    influence_secondcity: data['Which Territories would you like to spend Influence on, if at all? [The Second City]'] || '',
    influence_shore: data['Which Territories would you like to spend Influence on, if at all? [The Shore]'] || '',

    // Section 9: Projects (1-4)
    project_1_action: data['Project 1: Action Type'] || '',
    project_1_primary_pool: data['Project 1: Primany Dice Dool + Powers'] || '',
    project_1_secondary_pool: data['Project 1: Seconday Dice Dool + Powers'] || '',
    project_1_outcome: data['Project 1: Desired Outcome'] || '',
    project_1_description: data['Project 1: Description'] || '',

    project_2_action: data['Project 2: Action Type'] || '',
    project_2_primary_pool: data['Project 2: Primany Dice Dool + Powers'] || '',
    project_2_secondary_pool: data['Project 2: Seconday Dice Dool + Powers'] || '',
    project_2_outcome: data['Project 2: Desired Outcome'] || '',
    project_2_description: data['Project 2: Description'] || '',

    project_3_action: data['Project 3: Action Type'] || '',
    project_3_primary_pool: data['Project 3: Primany Dice Dool + Powers'] || '',
    project_3_secondary_pool: data['Project 3: Seconday Dice Dool + Powers'] || '',
    project_3_outcome: data['Project 3: Desired Outcome'] || '',
    project_3_description: data['Project 3: Description'] || '',

    project_4_action: data['Project 4: Action Type'] || '',
    project_4_primary_pool: data['Project 4: Primany Dice Dool + Powers'] || '',
    project_4_secondary_pool: data['Project 4: Seconday Dice Dool + Powers'] || '',
    project_4_outcome: data['Project 4: Desired Outcome'] || '',
    project_4_description: data['Project 4: Description'] || '',

    // Section 10: Sphere actions (1-5)
    has_sphere_merits: data['Do you have Allies, Mortal Status or Mystery Cult Initiate you would like to use?'] || '',
    sphere_1_merit: data['Sphere Action 1: Merit Type'] || '',
    sphere_1_action: data['Sphere Action 1: Action Type'] || '',
    sphere_1_outcome: data['Sphere Action 1: Desired Outcome'] || '',
    sphere_1_description: data['Sphere Action 1: Description'] || '',

    sphere_2_merit: data['Sphere Action 2: Merit Type'] || '',
    sphere_2_action: data['Sphere Action 2: Action Type'] || '',
    sphere_2_outcome: data['Sphere Action 2: Desired Outcome'] || '',
    sphere_2_description: data['Sphere Action 2: Description'] || '',

    sphere_3_merit: data['Sphere Action 3: Merit Type'] || '',
    sphere_3_action: data['Sphere Action 3: Action Type'] || '',
    sphere_3_outcome: data['Sphere Action 3: Desired Outcome'] || '',
    sphere_3_description: data['Sphere Action 3: Description'] || '',

    sphere_4_merit: data['Sphere Action 4: Merit Type'] || '',
    sphere_4_action: data['Sphere Action 4: Action Type'] || '',
    sphere_4_outcome: data['Sphere Action 4: Desired Outcome'] || '',
    sphere_4_description: data['Sphere Action 4: Description'] || '',

    sphere_5_merit: data['Sphere Action 5: Merit Type'] || '',
    sphere_5_action: data['Sphere Action 5: Action Type'] || '',
    sphere_5_outcome: data['Sphere Action 5: Desired Outcome'] || '',
    sphere_5_description: data['Sphere Action 5: Description'] || '',

    // Section 11: Contacts
    has_contacts: data['Do you have Contacts you would like to use? '] || data['Do you have Contacts you would like to use?'] || '',
    contact_1: data['Contact Action: Information Request 1'] || '',
    contact_2: data['Contact Action: Information Request 2'] || '',
    contact_3: data['Contact Action: Information Request 3'] || '',
    contact_4: data['Contact Action: Information Request 4'] || '',
    contact_5: data['Contact Action: Information Request 5'] || '',
    contact_6: data['Contact Action: Information Request 6'] || '',

    // Retainers
    has_retainers: data['Do you have Retainers you would like to use?'] || '',
    retainer_1: data['Retainer Action 1:'] || '',
    retainer_2: data['Retainer Action 2:'] || '',
    retainer_3: data['Retainer Action 3:'] || '',
    retainer_4: data['Retainer Action 4:'] || '',
    retainer_5: data['Retainer Action 5:'] || '',

    // Resources/Acquisitions
    has_acquisitions: data['Do you want to use Resources or Skills to attempt to acquire anything?'] || '',
    resource_acquisitions: data['Resources Merit Acquisitions'] || '',
    skill_acquisitions: data['Skill Based Acquisitions'] || '',

    // Sorcery
    has_sorcery: data['Do you have Theban or Cruac and would you like to cast this Downtime?'] || '',
    sorcery_casting: data['What are you casting?'] || '',

    // Freeform / Misc
    other_activities: data['Anything you want the STs to know about the other things your character gets up to?'] || '',
    xp_spend: data['XP Spend'] || '',
    rules_questions: data['What game rules, elements, or Lore would you like more information about?'] || '',
    form_rating: data['How would you rate this Downtime form for clarity and ease of use?'] || '',
    form_feedback: data['Any comments or recommendations on the Downtime form or Downtimes in general?'] || '',
  };

  // Clean empty strings from responses
  for (const [k, v] of Object.entries(responses)) {
    if (v === '') delete responses[k];
  }

  const doc = {
    character_id: char._id,
    character_name: 'Mammon',
    player_name: data['Player Name:'] || 'Peter Kalt',
    cycle_id: cycleId,
    game_label: 'Game 2',
    status: 'submitted',
    submitted_at: data['Timestamp'] || '2026-03-28T22:26:19.000Z',
    source: 'google_forms_import',
    responses,
  };

  const result = await db.collection('downtime_submissions').insertOne(doc);
  console.log('Inserted submission:', result.insertedId);
  console.log('Response keys:', Object.keys(responses).length);

  await client.close();
}

run().catch(err => { console.error(err); process.exit(1); });
