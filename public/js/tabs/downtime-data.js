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
  { value: 'ambience_change', label: 'Ambience Change: Improve or degrade the ambience of a territory' },
  { value: 'attack', label: 'Attack: Attempt to destroy merits, holdings, projects, or NPCs' },
  { value: 'hide_protect', label: 'Hide/Protect: Attempt to secure actions, merits, holdings, or projects' },
  { value: 'investigate', label: 'Investigate: Begin or further an investigation' },
  { value: 'patrol_scout', label: 'Patrol/Scout: Attempt to monitor a given Territory or area' },
  { value: 'xp_spend', label: 'XP Spend: Grow your character' },
  { value: 'misc', label: 'Misc: For things that don\'t fit in other categories' },
  { value: 'maintenance', label: 'Maintenance: Upkeep of professional or cult relationships' },
];

export const ACTION_APPROACH_PROMPTS = {
  'ambience_change_improve': 'How do you go about improving the ambience of this territory in narrative terms.',
  'ambience_change_degrade': 'How do you go about degrading the ambience of this territory in narrative terms.',
  'attack': 'How do you attempt to destroy or undermine this target in narrative terms.',
  'hide_protect': 'How do you go about securing and hiding this target in narrative terms.',
  'investigate': 'How does your character pursue this investigation in narrative terms.',
  'patrol_scout': 'How does your character observe or patrol this territory in narrative terms.',
  'misc': 'Describe your approach to this action in narrative terms.',
  'maintenance': 'Describe how your character maintains this relationship or organisation in narrative terms.',
};

export const ACTION_DESCRIPTIONS = {
  'ambience_change_improve': 'This project will apply your successes directly towards improving the ambience of the selected territory.',
  'ambience_change_degrade': 'This project will apply your successes directly towards degrading the ambience of the selected territory.',
  'attack': 'You are attempting to destroy, ruin, or harm a specific target. You will need to select a character you\'re targeting, and detail to us the specific thing attached to them you\'re trying to affect: a merit, a holding, a project, or an NPC. Describe how you\'re going about harming that thing.',
  'hide_protect': 'You are attempting to secure a specific target from harm or discovery this downtime. You will need to select what you are protecting: a merit, a holding, a project, or a person. Describe how you are securing it.',
  'investigate': 'You are attempting to find out secrets about this target. You will need a lead or some starting point for your investigation; you can\'t investigate someone out of thin air. Describe what it is that you\'re investigating and what your lead is.',
  'patrol_scout': 'You are actively observing the activity of the chosen territory. Describe how your character goes about observing: who they talk to, where they watch from, how long they spend.',
  'xp_spend': 'You are spending experience to grow your character. Select the trait below.',
  'misc': 'This is for downtime actions that don\'t neatly fit into any other category. Describe what you\'re attempting to achieve and how your character goes about it.',
  'maintenance': 'You are maintaining your professional or cult relationships. Select the asset you are maintaining below.',
};

// Action type options for sphere (social merit) slots
export const SPHERE_ACTIONS = [
  { value: '', label: '— No Action Taken —' },
  { value: 'ambience_change', label: 'Ambience Change: Modify a territory\'s ambience' },
  { value: 'attack', label: 'Attack: Attempt to destroy merits, holdings, projects, or NPCs' },
  { value: 'block', label: 'Block: Prevent someone else from using a specific Social Merit' },
  { value: 'hide_protect', label: 'Hide/Protect: Attempt to secure actions, merits, holdings, or projects' },
  { value: 'investigate', label: 'Investigate: Begin or further an investigation' },
  { value: 'grow', label: 'Grow: Attempt to acquire Allies or Status 4 or 5' },
  { value: 'misc', label: 'Misc: For things that don\'t fit in other categories' },
];

export const FEEDING_TERRITORIES = [
  'The Academy',
  'The Harbour',
  'The Dockyards',
  'The Second City',
  'The North Shore',
  'The Barrens (No Territory)',
];

// Ambience rating → PC feeding cap (from Damnation City rules)
export const AMBIENCE_CAP = {
  'Hostile':   0,
  'Barrens':   0,
  'Neglected': 6,
  'Untended':  6,
  'Settled':   6,
  'Tended':    6,
  'Curated':   7,
  'Verdant':   7,
  'The Rack':  8,
};

// Ambience level → default dice modifier
export const AMBIENCE_MODS = {
  Hostile: -5, Barrens: -4, Neglected: -3, Untended: -2,
  Settled: 0, Tended: 2, Curated: 3, Verdant: 4, 'The Rack': 5,
};

// Territory definitions with current ambience (mirrors city-views.js).
// Field name `slug` aligns with the Mongo territory document's `slug` field
// (renamed from `id` in ADR-002 / story #3c). TERRITORY_DATA is reference
// data only — never used as a foreign key.
export const TERRITORY_DATA = [
  { slug: 'academy',    name: 'The Academy',    ambience: 'Curated',  ambienceMod: +3 },
  { slug: 'dockyards',  name: 'The Dockyards',  ambience: 'Settled',  ambienceMod:  0 },
  { slug: 'harbour',    name: 'The Harbour',    ambience: 'Untended', ambienceMod: -2 },
  { slug: 'northshore', name: 'The North Shore', ambience: 'Tended',  ambienceMod: +2 },
  { slug: 'secondcity', name: 'The Second City', ambience: 'Tended',  ambienceMod: +2 },
];

// Helper: generate select options for a numeric range (inclusive)
function numRange(min, max) {
  return Array.from({ length: max - min + 1 }, (_, i) => {
    const v = String(min + i);
    return { value: v, label: v };
  });
}

export { PROJECT_ACTIONS };

// Standing merits whose holders may declare a Maintenance project action
// to upkeep professional/cult relationships at chapter end. CHM-0: single
// source of truth; CHM-1/2/3 read from here.
export const MAINTENANCE_MERITS = ['Professional Training', 'Mystery Cult Initiation'];

// JDT-2: action types eligible for the Solo/Joint toggle on a project slot.
// Must stay in sync with JOINT_ELIGIBLE_ACTIONS in server/routes/downtime.js.
// Excluded: support (recursive role conflict), xp_spend (personal),
// maintenance (personal). The toggle is hidden for these.
export const JOINT_ELIGIBLE_ACTIONS = [
  'ambience_change',
  'attack',
  'hide_protect',
  'investigate',
  'patrol_scout',
  'misc',
];

// DTFP-3: id values are stable for back-compat (existing submissions keyed by id);
// only display name and chip lists change. 'familiar' id stays; name flips to 'Deception'.
export const FEED_METHODS = [
  { id: 'seduction', name: 'Seduction', desc: 'Lure a vessel close', attrs: ['Presence', 'Manipulation'], skills: ['Empathy', 'Socialise', 'Persuasion'], discs: ['Majesty', 'Dominate'] },
  { id: 'stalking', name: 'Stalking', desc: 'Prey on a target unseen', attrs: ['Dexterity', 'Wits'], skills: ['Stealth', 'Streetwise'], discs: ['Protean', 'Obfuscate'] },
  { id: 'force', name: 'By Force', desc: 'Overpower and drain', attrs: ['Strength'], skills: ['Brawl', 'Weaponry'], discs: ['Vigour', 'Celerity'] },
  { id: 'familiar', name: 'Deception', desc: 'Exploit an existing acquaintance', attrs: ['Manipulation', 'Wits'], skills: ['Persuasion', 'Subterfuge'], discs: ['Auspex', 'Obfuscate'] },
  { id: 'intimidation', name: 'Intimidation', desc: 'Compel through fear', attrs: ['Intelligence', 'Presence'], skills: ['Expression', 'Intimidation'], discs: ['Nightmare', 'Dominate'] },
];

// DTFP-5: Kiss / Violent feeding declaration. Pre-selection per method;
// stalking and other are deliberately unselected so the player must pick.
export const FEED_VIOLENCE_DEFAULTS = {
  seduction:    'kiss',
  stalking:     null,
  force:        'violent',
  familiar:     'kiss',
  intimidation: 'violent',
  other:        null,
};

export function inferFeedViolenceFromMethod(methodId) {
  return FEED_VIOLENCE_DEFAULTS[methodId] ?? null;
}

// Single source of truth for "what was this submission's feed violence":
// ST override > player choice > legacy-method inference > null.
export function effectiveFeedViolence(sub) {
  const stOverride = sub?.st_review?.feed_violence_st_override;
  if (stOverride === 'kiss' || stOverride === 'violent') return stOverride;
  const playerChoice = sub?.responses?.feed_violence;
  if (playerChoice === 'kiss' || playerChoice === 'violent') return playerChoice;
  return inferFeedViolenceFromMethod(sub?.responses?.['_feed_method']);
}

// DTFP-6: sorcery targets normaliser. Handles both legacy string shape
// ('Vincent and the Harbour') and new array shape ([{type, value}, ...]).
// Returns a single comma-separated display string (values only; type info
// is preserved on the persisted shape for downstream consumers).
export function normaliseSorceryTargets(raw) {
  if (Array.isArray(raw)) {
    return raw.map(t => (t && t.value) ? String(t.value) : '').filter(Boolean).join(', ');
  }
  return raw ? String(raw) : '';
}

export const DOWNTIME_SECTIONS = [
  // 1. Court — gated: only shown if the player attended last game.
  // Prior "Politics and Correspondence" title renamed post-DTR.2/.3 since
  // Correspondence moved to Personal Story and Aspirations moved to Vamping.
  {
    key: 'court',
    title: 'Court: Last Game Session',
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
        type: 'highlight_slots',
        required: true,
        desc: 'Capture each highlight in its own field. Start with three; a fourth and fifth field will appear as you fill them. Each one is a separate conversation, plot, or moment.\n\nExample highlight: "Approached Lord Vance about the missing shipment."',
      },
      {
        key: 'rp_shoutout',
        label: 'Name one or two players/characters who gave you standout roleplay moments.',
        type: 'shoutout_picks',
        required: true,
        desc: 'Acknowledge peers whose performance or collaboration made the session memorable for you.',
      },
    ],
  },

  // 2. Personal Story — always shown; player selects an NPC to interact with.
  // DTR.2: correspondence moved here from the Court section (where it
  // historically lived). Rendered by the custom personal-story renderer.
  {
    key: 'personal_story',
    title: 'Personal Story: Off-Screen Life',
    gate: null,
    intro: null,
    questions: [
      {
        key: 'correspondence',
        label: 'Dear X: A short in-character correspondence to an NPC back home.',
        type: 'textarea',
        required: false,
        desc: 'Write a brief letter, message, or communiqué from your character to a contact, sire, childe, or associate not present at Court.\n\nExample: "Dear Magistrix, The colonials are more fractious than anticipated. The Invictus here lack a unifying voice. I have begun positioning accordingly — your investment is well placed. Yours in blood, V."',
      },
    ],
  },

  // 3. Blood Sorcery — auto-gated by disciplines, rendered dynamically; declared before Feeding
  //    so players know which rites affect their hunt pool before committing to a method
  {
    key: 'blood_sorcery',
    title: 'Blood Sorcery: Theban and Cruac',
    gate: 'has_sorcery',
    intro: 'Select the rites you wish to cast this Downtime. Ritual details are pre-filled from your character sheet.',
    questions: [], // rendered dynamically by downtime-form.js
    sorcerySlots: 3,
  },

  // 3. Territory — influence spend; feeding territory moved into Feeding section
  {
    key: 'territory',
    title: 'The City: Territory and Influence',
    gate: null,
    intro: null,
    questions: [
      {
        key: 'influence_spend',
        label: 'Which Territories would you like to spend Influence on, if at all?',
        type: 'influence_grid',
        required: false,
        desc: 'Positive values improve a Territory\'s Ambience. Negative values degrade it. Each point spent (positive or negative) costs 1 Influence from your monthly budget.',
      },
    ],
  },

  // 4. Feeding — territory declaration, then method selection, pool, rote, description
  {
    key: 'feeding',
    title: 'Feeding: The Hunt',
    gate: null,
    intro: null,
    questions: [
      {
        key: 'feeding_territories',
        label: 'Which Territory does your character feed or poach in?',
        type: 'territory_grid',
        required: true,
        desc: 'Residents must have express permission from a Regent to feed in their Territory. This declaration informs territory ambience calculations.',
      },
      {
        key: 'feeding_method',
        label: 'How does your character hunt?',
        type: 'feeding_method',
        required: true,
        desc: null,
      },
    ],
  },

  // 5. Regency action — gated: kept in array for collectResponses; rendered as sub-field of Vamping
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

  // 6. Projects — always shown, 4 slots rendered dynamically by downtime-form.js
  {
    key: 'projects',
    title: 'Projects: Personal Actions',
    gate: null,
    intro: 'You have up to four Project slots this Downtime. Each Project must aim to achieve one clear outcome. The first Project is required; the rest are optional.',
    questions: [], // rendered dynamically as project_slots
    projectSlots: 4,
  },

  // 7–9: Spheres, Contacts, Retainers — now rendered dynamically from character merits
  // (see downtime-form.js renderMeritSections)

  // 10. Acquisitions — manual gate (anyone can attempt skill-based acquisitions)
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

  // 11. Equipment — always shown
  {
    key: 'equipment',
    title: 'Equipment: Items and Gear',
    gate: null,
    intro: 'List any items, weapons, or equipment you want your character to have access to this Downtime. Sourcing is subject to ST approval and availability.',
    questions: [], // rendered dynamically
  },

  // 12. Vamping — always shown; includes conditional Regency sub-field for Regents.
  // DTR.3: aspirations moved here from the Court section.
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
      {
        key: 'aspirations',
        label: 'Aspirations',
        type: 'aspiration_slots',
        required: false,
        desc: null,
      },
    ],
  },

  // 13. Admin — always shown
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
