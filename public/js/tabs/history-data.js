/* Character History ordeal — form definition.
 * Much simpler than the questionnaire: just a backstory text field. */

export const HISTORY_SECTIONS = [
  {
    key: 'backstory',
    title: 'Character Backstory',
    intro: 'This is an open invitation to tell your character\'s story in your own words. Write at least one page but you\'re welcome to give us more. You might write about their mortal life, their Embrace, a defining moment, or anything else that brings your character to life.\n\nThis is purely a creative exercise — an opportunity to explore your character through narrative. We\'re not assessing or judging this; we simply want to give you space to develop your character in whatever way feels right to you.',
    questions: [
      {
        key: 'backstory_text',
        label: 'Character History',
        type: 'textarea',
        required: true,
        rows: 16,
        desc: 'Write your character\'s backstory. The questions from the Character Questionnaire can serve as prompts if helpful, but feel free to write whatever story you want to tell.',
      },
      {
        key: 'backstory_link',
        label: 'External Link (optional)',
        type: 'text',
        required: false,
        desc: 'If your backstory is hosted elsewhere (Google Doc, Notion, etc.), paste the link here.',
      },
    ],
  },
];
