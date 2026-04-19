/* conditions.js — VtR 2e standard Conditions reference data (nav.11) */

export const CONDITIONS_DB = [
  { name: 'Afraid',       effect: '\u22122 to all actions while fleeing. Lose Defence against source of fear.',    resolution: 'Escape the source or spend Willpower' },
  { name: 'Beaten Down',  effect: 'May not take violent actions without spending Willpower first.',               resolution: 'Spend Willpower, or scene ends' },
  { name: 'Blinded',      effect: '\u22122 on all actions; lose Defence against unseen attackers.',               resolution: 'Recover sight (end of scene or medical)' },
  { name: 'Blushing',     effect: 'Vampire appears alive — breathing, warm. Ends when Vitae is exhausted.',      resolution: 'Vitae runs out or Blush ends' },
  { name: 'Broken',       effect: '(Persistent) \u22122 to all actions. See Scars.',                             resolution: 'Downtime treatment + XP expenditure' },
  { name: 'Confused',     effect: '\u22122 to Mental actions. May not use Specialties.',                          resolution: 'Explanation or spend Willpower' },
  { name: 'Depressed',    effect: '\u22122 to Social actions. Resisting Vinculum/Domination +1 difficulty.',     resolution: 'Scene of solace, therapy, or Touchstone contact' },
  { name: 'Embarrassed',  effect: '\u22122 to Social actions in current social context.',                         resolution: 'Remove self from situation or scene ends' },
  { name: 'Fugue',        effect: '(Persistent) Character blacks out under stress. See Scars.',                   resolution: 'Downtime treatment + XP expenditure' },
  { name: 'Informed',     effect: '+2 to next roll involving this specific knowledge.',                           resolution: 'Use the bonus (ends on use)' },
  { name: 'Inspired',     effect: '+2 to next roll on a specific task.',                                         resolution: 'Use the bonus (ends on use)' },
  { name: 'Knocked Down', effect: 'Prone. \u22122 to actions, +2 to be hit. Must spend action to stand.',        resolution: 'Spend action to stand up' },
  { name: 'Languished',   effect: 'Blood Potency treated as 1 lower for all purposes.',                          resolution: 'Feed to full Vitae' },
  { name: 'Leveraged',    effect: 'Must comply with demands or suffer stated consequence.',                       resolution: 'Comply with demand or suffer consequence' },
  { name: 'Shaken',       effect: '\u22122 to next roll. Stacks with other penalties.',                           resolution: 'Scene ends or Willpower spent' },
  { name: 'Swooning',     effect: 'Infatuated. \u22122 to resist Social actions from the source.',               resolution: 'Scene ends or Willpower spent' },
  { name: 'Tremors',      effect: '(Persistent) Shaking hands; \u22122 to fine motor tasks.',                    resolution: 'Downtime treatment + XP expenditure' },
  { name: 'Wanton',       effect: 'Must pursue immediate gratification; resist with Resolve+Composure (3+).',    resolution: 'Resist or indulge (ends either way)' },
];
