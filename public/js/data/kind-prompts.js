/* NPCR.13: kind-driven prompt map for the DT form Personal Story section.
 *
 * Each entry maps a relationship kind code → {label, placeholder} shown on
 * the "What happened?" textarea. The `_default` fallback covers unmapped
 * kinds (e.g. a new kind added to the graph before this module is updated).
 *
 * Copy tone: conversational, second-person, encouraging. Matches the rest
 * of the DT form. British English throughout, no em-dashes.
 */

export const KIND_PROMPTS = {
  // ── Lineage ────────────────────────────────────────────────────────────
  sire: {
    label: 'What passed between you and your sire this month?',
    placeholder: 'A lesson taught, a debt owed, a summons obeyed — how does the bond weigh on you right now?',
  },
  childe: {
    label: 'What passed between you and your childe this month?',
    placeholder: 'Did you guide them, test them, or keep your distance? What do they need from you?',
  },
  'grand-sire': {
    label: 'What passed between you and your grand-sire this month?',
    placeholder: 'An echo from the elder side of the line. Audience, rumour, a favour asked?',
  },
  'clan-mate': {
    label: 'What did you share with your clan-mate this month?',
    placeholder: 'Clan business, a shared project, rivalry tempered by blood?',
  },

  // ── Political ──────────────────────────────────────────────────────────
  coterie: {
    label: 'What did you call on them for?',
    placeholder: 'Shared plans, mutual support, a favour owed or repaid?',
  },
  ally: {
    label: 'What did you call on them for?',
    placeholder: 'A request, a reciprocal favour, or a careful check-in?',
  },
  rival: {
    label: 'What did they do, or what did you do to them?',
    placeholder: 'A move made, a barb delivered, or a cold silence kept?',
  },
  enemy: {
    label: 'What did they do, or what did you do to them?',
    placeholder: 'Open confrontation, a careful probe, or damage dealt by proxy?',
  },
  mentor: {
    label: 'What did your mentor teach or demand this month?',
    placeholder: 'A lesson, a correction, a task set to prove your worth?',
  },
  'debt-holder': {
    label: 'What did they call in from you this month?',
    placeholder: 'A favour redeemed, a price paid, or a debt deferred?',
  },
  'debt-bearer': {
    label: 'What did you call in from them this month?',
    placeholder: 'A favour asked, a use of leverage, or a choice to forgive?',
  },

  // ── Mortal ─────────────────────────────────────────────────────────────
  touchstone: {
    label: 'Describe the moment of in-person contact',
    placeholder: 'Where did you meet? What did you witness in them? How did it anchor you?',
  },
  family: {
    label: 'What happened with your family this month?',
    placeholder: 'A visit, a phone call, an absence noticed. Keep it grounded in mortal life.',
  },
  contact: {
    label: 'What did your contact provide this month?',
    placeholder: 'Information, access, a tip, or a warning?',
  },
  retainer: {
    label: 'What did you have your retainer do this month?',
    placeholder: 'An errand, a long-term task, a test of loyalty?',
  },
  correspondent: {
    label: 'What did they write about?',
    placeholder: 'Their news, your reply, what stays unsaid between the lines?',
  },
  romantic: {
    label: 'What passed between you romantically this month?',
    placeholder: 'A meeting, a message, a decision. What does the connection cost or offer?',
  },

  // ── Other ──────────────────────────────────────────────────────────────
  other: {
    label: 'Describe this moment',
    placeholder: 'The kind is custom — describe what shape this relationship takes right now.',
  },

  // Fallback for kinds not in the map.
  _default: {
    label: 'Describe this moment',
    placeholder: 'Tell the ST what happened in this relationship this month.',
  },
};

/**
 * Resolve a {label, placeholder} pair for a relationship kind code.
 * For kind='other' with a custom_label, the label is the custom_label
 * verbatim; placeholder falls back to the generic 'other' placeholder.
 */
export function promptForKind(kind, customLabel) {
  const entry = KIND_PROMPTS[kind];
  if (!entry) return { ...KIND_PROMPTS._default };
  if (kind === 'other' && customLabel && String(customLabel).trim()) {
    return { label: String(customLabel).trim(), placeholder: entry.placeholder };
  }
  return { ...entry };
}
