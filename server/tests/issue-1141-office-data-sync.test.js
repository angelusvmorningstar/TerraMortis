/**
 * Issue #1141 — office-data.js is synced to Symon's rewritten Court Position
 * content, and the asset-duplicated-as-merit bug is fixed.
 *
 * Imports office-data.js directly. Deliberately does NOT import office-tab.js —
 * office-tab.js imports api.js, which reads `location.hostname` at module top
 * level, and this project's vitest has no jsdom environment configured. That
 * import would throw at collection time regardless of what the test exercises.
 * office-data.js has zero imports and is a pure object literal, so it is safe.
 *
 * AC6 (two concurrent Socialite holders) and AC7's rendered behaviour (the
 * Administrator fallback firing) are proven by construction in the story's Dev
 * Notes, not re-tested here via a DOM harness this project doesn't have. This
 * file proves AC7's DATA precondition only (no Administrator entry exists).
 *
 * EXPECTED below is a deliberate byte-for-byte transcript of
 * `content/rules/office-powers.md` (AC1-4 require office-data.js to match
 * Symon's rewrite exactly), not a stand-in for a lighter structural check.
 * Any future edit to that source doc must update EXPECTED in the same change,
 * or this suite fails on a real drift — that's the point. Update both files
 * together.
 */

import { describe, it, expect } from 'vitest';
import { OFFICE_DATA } from '../../public/js/tabs/office-data.js';

const EXPECTED = {
  'Head of State': {
    asset: 'Government House',
    merits: ['Safe Place', 'Haven', 'Staff', 'Resources'],
    manoeuvres: [
      { name: 'Due Diligence', effect: "Each Court, a number of times equal to your City Status; spend 1 Influence to learn the rating of one named merit, Kindred or mortal, held by a Kindred you can see. They will know this was done, unless you also spend Influence equal to their City Status." },
      { name: 'Call in a Favour', effect: "Each Court, a number of times equal to your City Status; spend 1 Influence to require any Court Position holder to use an ability from their own sheet on your behalf. You pay its cost." },
      { name: 'Sovereignty Inviolate', effect: "Once per Court; spend Influence equal to Clan Status or Covenant Status to add to City Status for a single role (this can influence Blood Potency for resistance)." },
      { name: 'Willing Coalition', effect: "Once per Court; spend Influence equal to a Court Position holder's City Status to force them use an equal amount of Influence in a vote of your choosing." },
      { name: 'Executive Order', effect: "Spend Influence equal to the City Status of a target you can see to order them to act. The target chooses between compliance and a Condition of the Storyteller's choice." },
    ],
  },
  'Primogen': {
    asset: 'Chains of Office',
    merits: ['Contacts', 'Retainer (Aide)', 'Resources'],
    manoeuvres: [
      { name: 'People Talk', effect: "Once per Court; spend Influence equal to the City Status of a target you can see to learn their rating in one Discipline you name. If they hold that Discipline, you may then name one of its powers and learn their dice pool for it." },
      { name: 'Freedom of Information', effect: "Spend 1 Influence to read the Position sheet of any one Position in play. The cost rises by 1 Influence with each further use." },
      { name: 'Show of Hands', effect: "Spend 1 Influence to look inside one bidding box: Territory, Primogen, or Harpy. The cost rises by 1 Influence with each further use." },
      { name: 'Pull Rank', effect: "Once per Court; spend Influence equal to the target's City Status to deny them the effects of an exceptional success." },
      { name: 'Veto', effect: "Each Court, a number of times equal to your City Status; block a manoeuvre from any Position by spending Influence equal to that manoeuvre's cost." },
    ],
  },
  'Enforcer': {
    asset: 'Goon Squad',
    merits: ['Safe Place', 'Retainer (Hound)', 'Trained Observer'],
    manoeuvres: [
      { name: 'Perimeter', effect: "Once per Downtime; choose a Territory and spend Influence equal to its Ambience rating to receive a report as though you had scored an exceptional success on a Patrol or Scout action." },
      { name: 'Ear to the Ground', effect: "At Court, you count as holding Contacts in every sphere for the purpose of news from the city at large reaching you, such as a potential Masquerade breach coming to the attention of the police. Each time the Storyteller offers you such information, you must pay Influence to receive it." },
      { name: 'Stakeout', effect: "Each Court, a number of times equal to your City Status; spend 1 Influence to learn one of the following about a target you can see: their Herd rating, their Feeding Grounds rating, or where they hold Feeding Rights. They will know this was done, unless you also spend Influence equal to their City Status." },
      { name: 'Crackdown', effect: "Once per Downtime; spend Influence equal to the target's City Status to give your attempts to interfere with their Downtime actions the rote quality. This is not subtle." },
      { name: 'Neighbourhood Watch', effect: "Once per Court; spend Influence equal to the City Status of a target you can see to learn one of their Resistance Attributes." },
    ],
  },
  'Socialite': {
    asset: 'Elan',
    merits: ['Cacophony Savvy', 'Contacts', 'Retainer (Spy)'],
    manoeuvres: [
      { name: 'Size Them Up', effect: "Each Court, a number of times equal to your City Status; spend 1 Influence to learn the rating of one named Status type, Kindred or mortal, for a Kindred you can see. They will know this was done, unless you also spend Influence equal to their City Status." },
      { name: 'Saving Face', effect: "Once per Court; spend 1 Influence to reroll a failed Resistance roll against a contested mental Discipline, or to force a reroll against a resisted one." },
      { name: 'Goad', effect: "Once per Court; spend Influence equal to the target's City Status to learn their Mask and Dirge." },
      { name: 'Playing Favourites', effect: "Once per Court; when a Kindred's City Status is being changed, spend Influence equal to the new Status to make that change cost one further point of Status." },
      { name: 'Curry Favour', effect: "Once per Court; spend 1 Influence to impose the Leveraged Condition publicly on a Kindred you can see." },
    ],
  },
};

// Status Power WORDING must be byte-identical to what shipped in #691 — Symon's
// rewrite did not touch it, and neither does this story (AC8). What otc.1 DOES
// change is the CONTAINER: each flat string is split into an array of paragraphs
// (specs/stories/otc-1-status-power-paragraph-rendering.md), with no sentence
// added, removed, or reworded. STATUS_POWER_UNCHANGED below holds those exact
// splits; STATUS_POWER_FLAT reconstructs the original byte-identical string via
// join(' ') as a second, independent content check.
const STATUS_POWER_UNCHANGED = {
  'Head of State': [
    'Each session, you can raise or lower another\'s City Status by 1. You can do this a number of times per session equal to your own Effective City Status. You cannot raise or lower the same character more than once per session (but you can coordinate with your Socialite or other Court roles to stack changes).',
    'You can strip a character\'s last dot of City Status, casting them out of the domain. You can grant the first dot of City Status to newcomers at no cost.',
    'Your decisions should be grounded in the City Deeds. If you can\'t justify a Status change, others will be justified in dropping yours.',
  ],
  'Primogen': [
    'Each session, you can raise or lower another character\'s City Status by 1, once. You may permanently sacrifice one of your own City Status dots to make a second Status change in the same session. You cannot affect your own City Status.',
    'Your decisions should be grounded in the City Deeds. If you can\'t justify a Status change, others will be justified in dropping yours.',
  ],
  'Enforcer': [
    'Each session, you can lower another character\'s City Status by 1 when they breach what you are charged to enforce. Your enforcement must conform to the norms of court.',
    'If you overstep, others will be justified in dropping your own City Status.',
  ],
  'Socialite': [
    'Each session, you can raise or lower another character\'s City Status by 1. You can do this a number of times per session equal to your own Effective City Status. You cannot affect your own City Status, and you cannot hold another major court position simultaneously.',
    'Your decisions should be grounded in the City Deeds. If you can\'t justify a Status change, others will be justified in dropping yours.',
  ],
};

const STATUS_POWER_FLAT = {
  'Head of State': 'Each session, you can raise or lower another\'s City Status by 1. You can do this a number of times per session equal to your own Effective City Status. You cannot raise or lower the same character more than once per session (but you can coordinate with your Socialite or other Court roles to stack changes). You can strip a character\'s last dot of City Status, casting them out of the domain. You can grant the first dot of City Status to newcomers at no cost. Your decisions should be grounded in the City Deeds. If you can\'t justify a Status change, others will be justified in dropping yours.',
  'Primogen': 'Each session, you can raise or lower another character\'s City Status by 1, once. You may permanently sacrifice one of your own City Status dots to make a second Status change in the same session. You cannot affect your own City Status. Your decisions should be grounded in the City Deeds. If you can\'t justify a Status change, others will be justified in dropping yours.',
  'Enforcer': 'Each session, you can lower another character\'s City Status by 1 when they breach what you are charged to enforce. Your enforcement must conform to the norms of court. If you overstep, others will be justified in dropping your own City Status.',
  'Socialite': 'Each session, you can raise or lower another character\'s City Status by 1. You can do this a number of times per session equal to your own Effective City Status. You cannot affect your own City Status, and you cannot hold another major court position simultaneously. Your decisions should be grounded in the City Deeds. If you can\'t justify a Status change, others will be justified in dropping yours.',
};

describe('issue-1141 — office-data.js synced to Symon\'s rewrite', () => {
  for (const category of Object.keys(EXPECTED)) {
    describe(category, () => {
      it('has the exact ordered manoeuvre names (AC1-4)', () => {
        expect(OFFICE_DATA[category].manoeuvres.map(m => m.name)).toEqual(
          EXPECTED[category].manoeuvres.map(m => m.name),
        );
      });

      it('has the exact effect text for every manoeuvre, in rank order (AC1-4)', () => {
        expect(OFFICE_DATA[category].manoeuvres).toEqual(EXPECTED[category].manoeuvres);
      });

      it('has the exact merit suite, with no asset-name duplicate (AC5)', () => {
        expect(OFFICE_DATA[category].merits).toEqual(EXPECTED[category].merits);
        expect(OFFICE_DATA[category].merits).not.toContain(OFFICE_DATA[category].asset);
      });

      it('has the expected asset name', () => {
        expect(OFFICE_DATA[category].asset).toBe(EXPECTED[category].asset);
      });

      it('has an unchanged Status Power, split into paragraphs (AC8, otc.1)', () => {
        expect(OFFICE_DATA[category].statusPower).toEqual(STATUS_POWER_UNCHANGED[category]);
      });

      it('the paragraphs reconstruct the exact original flat text (otc.1) — catches a dropped or reordered sentence a shape-only check would miss', () => {
        expect(OFFICE_DATA[category].statusPower.join(' ')).toBe(STATUS_POWER_FLAT[category]);
      });
    });
  }

  it('has no Administrator entry — the "pending" fallback in office-tab.js must keep firing (AC7 data precondition)', () => {
    expect(OFFICE_DATA.Administrator).toBeUndefined();
  });
});
