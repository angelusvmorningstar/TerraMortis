/* Downtime form question definitions — data-driven form rendering.
 * Each section maps to the Downtime Google Form structure.
 * The 'key' on each question becomes the field name in MongoDB.
 * Sections with a 'gate' property are only shown when the corresponding
 * DOWNTIME_GATES question is answered 'yes'.
 * Sections with a 'slots' property render that many repeating slot groups.
 */

// Action type options shared across project slots
const PROJECT_ACTIONS = [
  { value: '', label: '— No Action Taken —' },
  { value: 'ambience_increase', label: 'Ambience Change (Increase): Make a Territory delicious' },
  { value: 'ambience_decrease', label: 'Ambience Change (Decrease): Make Territory not delicious' },
  { value: 'attack', label: 'Attack: Attempt to destroy merits, holdings, projects, or NPCs' },
  { value: 'feed', label: 'Feed: Dedicate extra time to feeding' },
  { value: 'hide_protect', label: 'Hide/Protect: Attempt to secure actions, merits, holdings, or projects' },
  { value: 'investigate', label: 'Investigate: Begin or further an investigation' },
  { value: 'patrol_scout', label: 'Patrol/Scout: Attempt to monitor a given Territory or area' },
  { value: 'support', label: 'Support: Assists any other action type by you or another' },
  { value: 'xp_spend', label: 'XP Spend: Grow your character' },
  { value: 'misc', label: 'Misc: For things that don\'t fit in other categories' },
];

// Action type options for sphere (social merit) slots
const SPHERE_ACTIONS = [
  { value: '', label: '— No Action Taken —' },
  { value: 'ambience_increase', label: 'Ambience Change (Increase): Make a Territory delicious' },
  { value: 'ambience_decrease', label: 'Ambience Change (Decrease): Make Territory not delicious' },
  { value: 'attack', label: 'Attack: Attempt to destroy merits, holdings, projects, or NPCs' },
  { value: 'block', label: 'Block: Prevent someone else from using a specific Social Merit' },
  { value: 'hide_protect', label: 'Hide/Protect: Attempt to secure actions, merits, holdings, or projects' },
  { value: 'investigate', label: 'Investigate: Begin or further an investigation' },
  { value: 'patrol_scout', label: 'Patrol/Scout: Attempt to monitor a given Territory or area' },
  { value: 'rumour', label: 'Rumour: When you don\'t know what you want, but you want something' },
  { value: 'support', label: 'Support: Assists any other action type by you or another' },
  { value: 'grow', label: 'Grow: Attempt to acquire Allies or Status 4 or 5' },
  { value: 'misc', label: 'Misc: For things that don\'t fit in other categories' },
  { value: 'acquisition', label: 'Acquisition: Use your standing in Status/Mystery Cult to procure an item' },
];

const TERRITORIES = [
  'The Academy',
  'The City Harbour',
  'The Docklands',
  'The Second City',
  'The Northern Shore',
  'The Barrens (No Territory)',
];

const REGENT_TERRITORIES = [
  'The Academy',
  'The Dockyards',
  'The Harbour',
  'The North Shore',
  'The Second City',
];

// Helper: generate select options for a numeric range (inclusive)
function numRange(min, max) {
  return Array.from({ length: max - min + 1 }, (_, i) => {
    const v = String(min + i);
    return { value: v, label: v };
  });
}

// Helper: build repeating project slot questions (4 slots)
function buildProjectSlots() {
  const questions = [];
  for (let n = 1; n <= 4; n++) {
    questions.push(
      {
        key: `project_${n}_action`,
        label: `Project ${n}: Action Type`,
        type: 'select',
        required: n === 1,
        desc: null,
        options: PROJECT_ACTIONS,
      },
      {
        key: `project_${n}_pool`,
        label: `Project ${n}: Primary Dice Pool + Powers`,
        type: 'text',
        required: false,
        desc: 'Attribute + Skill + Relevant Specialty (optional) + Discipline (optional) = Total',
      },
      {
        key: `project_${n}_pool2`,
        label: `Project ${n}: Secondary Dice Pool + Powers`,
        type: 'text',
        required: false,
        desc: 'Optional secondary dice pool',
      },
      {
        key: `project_${n}_outcome`,
        label: `Project ${n}: Desired Outcome`,
        type: 'text',
        required: false,
        desc: 'Each Project must aim to achieve ONE clear thing.',
      },
      {
        key: `project_${n}_description`,
        label: `Project ${n}: Description`,
        type: 'textarea',
        required: false,
        desc: 'Project Name:\nCharacters involved:\nMerits & Bonuses:\nXP Spend:\nProject description:',
      },
    );
  }
  return questions;
}

// Helper: build repeating sphere slot questions (5 slots)
function buildSphereSlots() {
  const questions = [];
  for (let n = 1; n <= 5; n++) {
    questions.push(
      {
        key: `sphere_${n}_merit`,
        label: `Sphere Action ${n}: Merit Type`,
        type: 'text',
        required: false,
        desc: 'e.g. Allies 3 (Finance) or Status 2 (Media)',
      },
      {
        key: `sphere_${n}_action`,
        label: `Sphere Action ${n}: Action Type`,
        type: 'select',
        required: n === 1,
        desc: null,
        options: SPHERE_ACTIONS,
      },
      {
        key: `sphere_${n}_outcome`,
        label: `Sphere Action ${n}: Desired Outcome`,
        type: 'text',
        required: false,
        desc: null,
      },
      {
        key: `sphere_${n}_description`,
        label: `Sphere Action ${n}: Description`,
        type: 'textarea',
        required: false,
        desc: null,
      },
    );
  }
  return questions;
}

// Helper: build repeating contact slot questions (6 slots)
function buildContactSlots() {
  return Array.from({ length: 6 }, (_, i) => ({
    key: `contact_${i + 1}`,
    label: `Contact Action: Information Request ${i + 1}`,
    type: 'textarea',
    required: false,
    desc: 'Contact Type:\nSupporting Info:\nRequest:',
  }));
}

// Helper: build repeating retainer slot questions (5 slots)
function buildRetainerSlots() {
  return Array.from({ length: 5 }, (_, i) => ({
    key: `retainer_${i + 1}`,
    label: `Retainer Action ${i + 1}`,
    type: 'textarea',
    required: false,
    desc: 'Retainer Name:\nRetainer Dot Rating:\nArea of Expertise:\nSupporting Info:\nRequest:',
  }));
}

export const DOWNTIME_SECTIONS = [
  // 1. Court — gated: only shown if the player attended last game
  {
    key: 'court',
    title: 'Court: Politics and Correspondence',
    gate: 'attended',
    intro: null,
    questions: [
      {
        key: 'travel',
        label: 'How did your character travel to and from last Court specifically and what precautions did you take, if any?',
        type: 'textarea',
        required: true,
        desc: 'Include mode of transport, route, and any measures taken to avoid surveillance or danger.',
      },
      {
        key: 'game_recount',
        label: 'Game Recount: 3–5 highlights or actions you took in-character.',
        type: 'textarea',
        required: true,
        desc: 'Summarise the key things your character did or said at Court. What conversations did you have? What plots did you advance or uncover? What did you witness?\n\nExample: "I approached Lord Vance about the missing shipment, then coordinated with Iseult to pressure the Carthians before the vote. I avoided Mammon entirely after last session\'s confrontation."',
      },
      {
        key: 'rp_shoutout',
        label: 'Name one or two players/characters who gave you standout roleplay moments.',
        type: 'textarea',
        required: true,
        desc: 'Acknowledge peers whose performance or collaboration made the session memorable for you.',
      },
      {
        key: 'correspondence',
        label: 'Dear X: A short in-character correspondence to an NPC back home.',
        type: 'textarea',
        required: false,
        desc: 'Write a brief letter, message, or communiqué from your character to a contact, sire, childe, or associate not present at Court.\n\nExample: "Dear Magistrix, The colonials are more fractious than anticipated. The Invictus here lack a unifying voice. I have begun positioning accordingly — your investment is well placed. Yours in blood, V."',
      },
      {
        key: 'trust',
        label: 'Who does your character currently \'trust\' the most among the other PCs?',
        type: 'textarea',
        required: false,
        desc: 'Briefly explain why. Trust is not the same as friendship — it may be pragmatic.',
      },
      {
        key: 'harm',
        label: 'Who is your character currently trying to actively harm or hamper among the other PCs?',
        type: 'textarea',
        required: false,
        desc: 'Briefly explain the motive and method. This informs ST plot preparation.',
      },
      {
        key: 'aspirations',
        label: 'What are your current Short/Medium/Long term Aspirations?',
        type: 'textarea',
        required: false,
        desc: 'Briefly outline the goals you\'re working towards.\n\nShort: Something achievable this session or next.\nMedium: A goal spanning a few sessions.\nLong: A defining ambition that may take months of play.',
      },
    ],
  },

  // 2. Regency — gated: only shown if the player is a current Regent
  {
    key: 'regency',
    title: 'Regency: The Hand that Feeds',
    gate: 'is_regent',
    intro: null,
    questions: [
      {
        key: 'regent_territory',
        label: 'Which Territory are you the Regent of?',
        type: 'select',
        required: true,
        desc: null,
        options: REGENT_TERRITORIES.map(t => ({ value: t, label: t })),
      },
      {
        key: 'residency_grants',
        label: 'Which PCs have been granted Residency (Feeding Rights) this month?',
        type: 'textarea',
        required: true,
        desc: 'List character names. Residency grants the recipient access to your territory\'s feeding pools without it counting as poaching.',
      },
      {
        key: 'residency_count',
        label: 'Total PCs granted Residency including you:',
        type: 'select',
        required: true,
        desc: null,
        options: numRange(1, 20),
      },
      {
        key: 'regency_action',
        label: 'Regency Action',
        type: 'textarea',
        required: false,
        desc: 'You are known as Regent of a territory. What do you want to make known about your domain this month? This may include proclamations, policies, enforcement, or any public stance you wish to communicate to other Kindred.',
      },
    ],
  },

  // 3. Feeding — always shown
  {
    key: 'feeding',
    title: 'The City: Territory and Feeding',
    gate: null,
    intro: null,
    questions: [
      {
        key: 'feeding_description',
        label: 'How did your character feed from the city this month?',
        type: 'textarea',
        required: true,
        desc: 'Primary Feeding Pool: Attribute + Skill (+ Discipline, optional)\nBlood Type: Cold/Animal/Human/Kindred\nFeeding Style: Short description\n\nExample: "Manipulation + Socialise (Wits, Auspex optional). Human. She frequents late-night bars in the Docklands, charming lonely patrons into quiet corners."',
      },
      {
        key: 'feeding_territories',
        label: 'Which Territory does your character feed or poach in?',
        type: 'textarea',
        required: true,
        desc: 'List territories and whether you are Resident or Poaching in each.\n\nExample: "The Docklands — Resident. The Second City — Poaching."',
      },
      {
        key: 'influence_spend',
        label: 'Which Territories would you like to spend Influence on, if at all?',
        type: 'textarea',
        required: false,
        desc: 'You may only spend as much Influence as you have on your sheet. State the Territory and the amount of Influence spent.',
      },
    ],
  },

  // 4. Projects — always shown, 4 repeating slots
  {
    key: 'projects',
    title: 'Projects: Personal Actions',
    gate: null,
    slots: 4,
    intro: 'You have up to four Project slots this Downtime. Each Project must aim to achieve one clear outcome. The first Project is required; the rest are optional.',
    questions: buildProjectSlots(),
  },

  // 5. Spheres of Influence — gated, 5 repeating slots
  {
    key: 'spheres',
    title: 'Spheres of Influence',
    gate: 'has_spheres',
    slots: 5,
    intro: 'Use this section to direct your Allies, mortal Status, or Mystery Cult Initiate merits. You have up to five Sphere Action slots.',
    questions: buildSphereSlots(),
  },

  // 6. Contacts — gated, 6 repeating slots
  {
    key: 'contacts',
    title: 'Contacts: Requests for Information',
    gate: 'has_contacts',
    slots: 6,
    intro: 'Each Contact can be tasked with a single information request per Downtime. Provide as much supporting context as possible to help the STs adjudicate the result.',
    questions: buildContactSlots(),
  },

  // 7. Retainers — gated, 5 repeating slots
  {
    key: 'retainers',
    title: 'Retainers: Task Delegation',
    gate: 'has_retainers',
    slots: 5,
    intro: 'Retainers act independently on your behalf. Their dot rating determines the scope and reliability of their actions. Provide clear instructions and context.',
    questions: buildRetainerSlots(),
  },

  // 8. Acquisitions — gated
  {
    key: 'acquisitions',
    title: 'Acquisition: Resources and Skills',
    gate: 'has_acquisitions',
    intro: null,
    questions: [
      {
        key: 'resources_acquisitions',
        label: 'Resources Merit Acquisitions',
        type: 'textarea',
        required: false,
        desc: 'Character Resources Level:\nRelevant Merit:\nAcquisition Description:\nAvailability:\n\nExample: "Resources 3. Contacts (Antiques Dealer). Sourcing a pre-WWII grimoire of Theban scripture for Iseult. Availability: Rare."',
      },
      {
        key: 'skill_acquisitions',
        label: 'Skill Based Acquisitions',
        type: 'textarea',
        required: false,
        desc: 'Limited to ONE skill-based acquisition per Downtime. Describe what you are attempting to obtain, the skill being used, and any relevant context.',
      },
    ],
  },

  // 9. Blood Sorcery — gated
  {
    key: 'blood_sorcery',
    title: 'Blood Sorcery: Theban and Cruac',
    gate: 'has_sorcery',
    intro: null,
    questions: [
      {
        key: 'sorcery_casting',
        label: 'What are you casting?',
        type: 'textarea',
        required: false,
        desc: 'Ritual Name/Level:\nCaster/s:\nTarget/s:\nDuration:\nEffects and page reference:\nVitae/Willpower Spent:\n\nExample: "Rite of Surcease (Theban 2). Caster: Sister Agatha. Target: Self. Duration: One month. Effects: Suppress a persistent Condition (p. 184). Vitae Spent: 2."',
      },
    ],
  },

  // 10. Vamping — always shown
  {
    key: 'vamping',
    title: 'Vamping: Fever for the Flavour',
    gate: null,
    intro: null,
    questions: [
      {
        key: 'vamping',
        label: 'Anything you want the STs to know about the other things your character gets up to?',
        type: 'textarea',
        required: false,
        desc: 'Soft RP, general flavour, non-mechanical activities, personal habits, quirks, or fun. This section won\'t generate rolls but informs ST narration and may influence ongoing plots.\n\nExample: "Konstantin spends most nights at the casino, cultivating his image as a wealthy eccentric. He\'s been composing a letter to his sire that he never sends."',
      },
    ],
  },

  // 11. Admin — always shown
  {
    key: 'admin',
    title: 'Admin: Crunching Numbers and Asking Questions',
    gate: null,
    intro: null,
    questions: [
      {
        key: 'xp_spend',
        label: 'XP Spend',
        type: 'textarea',
        required: false,
        desc: 'XP Claimed: Game Attendance 1, Costuming/Immersion 1, Downtime 1\nTotal XP Spent:\nFree Spend:\n\nExample: "XP Claimed: 3. Spent 2 on Persuasion (Skills 2 XP/dot). Free Spend: 1 remaining."',
      },
      {
        key: 'lore_request',
        label: 'What game rules, elements, or Lore would you like more information about?',
        type: 'textarea',
        required: false,
        desc: 'Ask anything — rules clarifications, in-character history, covenant doctrine, NPC backgrounds, or setting details.',
      },
      {
        key: 'form_rating',
        label: 'How would you rate this Downtime form for clarity and ease of use?',
        type: 'select',
        required: false,
        desc: null,
        options: numRange(1, 10),
      },
      {
        key: 'form_feedback',
        label: 'Any comments or recommendations on the Downtime form?',
        type: 'textarea',
        required: false,
        desc: 'We iterate on this form each cycle. Your feedback helps us make it clearer and more useful.',
      },
    ],
  },
];

export const DOWNTIME_GATES = [
  {
    key: 'attended',
    label: 'Did you attend last game?',
    type: 'radio',
    options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
  },
  {
    key: 'is_regent',
    label: 'Are you the current Regent of a Territory?',
    type: 'radio',
    options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
  },
  {
    key: 'has_spheres',
    label: 'Do you have Allies, Mortal Status or Mystery Cult Initiate you would like to use?',
    type: 'radio',
    options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
  },
  {
    key: 'has_contacts',
    label: 'Do you have Contacts you would like to use?',
    type: 'radio',
    options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
  },
  {
    key: 'has_retainers',
    label: 'Do you have Retainers you would like to use?',
    type: 'radio',
    options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
  },
  {
    key: 'has_acquisitions',
    label: 'Do you want to use Resources or Skills to attempt to acquire anything?',
    type: 'radio',
    options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
  },
  {
    key: 'has_sorcery',
    label: 'Do you have Theban or Cruac you wish to use during Downtime?',
    type: 'radio',
    options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
  },
];
