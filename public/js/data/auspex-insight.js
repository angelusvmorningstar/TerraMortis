// Auspex Insight questions — TM house rules (source: Auspex Errata.docx)
// Immutable reference data. Tiers are cumulative by dot rating.
export const AUSPEX_QUESTIONS = {
  1: [
    { q: 'Are you preparing to fight?',                                                  fmt: 'Yes / No' },
    { q: 'Are you in frenzy or on the verge of frenzy?',                                 fmt: 'Yes / No + Hunger / Fear / Rage' },
    { q: 'Are you genuinely afraid right now?',                                          fmt: 'Yes / No' },
    { q: 'Are you concealing an injury or physical impairment?',                         fmt: 'Yes / No' },
    { q: 'Are you lying about something significant in this conversation?',              fmt: 'Yes / No' },
    { q: 'Is a vampire here using Twilight Projection?',                                 fmt: 'Ask an ST' },
  ],
  2: [
    { q: 'What is your mood right now?',                                                 fmt: '~1–3 words' },
    { q: 'Who or what are you most afraid of in this moment?',                           fmt: 'Name or ~1–3 words' },
    { q: 'What is your Mask?',                                                           fmt: 'Title of Mask' },
    { q: 'Have you committed diablerie in the past two months?',                         fmt: 'Yes / No' },
    { q: 'Are you being supernaturally compelled or under duress?',                      fmt: 'Yes / No' },
    { q: 'Are you a supernatural creature, and if so, what kind?',                       fmt: 'Yes / No + Species' },
    { q: 'Who in this room do you most want to hurt?',                                   fmt: 'Name' },
    { q: 'Do you have any additional banes?',                                            fmt: 'Yes / No + Number' },
    { q: 'Who or what are you most focused on tonight?',                                 fmt: 'Name or ~1–3 words' },
    { q: 'Do you intend to act against me specifically before the night is over?',       fmt: 'Yes / No' },
    { q: 'What emotion are you most trying to hide right now?',                          fmt: '~1–3 words' },
    { q: 'What objects are you hiding on your person?',                                  fmt: 'Yes / No + List' },
  ],
  3: [
    { q: 'Who last touched or owned this object?',                                       fmt: 'Name or ~1–3 words' },
    { q: 'What is the strongest emotion associated with this object or place?',          fmt: '~1–3 words' },
    { q: 'What was this object or place being used for at the moment of strongest emotion?', fmt: '~1–3 words' },
    { q: 'Has violence occurred here, and if so, what kind?',                            fmt: '~1–3 words' },
    { q: 'What Discipline or power was last used here or near this object?',             fmt: 'Specific power name' },
    { q: 'Was this object present during a diablerie, or was diablerie performed in this location?', fmt: 'Yes / No' },
    { q: 'Who was the last person to die here, and how?',                                fmt: 'Yes / No + short sentence' },
    { q: 'Is an object or creature here being kept secret?',                             fmt: 'Yes / No + ~1–3 words' },
    { q: 'What was the most recent significant event here?',                             fmt: 'Short sentence' },
  ],
};
