/* Questionnaire question definitions — data-driven form rendering.
 * Each section maps to the Google Form structure.
 * The 'key' on each question becomes the field name in MongoDB.
 * ordeal: 'questionnaire' or 'history' — which ordeal this section counts toward.
 *
 * Fields whose value lives authoritatively on the character schema or the player record
 * (player_name, discord_nickname, character_name, high_concept, clan, bloodline, covenant,
 * blood_potency, apparent_age, mask, dirge, touchstones) have been removed per ORD.1.
 * Those values are read from the character sheet at render time and never captured here.
 *
 * Relationship fields — sires, mortal family, allies/coterie/enemies lists, boons and
 * debts — have been retired per ORD.2. Those are now tracked as typed edges in the
 * NPCR relationships graph (accessible via the NPCs tab). The questionnaire keeps
 * only narrative stance (opposed_covenant, intolerable_behaviours) and secrets for now.
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

export const QUESTIONNAIRE_SECTIONS = [
  {
    key: 'player_info',
    title: 'Player Information',
    ordeal: 'questionnaire',
    intro: null,
    questions: [
      {
        key: 'facebook_name',
        label: 'Facebook Profile Name (if different to real name)',
        type: 'text',
        required: false,
        desc: 'If you\'re in our Facebook group under a different name, please let us know.',
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
        key: 'bloodline_rationale',
        label: 'Bloodline Rationale',
        type: 'textarea',
        required: false,
        desc: 'Why this bloodline would enhance your character\'s story.',
      },
      {
        key: 'covenant_factions',
        label: 'Covenant Factions',
        type: 'text',
        required: false,
        desc: 'If your character aligns with a specific internal faction, note it here.',
      },
      {
        key: 'conflict_approach',
        label: 'Preferred Approach to Conflict',
        type: 'radio',
        required: false,
        desc: 'When faced with opposition, how do you typically respond?',
        options: [
          { value: 'Monstrous',   label: 'Intimidation: direct threats, displays of power, and fear' },
          { value: 'Seductive',   label: 'Manipulation: deception, proxies, and emotional exploitation' },
          { value: 'Competitive', label: 'Superiority: proving dominance through contests and challenges' },
        ],
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
        label: 'What motivates your character to attend Court?',
        type: 'textarea',
        required: true,
        desc: 'Why does your character play these dangerous political games?',
      },
      {
        key: 'ambitions_sydney',
        label: 'What does your character hope to achieve in Sydney?',
        type: 'textarea',
        required: true,
        desc: 'Are they establishing territory, escaping their past, climbing the ladder, or simply surviving?',
      },
      {
        key: 'why_sydney',
        label: 'Why did your character come to Sydney?',
        type: 'textarea',
        required: true,
        desc: 'Was their arrival voluntary or forced?',
      },
      {
        key: 'why_covenant',
        label: 'Why did your character join their Covenant?',
        type: 'textarea',
        required: false,
        desc: 'Was it genuine belief, pragmatic necessity, or social pressure?',
      },
      {
        key: 'covenant_goals',
        label: 'Goals within their Covenant?',
        type: 'textarea',
        required: false,
        desc: 'Are they seeking advancement, secrets, protection, or reform?',
      },
      {
        key: 'clan_goals',
        label: 'Goals within their Clan?',
        type: 'textarea',
        required: false,
        desc: 'Do they embrace or rebel against clan traditions?',
      },
      // ── Aspired position (structured) ──
      {
        key: 'aspired_role_tag',
        label: 'Position your character aspires to hold',
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
        label: 'Elaborate on your ambitions',
        type: 'textarea',
        required: false,
        desc: 'Do they seek formal authority or prefer indirect influence?',
      },
      // ── View on Traditions (structured) ──
      {
        key: 'view_traditions_tag',
        label: 'View on the Traditions',
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
        label: 'Elaborate',
        type: 'textarea',
        required: false,
        desc: 'Sacred laws, outdated restrictions, or necessary evils?',
      },
      // ── View on Elysium (structured) ──
      {
        key: 'view_elysium_tag',
        label: 'Does your character respect the sanctity of Elysium?',
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
        label: 'Elaborate',
        type: 'textarea',
        required: false,
        desc: 'Do they honour this sanctuary genuinely or only when watched?',
      },
      // ── View on mortals (structured) ──
      {
        key: 'view_mortals_tag',
        label: 'How does your character view mortals and ghouls?',
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
        label: 'Elaborate',
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
    intro: 'Your sire, mortal family, and other NPC connections are tracked in the NPCs tab. This section is for narrative backstory.',
    questions: [
      {
        key: 'embrace_story',
        label: 'Describe your Embrace',
        type: 'textarea',
        required: false,
        desc: 'How did they die and rise? Was it violent, seductive, or clinical?',
      },
      {
        key: 'early_city',
        label: 'City of Embrace',
        type: 'text',
        required: false,
        desc: 'Where were you Embraced?',
      },
      {
        key: 'early_nights',
        label: 'First Nights',
        type: 'textarea',
        required: false,
        desc: 'Which city shaped your early experiences as Kindred? What defined those nights?',
      },
      {
        key: 'last_city_politics',
        label: 'Political Landscape of Last City',
        type: 'textarea',
        required: false,
        desc: 'Who ruled? Did a single covenant dominate?',
      },
      // ── Hunting style (structured) ──
      {
        key: 'hunting_method_tags',
        label: 'Hunting Methods',
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
        label: 'Hunting Style: Details',
        type: 'textarea',
        required: false,
        desc: 'Preferred prey, territories, ethical lines you won\'t cross.',
      },
      {
        key: 'first_kill',
        label: 'First Kill',
        type: 'textarea',
        required: false,
        desc: 'Tell us about a time when feeding went too far.',
      },
      {
        key: 'common_indulgences',
        label: 'Common Indulgences',
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
    intro: 'Allies, coterie, enemies, and favours owed are tracked in the NPCs tab. This section covers narrative stance and secrets only.',
    questions: [
      // ── Opposed covenant (structured) ──
      {
        key: 'opposed_covenant_tag',
        label: 'Any covenant you particularly oppose?',
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
        label: 'Why do you want to see them fail?',
        type: 'textarea',
        required: false,
        desc: null,
      },
      {
        key: 'intolerable_behaviours',
        label: 'Kindred behaviours your character does not tolerate?',
        type: 'textarea',
        required: false,
        desc: 'Are there specific actions or attitudes that disgust or enrage your character?',
      },
      {
        key: 'secrets',
        label: 'Dangerous secrets',
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
