/* Questionnaire question definitions — data-driven form rendering.
 * Each section maps to the Google Form structure.
 * The 'key' on each question becomes the field name in MongoDB.
 * ordeal: 'questionnaire' or 'history' — which ordeal this section counts toward.
 *
 * Question types:
 *   text      — single-line input
 *   textarea  — multi-line input
 *   radio     — single select from options
 *   select    — dropdown single select
 *   checkbox  — multi-select; stores native array in responses
 *
 * Structured fields store a _tags or _tag suffix key (array or string enum)
 * alongside an optional _note textarea for elaboration. Legacy free-text keys
 * are preserved in read-only display via renderReadOnlyField fallback.
 */

export const MASKS_DIRGES = [
  'Authoritarian', 'Child', 'Competitor', 'Conformist', 'Conspirator',
  'Courtesan', 'Cult Leader', 'Deviant', 'Follower', 'Guru',
  'Idealist', 'Jester', 'Junkie', 'Martyr', 'Masochist',
  'Monster', 'Nomad', 'Nurturer', 'Penitent', 'Perfectionist',
  'Questioner', 'Rebel', 'Scholar', 'Social Chameleon', 'Spy',
  'Survivor', 'Visionary',
];

export const QUESTIONNAIRE_SECTIONS = [
  {
    key: 'player_info',
    title: 'Player Information',
    ordeal: 'questionnaire',
    intro: null,
    questions: [
      {
        key: 'player_name',
        label: 'Player Name',
        type: 'text',
        required: true,
        desc: 'Your name (the player), not your character\'s name.',
      },
      {
        key: 'facebook_name',
        label: 'Facebook Profile Name (if different to real name)',
        type: 'text',
        required: false,
        desc: 'If you\'re in our Facebook group under a different name, please let us know.',
      },
      {
        key: 'discord_nickname',
        label: 'Discord Nickname',
        type: 'text',
        required: false,
        desc: 'Your Discord username.',
      },
      // ── Gaming Preferences (structured) ──
      {
        key: 'gaming_style_tags',
        label: 'Play Style Preferences',
        type: 'checkbox',
        required: false,
        desc: 'Select everything that appeals to you.',
        options: [
          { value: 'personal_horror',     label: 'Personal horror alongside political play' },
          { value: 'social_intrigue',     label: 'Social intrigue between conflicts' },
          { value: 'action_confrontation',label: 'Action-packed confrontations' },
          { value: 'major_player',        label: 'Major political player' },
          { value: 'dangerous_wildcard',  label: 'Dangerous wildcard' },
        ],
      },
      {
        key: 'gaming_style_pvp',
        label: 'PVP Approach',
        type: 'radio',
        required: false,
        desc: 'How do you prefer to engage in player-vs-player conflict?',
        options: [
          { value: 'direct',  label: 'Direct confrontation' },
          { value: 'subtle',  label: 'Subtle manipulation' },
          { value: 'either',  label: 'Either, depending on the situation' },
        ],
      },
      {
        key: 'gaming_style_note',
        label: 'Gaming Preferences: Additional Notes',
        type: 'textarea',
        required: false,
        desc: 'What would make you leave sessions feeling satisfied beyond winning or losing political battles? Anything else about your preferences?',
      },
      // ── Support Preferences (structured) ──
      {
        key: 'support_tags',
        label: 'What Support Would Help You Thrive?',
        type: 'checkbox',
        required: false,
        desc: 'Select any types of ST assistance that would enhance your experience.',
        options: [
          { value: 'scheme_help',          label: 'Help developing political schemes' },
          { value: 'rules_guidance',       label: 'Managing complex rules during conflicts' },
          { value: 'personal_storylines',  label: 'Creating personal storylines between battles' },
          { value: 'covenant_politics',    label: 'Guidance with covenant politics' },
          { value: 'character_connections',label: 'Building character connections' },
          { value: 'social_navigation',    label: 'Navigating social dynamics of court' },
        ],
      },
      {
        key: 'support_note',
        label: 'Support: Additional Notes',
        type: 'textarea',
        required: false,
        desc: 'Anything specific that would help you?',
      },
    ],
  },

  {
    key: 'character_profile',
    title: 'Character Profile',
    ordeal: 'questionnaire',
    intro: 'Help us understand who your character is.',
    questions: [
      {
        key: 'character_name',
        label: '1. Character Name',
        type: 'text',
        required: true,
        desc: 'Use this format: <Title> <First Name> <"Alias"> <Last Name>. Complete as much as you have.',
      },
      {
        key: 'high_concept',
        label: '2. High Concept',
        type: 'text',
        required: true,
        desc: 'A brief phrase that captures your character\'s core identity.',
      },
      {
        key: 'clan',
        label: '3. Clan',
        type: 'radio',
        required: true,
        desc: 'Your character\'s vampiric lineage.',
        options: [
          { value: 'Daeva',     label: 'Daeva: seductive predators' },
          { value: 'Gangrel',   label: 'Gangrel: savage survivalists' },
          { value: 'Mekhet',   label: 'Mekhet: shadows and secrets' },
          { value: 'Nosferatu', label: 'Nosferatu: haunters and nightmares' },
          { value: 'Ventrue',   label: 'Ventrue: lords and masters' },
        ],
      },
      {
        key: 'bloodline',
        label: '4. Bloodline',
        type: 'text',
        required: false,
        desc: 'Optional. Bloodlines carry significant drawbacks.',
      },
      {
        key: 'bloodline_rationale',
        label: '5. Bloodline Rationale',
        type: 'textarea',
        required: false,
        desc: 'Why this bloodline would enhance your character\'s story.',
      },
      {
        key: 'covenant',
        label: '6. Covenant',
        type: 'radio',
        required: true,
        desc: 'Your character\'s political and ideological affiliation.',
        options: [
          { value: 'Carthian Movement',   label: 'The Carthian Movement: revolutionaries and modernists' },
          { value: 'Circle of the Crone', label: 'The Circle of the Crone: pagan blood cultists' },
          { value: 'Invictus',            label: 'The Invictus: aristocracy of the undead' },
          { value: 'Lancea et Sanctum',   label: 'The Lancea et Sanctum: the vampire church' },
          { value: 'Unaligned',           label: 'Unaligned' },
        ],
      },
      {
        key: 'covenant_factions',
        label: '7. Covenant Factions',
        type: 'text',
        required: false,
        desc: 'If your character aligns with a specific internal faction, note it here.',
      },
      {
        key: 'blood_potency',
        label: '9. Blood Potency',
        type: 'text',
        required: false,
        desc: 'This chronicle caps Blood Potency at 2.',
      },
      {
        key: 'apparent_age',
        label: '10. Apparent Age',
        type: 'text',
        required: false,
        desc: 'How old does your character appear?',
      },
      {
        key: 'conflict_approach',
        label: '11. Preferred Approach to Conflict',
        type: 'radio',
        required: false,
        desc: 'When faced with opposition, how do you typically respond?',
        options: [
          { value: 'Monstrous',   label: 'Intimidation: direct threats, displays of power, and fear' },
          { value: 'Seductive',   label: 'Manipulation: deception, proxies, and emotional exploitation' },
          { value: 'Competitive', label: 'Superiority: proving dominance through contests and challenges' },
        ],
      },
      {
        key: 'mask',
        label: '12a. Mask',
        type: 'select',
        required: false,
        desc: 'The false persona your character shows to others.',
        options: MASKS_DIRGES.map(m => ({ value: m, label: m })),
      },
      {
        key: 'dirge',
        label: '12b. Dirge',
        type: 'select',
        required: false,
        desc: 'Your character\'s true vampiric nature. Must differ from Mask.',
        options: MASKS_DIRGES.map(m => ({ value: m, label: m })),
      },
    ],
  },

  {
    key: 'political_ambitions',
    title: 'Political Ambitions',
    ordeal: 'questionnaire',
    intro: 'Only the first three questions are required; the rest establish your character\'s political stance.',
    questions: [
      {
        key: 'court_motivation',
        label: '14. What motivates your character to attend Court?',
        type: 'textarea',
        required: true,
        desc: 'Why does your character play these dangerous political games?',
      },
      {
        key: 'ambitions_sydney',
        label: '15. What does your character hope to achieve in Sydney?',
        type: 'textarea',
        required: true,
        desc: 'Are they establishing territory, escaping their past, climbing the ladder, or simply surviving?',
      },
      {
        key: 'why_sydney',
        label: '16. Why did your character come to Sydney?',
        type: 'textarea',
        required: true,
        desc: 'Was their arrival voluntary or forced?',
      },
      {
        key: 'why_covenant',
        label: '17. Why did your character join their Covenant?',
        type: 'textarea',
        required: false,
        desc: 'Was it genuine belief, pragmatic necessity, or social pressure?',
      },
      {
        key: 'covenant_goals',
        label: '18. Goals within their Covenant?',
        type: 'textarea',
        required: false,
        desc: 'Are they seeking advancement, secrets, protection, or reform?',
      },
      {
        key: 'clan_goals',
        label: '19. Goals within their Clan?',
        type: 'textarea',
        required: false,
        desc: 'Do they embrace or rebel against clan traditions?',
      },
      // ── Aspired position (structured) ──
      {
        key: 'aspired_role_tag',
        label: '20a. Position your character aspires to hold',
        type: 'radio',
        required: false,
        desc: 'Court offices carry obligations as well as status. Consider whether your character wants formal authority or prefers to work behind the scenes.',
        options: [
          { value: 'ruler',          label: 'Ruler (Prince, Baron, or equivalent)' },
          { value: 'primogen',       label: 'Primogen' },
          { value: 'administrator',  label: 'Administrator' },
          { value: 'regent',         label: 'Regent' },
          { value: 'socialite',      label: 'Socialite' },
          { value: 'enforcer',       label: 'Enforcer' },
          { value: 'none_yet',       label: 'None yet, still finding my place' },
        ],
      },
      {
        key: 'aspired_position',
        label: '20b. Elaborate on your ambitions',
        type: 'textarea',
        required: false,
        desc: 'Do they seek formal authority or prefer indirect influence?',
      },
      // ── View on Traditions (structured) ──
      {
        key: 'view_traditions_tag',
        label: '21a. View on the Traditions',
        type: 'radio',
        required: false,
        desc: 'The Traditions are the laws of Kindred society: Masquerade, Progeny, Amaranth, and the rest. Breaking them risks Final Death.',
        options: [
          { value: 'sacred',         label: 'Sacred and inviolable' },
          { value: 'necessary_evil', label: 'Necessary evils: not ideal, but needed' },
          { value: 'outdated',       label: 'Outdated restrictions that hold us back' },
        ],
      },
      {
        key: 'view_traditions',
        label: '21b. Elaborate',
        type: 'textarea',
        required: false,
        desc: 'Sacred laws, outdated restrictions, or necessary evils?',
      },
      // ── View on Elysium (structured) ──
      {
        key: 'view_elysium_tag',
        label: '22a. Does your character respect the sanctity of Elysium?',
        type: 'radio',
        required: false,
        desc: 'Elysium is neutral ground; violence and political aggression are forbidden within its walls. It is where Kindred gather, negotiate, and perform.',
        options: [
          { value: 'genuinely',    label: 'Yes, genuinely' },
          { value: 'when_watched', label: 'Only when being watched' },
          { value: 'no',           label: 'No, not really' },
        ],
      },
      {
        key: 'view_elysium',
        label: '22b. Elaborate',
        type: 'textarea',
        required: false,
        desc: 'Do they honour this sanctuary genuinely or only when watched?',
      },
      // ── View on mortals (structured) ──
      {
        key: 'view_mortals_tag',
        label: '23a. How does your character view mortals and ghouls?',
        type: 'radio',
        required: false,
        desc: 'Maintaining connections to mortal life supports Humanity. How your character relates to the living shapes their Beast and their politics.',
        options: [
          { value: 'tools',     label: 'Tools to be used' },
          { value: 'food',      label: 'Food, little more' },
          { value: 'reminders', label: 'Reminders of lost humanity' },
          { value: 'complex',   label: 'Complex: it varies by individual' },
        ],
      },
      {
        key: 'view_mortals',
        label: '23b. Elaborate',
        type: 'textarea',
        required: false,
        desc: 'Are they tools, food, or reminders of lost humanity?',
      },
    ],
  },

  {
    key: 'character_history',
    title: 'Character History',
    ordeal: 'history',
    intro: 'Only the Touchstone question is required; the rest can grow through play.',
    questions: [
      {
        key: 'embrace_story',
        label: '24. Describe your Embrace',
        type: 'textarea',
        required: false,
        desc: 'How did they die and rise? Was it violent, seductive, or clinical?',
      },
      {
        key: 'sire_name',
        label: '25a. Your sire\'s name',
        type: 'text',
        required: false,
        desc: null,
      },
      {
        key: 'sire_story',
        label: '25b. Your relationship with your sire',
        type: 'textarea',
        required: false,
        desc: 'Their current status. Why did they Embrace your character? What do you owe them?',
      },
      {
        key: 'early_city',
        label: '26a. City of Embrace',
        type: 'text',
        required: false,
        desc: 'Where were you Embraced?',
      },
      {
        key: 'early_nights',
        label: '26b. First Nights',
        type: 'textarea',
        required: false,
        desc: 'Which city shaped your early experiences as Kindred? What defined those nights?',
      },
      {
        key: 'last_city_politics',
        label: '27. Political Landscape of Last City',
        type: 'textarea',
        required: false,
        desc: 'Who ruled? Did a single covenant dominate?',
      },
      {
        key: 'mortal_family',
        label: '28. Mortal Family',
        type: 'dynamic_list',
        required: false,
        desc: 'Add any relatives still alive. You can add as many as you like.',
        addLabel: '+ Add a family member',
        subfields: [
          { key: 'name',         label: 'Name',         type: 'text' },
          { key: 'relationship', label: 'Relationship', type: 'text' },
          { key: 'description',  label: 'Watch, contact, or avoid?', type: 'textarea' },
        ],
      },
      {
        key: 'touchstones',
        label: '29. Current Touchstones',
        type: 'textarea',
        required: true,
        desc: 'A Touchstone connects your character to their humanity. Describe this connection.',
      },
      // ── Hunting style (structured) ──
      {
        key: 'hunting_method_tags',
        label: '30a. Hunting Methods',
        type: 'checkbox',
        required: false,
        desc: 'Select all methods your character uses.',
        options: [
          { value: 'seduction',     label: 'Seduction' },
          { value: 'stalking',      label: 'Stalking' },
          { value: 'force',         label: 'Force' },
          { value: 'familiar',      label: 'Familiar vessels / willing donors' },
          { value: 'intimidation',  label: 'Intimidation' },
          { value: 'other',         label: 'Other' },
        ],
      },
      {
        key: 'hunting_style_note',
        label: '30b. Hunting Style: Details',
        type: 'textarea',
        required: false,
        desc: 'Preferred prey, territories, ethical lines you won\'t cross.',
      },
      {
        key: 'first_kill',
        label: '31. First Kill',
        type: 'textarea',
        required: false,
        desc: 'Tell us about a time when feeding went too far.',
      },
      {
        key: 'common_indulgences',
        label: '32. Common Indulgences',
        type: 'textarea',
        required: false,
        desc: 'Beyond blood, what fills their nights?',
      },
    ],
  },

  {
    key: 'character_connections',
    title: 'Character Connections',
    ordeal: 'questionnaire',
    intro: 'Connections create immediate story hooks. Rivals and enemies are as valuable as allies.',
    questions: [
      {
        key: 'allies_characters',
        label: '33a. Allied or friendly characters',
        type: 'character_select',
        required: false,
        desc: 'Select any PCs your character trusts or works with.',
      },
      {
        key: 'allies',
        label: '33b. Notes on these alliances',
        type: 'textarea',
        required: false,
        desc: 'Any context, history, or caveats worth noting?',
      },
      {
        key: 'coterie_characters',
        label: '34a. Coterie members',
        type: 'character_select',
        required: false,
        desc: 'Select any PCs you have formally bound yourself to for mutual support.',
      },
      {
        key: 'coterie',
        label: '34b. About your coterie',
        type: 'textarea',
        required: false,
        desc: 'What holds the coterie together? What are the tensions?',
      },
      {
        key: 'enemies_characters',
        label: '35a. Rivals or enemies',
        type: 'character_select',
        required: false,
        desc: 'Select any PCs your character opposes, distrusts, or competes with.',
      },
      {
        key: 'enemies',
        label: '35b. Notes on these conflicts',
        type: 'textarea',
        required: false,
        desc: 'What is the nature of the conflict? Is it personal, political, or both?',
      },
      // ── Opposed covenant (structured) ──
      {
        key: 'opposed_covenant_tag',
        label: '36a. Any covenant you particularly oppose?',
        type: 'select',
        required: false,
        desc: null,
        options: [
          { value: '',                   label: '— None specifically —' },
          { value: 'carthian',           label: 'The Carthian Movement' },
          { value: 'circle',             label: 'The Circle of the Crone' },
          { value: 'invictus',           label: 'The Invictus' },
          { value: 'lancea',             label: 'The Lancea et Sanctum' },
          { value: 'all_others',         label: 'All other covenants equally' },
        ],
      },
      {
        key: 'opposed_covenant',
        label: '36b. Why do you want to see them fail?',
        type: 'textarea',
        required: false,
        desc: null,
      },
      {
        key: 'intolerable_behaviours',
        label: '37. Kindred behaviours your character does not tolerate?',
        type: 'textarea',
        required: false,
        desc: 'Are there specific actions or attitudes that disgust or enrage your character?',
      },
      {
        key: 'boons_debts',
        label: '38. Favours owed',
        type: 'dynamic_list',
        required: false,
        desc: 'Add each favour separately. Include both debts you hold and debts owed to others.',
        addLabel: '+ Add a favour',
        subfields: [
          { key: 'character',   label: 'Character',   type: 'character_picker' },
          { key: 'description', label: 'The favour',  type: 'textarea' },
        ],
      },
      {
        key: 'secrets',
        label: '39. Dangerous secrets',
        type: 'dynamic_list',
        required: false,
        desc: 'Add each secret separately. Include secrets you hold over others and secrets others hold over you.',
        addLabel: '+ Add a secret',
        subfields: [
          { key: 'character',   label: 'Character involved', type: 'character_picker' },
          { key: 'description', label: 'The secret',         type: 'textarea' },
        ],
      },
    ],
  },
];
