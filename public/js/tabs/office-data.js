export const OFFICE_DATA = {
  'Head of State': {
    asset: 'Government House',
    merits: ['Safe Place', 'Haven', 'Staff', 'Resources', 'Government House'],
    style: 'First Among Equals',
    manoeuvres: [
      { name: 'Due Diligence',      effect: 'Spend 1 Influence to learn the number of Doors for a target.' },
      { name: 'Call in a Favour',   effect: 'Spend 1 Influence instead of 1 Willpower to add +3 to a social contest.' },
      { name: 'Open Door Policy',   effect: 'Spend 1 Influence to remove a Door. May only be used once per instance of Social Manoeuvring.' },
      { name: 'Willing Coalition',  effect: 'Spend 1 Influence to add Clan Status to Covenant Status or vice versa for a relevant social contest.' },
      { name: 'Executive Order',    effect: 'Spend 1 Influence to declare a ruling or pronouncement. The target chooses between compliance or a Condition of the Storyteller\'s choice.' },
    ],
    statusPower: 'Each session, you can raise or lower another\'s City Status by 1. You can do this a number of times per session equal to your own Effective City Status. You cannot raise or lower the same character more than once per session (but you can coordinate with your Socialite or other Court roles to stack changes). You can strip a character\'s last dot of City Status, casting them out of the domain. You can grant the first dot of City Status to newcomers at no cost. Your decisions should be grounded in the City Deeds. If you can\'t justify a Status change, others will be justified in dropping yours.',
  },
  'Primogen': {
    asset: 'Chains of Office',
    merits: ['Contacts', 'Closed Book', 'Staff', 'Retainer', 'Chains of Office'],
    style: 'Balance of Power',
    manoeuvres: [
      { name: 'Neighbourhood Watch',    effect: 'Spend 1 Influence to learn the Clan and Covenant status of another Kindred at Court.' },
      { name: 'Freedom of Information', effect: 'Spend 1 Influence to have a look at the Position sheet of any one Position in play.' },
      { name: 'Show of Hands',          effect: 'Spend 1 Influence to have a peek in a bidding box.' },
      { name: 'Pull Rank',              effect: 'Spend 1 Influence to add +1 to your City Status for one interaction.' },
      { name: 'Veto',                   effect: 'Spend 1 Influence to block a manoeuvre from any Position, provided they have less City Status than you.' },
    ],
    statusPower: 'Each session, you can raise or lower another character\'s City Status by 1, once. You may permanently sacrifice one of your own City Status dots to make a second Status change in the same session. You cannot affect your own City Status. Your decisions should be grounded in the City Deeds. If you can\'t justify a Status change, others will be justified in dropping yours.',
  },
  'Socialite': {
    asset: 'Elan',
    merits: ['Cacophony Savvy', 'Fame (Kindred)', 'Contacts', 'Staff (Sycophants)', 'Elan'],
    style: 'Elan',
    manoeuvres: [
      { name: 'Size Them Up',      effect: 'Spend 1 Influence to learn the rating of one named Status type (Kindred or mortal) for a Kindred you can see.' },
      { name: 'Faux Pas',          effect: 'Spend 1 Influence to reroll a failed Social roll. This cannot be used on contested rolls.' },
      { name: 'Saving Face',       effect: 'Spend 1 Influence to learn the Mask of a Kindred you can see.' },
      { name: 'Playing Favourites', effect: 'Spend 1 Influence to improve your initial impression by one step for the duration of that Social Manoeuvring. If activated on a new target before the last is resolved, the original\'s impression drops by two steps.' },
      { name: 'Curry Favour',      effect: 'Once per game, spend 1 Influence to publicly impose the Leveraged Condition on a Kindred you can see.' },
    ],
    statusPower: 'Each session, you can raise or lower another character\'s City Status by 1. You can do this a number of times per session equal to your own Effective City Status. You cannot affect your own City Status, and you cannot hold another major court position simultaneously. Your decisions should be grounded in the City Deeds. If you can\'t justify a Status change, others will be justified in dropping yours.',
  },
  'Enforcer': {
    asset: 'Task Force',
    merits: ['Safe Place', 'Retainer (Hound)', 'Closed Book'],
    style: 'Goon Squad',
    manoeuvres: [
      { name: 'Perimeter',          effect: 'During Downtime, spend 1 Influence and choose 1 territory, then learn if it gets intruded upon.' },
      { name: 'Ear to the Ground',  effect: 'During Downtime, spend 1 Influence to gain information from one Sphere.' },
      { name: 'Stakeout',           effect: 'During Downtime, spend 1 Influence to learn what Disciplines or powers of the blood are used in a territory.' },
      { name: 'Crackdown',          effect: 'During Downtime, spend 1 Influence and your attempts to interfere with any Downtime actions gain 8-Again.' },
      { name: 'Neighbourhood Watch', effect: 'Spend 1 Influence to learn the Clan and Covenant status of another Kindred at Court.' },
    ],
    statusPower: 'Each session, you can lower another character\'s City Status by 1 when they breach what you are charged to enforce. Your enforcement must conform to the norms of court. If you overstep, others will be justified in dropping your own City Status.',
  },
};
