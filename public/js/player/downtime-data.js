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
export const SPHERE_ACTIONS = [
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

export const FEEDING_TERRITORIES = [
  'The Academy',
  'The City Harbour',
  'The Docklands',
  'The Second City',
  'The Northern Shore',
  'The Barrens (No Territory)',
];

// Ambience rating → PC feeding cap (from Damnation City rules)
export const AMBIENCE_CAP = {
  'Hostile':   0,
  'Barrens':   0,
  'Neglected': 4,
  'Untended':  5,
  'Settled':   6,
  'Tended':    6,
  'Curated':   7,
  'Verdant':   7,
  'The Rack':  8,
};

// Territory definitions with current ambience (mirrors city-views.js)
export const TERRITORY_DATA = [
  { id: 'academy',    name: 'The Academy',    ambience: 'Curated',  ambienceMod: +3 },
  { id: 'dockyards',  name: 'The Dockyards',  ambience: 'Settled',  ambienceMod:  0 },
  { id: 'harbour',    name: 'The Harbour',    ambience: 'Untended', ambienceMod: -2 },
  { id: 'northshore', name: 'The North Shore', ambience: 'Tended',  ambienceMod: +2 },
  { id: 'secondcity', name: 'The Second City', ambience: 'Tended',  ambienceMod: +2 },
];

// Helper: generate select options for a numeric range (inclusive)
function numRange(min, max) {
  return Array.from({ length: max - min + 1 }, (_, i) => {
    const v = String(min + i);
    return { value: v, label: v };
  });
}

export { PROJECT_ACTIONS };

export const FEED_METHODS = [
  { id: 'seduction', name: 'Seduction', desc: 'Lure a vessel close', attrs: ['Presence', 'Manipulation'], skills: ['Empathy', 'Socialise', 'Persuasion'], discs: ['Majesty', 'Dominate'] },
  { id: 'stalking', name: 'Stalking', desc: 'Prey on a target unseen', attrs: ['Dexterity', 'Wits'], skills: ['Stealth', 'Athletics'], discs: ['Protean', 'Obfuscate'] },
  { id: 'force', name: 'By Force', desc: 'Overpower and drain', attrs: ['Strength'], skills: ['Brawl', 'Weaponry'], discs: ['Vigour', 'Nightmare'] },
  { id: 'familiar', name: 'Familiar Face', desc: 'Exploit an existing acquaintance', attrs: ['Manipulation', 'Presence'], skills: ['Persuasion', 'Subterfuge'], discs: ['Dominate', 'Majesty'] },
  { id: 'intimidation', name: 'Intimidation', desc: 'Compel through fear', attrs: ['Strength', 'Manipulation'], skills: ['Intimidation', 'Subterfuge'], discs: ['Nightmare', 'Dominate'] },
  { id: 'other', name: 'Other', desc: 'Custom method (subject to ST approval)', attrs: [], skills: [], discs: [] },
];

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
        type: 'shoutout_picks',
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

  // 2. Feeding declaration — method, territory, description
  // (Influence spend is its own tab. Regency is its own tab.)
  {
    key: 'feeding',
    title: 'The City: Territory and Feeding',
    gate: null,
    intro: null,
    questions: [
      {
        key: 'feeding_method',
        label: 'How does your character hunt?',
        type: 'feeding_method',
        required: true,
        desc: null,
      },
      {
        key: 'feeding_territories',
        label: 'Which Territory does your character feed or poach in?',
        type: 'territory_grid',
        required: true,
        desc: 'Residents must have express permission from a Regent to feed in their Territory. This declaration informs territory ambience calculations.',
      },
      {
        key: 'influence_spend',
        label: 'Which Territories would you like to spend Influence on, if at all?',
        type: 'influence_grid',
        required: false,
        desc: 'Positive values improve a Territory\'s Ambience. Negative values degrade it. Each point spent (positive or negative) costs 1 Influence from your monthly budget.',
      },
    ],
  },

  // 3. Regency action — gated: only shown for regents
  {
    key: 'regency',
    title: 'Regency Action',
    gate: 'is_regent',
    intro: null,
    questions: [
      {
        key: 'regency_action',
        label: 'What do you want to make known about your domain this month?',
        type: 'textarea',
        required: false,
        desc: 'Proclamations, policies, enforcement, or any public stance you wish to communicate to other Kindred about your territory.',
      },
    ],
  },

  // 4. Projects — always shown, 4 slots rendered dynamically by downtime-form.js
  {
    key: 'projects',
    title: 'Projects: Personal Actions',
    gate: null,
    intro: 'You have up to four Project slots this Downtime. Each Project must aim to achieve one clear outcome. The first Project is required; the rest are optional.',
    questions: [], // rendered dynamically as project_slots
    projectSlots: 4,
  },

  // 5–7: Spheres, Contacts, Retainers — now rendered dynamically from character merits
  // (see downtime-form.js renderMeritSections)

  // 8. Acquisitions — manual gate (anyone can attempt skill-based acquisitions)
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

  // 9. Blood Sorcery — auto-gated by disciplines, rendered dynamically
  {
    key: 'blood_sorcery',
    title: 'Blood Sorcery: Theban and Cruac',
    gate: 'has_sorcery',
    intro: 'Select the rites you wish to cast this Downtime. Ritual details are pre-filled from your character sheet.',
    questions: [], // rendered dynamically by downtime-form.js
    sorcerySlots: 3,
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
        type: 'xp_grid',
        required: false,
        desc: null,
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
        type: 'star_rating',
        required: false,
        desc: null,
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
    key: 'has_acquisitions',
    label: 'Do you want to use Resources or Skills to attempt to acquire anything?',
    type: 'radio',
    options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
  },
];
