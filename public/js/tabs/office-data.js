export const OFFICE_DATA = {
  'Head of State': {
    asset: 'Government House',
    merits: ['Safe Place', 'Haven', 'Staff', 'Resources'],
    style: 'First Among Equals',
    manoeuvres: [
      { name: 'Due Diligence',       effect: 'Each Court, a number of times equal to your City Status; spend 1 Influence to learn the rating of one named merit, Kindred or mortal, held by a Kindred you can see. They will know this was done, unless you also spend Influence equal to their City Status.' },
      { name: 'Call in a Favour',    effect: 'Each Court, a number of times equal to your City Status; spend 1 Influence to require any Court Position holder to use an ability from their own sheet on your behalf. You pay its cost.' },
      { name: 'Sovereignty Inviolate', effect: 'Spend 1 Influence to remove a Door. Once per instance of Social Manoeuvring.' },
      { name: 'Willing Coalition',   effect: 'Spend 1 Influence to add your Clan Status to your Covenant Status, or the reverse, for a relevant social contest.' },
      { name: 'Executive Order',     effect: 'Spend Influence equal to the City Status of a target you can see to order them to act. The target chooses between compliance and a Condition of the Storyteller\'s choice.' },
    ],
    statusPower: 'Each session, you can raise or lower another\'s City Status by 1. You can do this a number of times per session equal to your own Effective City Status. You cannot raise or lower the same character more than once per session (but you can coordinate with your Socialite or other Court roles to stack changes). You can strip a character\'s last dot of City Status, casting them out of the domain. You can grant the first dot of City Status to newcomers at no cost. Your decisions should be grounded in the City Deeds. If you can\'t justify a Status change, others will be justified in dropping yours.',
  },
  'Primogen': {
    asset: 'Chains of Office',
    merits: ['Contacts', 'Retainer (Aide)', 'Resources'],
    style: 'Balance of Power',
    manoeuvres: [
      { name: 'People Talk',            effect: 'Once per Court; spend Influence equal to the City Status of a target you can see to learn their rating in one Discipline you name. If they hold that Discipline, you may then name one of its powers and learn their dice pool for it.' },
      { name: 'Freedom of Information', effect: 'Spend 1 Influence to read the Position sheet of any one Position in play. The cost rises by 1 Influence with each further use.' },
      { name: 'Show of Hands',          effect: 'Spend 1 Influence to look inside one bidding box: Territory, Primogen, or Harpy. The cost rises by 1 Influence with each further use.' },
      { name: 'Pull Rank',              effect: 'Once per Court; spend Influence equal to the target\'s City Status to deny them the effects of an exceptional success.' },
      { name: 'Veto',                   effect: 'Each Court, a number of times equal to your City Status; block a manoeuvre from any Position by spending Influence equal to that manoeuvre\'s cost.' },
    ],
    statusPower: 'Each session, you can raise or lower another character\'s City Status by 1, once. You may permanently sacrifice one of your own City Status dots to make a second Status change in the same session. You cannot affect your own City Status. Your decisions should be grounded in the City Deeds. If you can\'t justify a Status change, others will be justified in dropping yours.',
  },
  'Socialite': {
    asset: 'Elan',
    merits: ['Cacophony Savvy', 'Contacts', 'Retainer (Spy)'],
    style: 'Elan',
    manoeuvres: [
      { name: 'Size Them Up',       effect: 'Each Court, a number of times equal to your City Status; spend 1 Influence to learn the rating of one named Status type, Kindred or mortal, for a Kindred you can see. They will know this was done, unless you also spend Influence equal to their City Status.' },
      { name: 'Saving Face',        effect: 'Once per Court; spend 1 Influence to reroll a failed Resistance roll against a contested mental Discipline, or to force a reroll against a resisted one.' },
      { name: 'Goad',               effect: 'Once per Court; spend Influence equal to the target\'s City Status to learn their Mask and Dirge.' },
      { name: 'Playing Favourites', effect: 'Once per Court; when a Kindred\'s City Status is being changed, spend Influence equal to the new Status to make that change cost one further point of Status.' },
      { name: 'Curry Favour',       effect: 'Once per Court; spend 1 Influence to impose the Leveraged Condition publicly on a Kindred you can see.' },
    ],
    statusPower: 'Each session, you can raise or lower another character\'s City Status by 1. You can do this a number of times per session equal to your own Effective City Status. You cannot affect your own City Status, and you cannot hold another major court position simultaneously. Your decisions should be grounded in the City Deeds. If you can\'t justify a Status change, others will be justified in dropping yours.',
  },
  'Enforcer': {
    asset: 'Goon Squad',
    merits: ['Safe Place', 'Retainer (Hound)', 'Trained Observer'],
    style: 'Goon Squad',
    manoeuvres: [
      { name: 'Perimeter',           effect: 'Once per Downtime; choose a Territory and spend Influence equal to its Ambience rating to receive a report as though you had scored an exceptional success on a Patrol or Scout action.' },
      { name: 'Ear to the Ground',   effect: 'At Court, you count as holding Contacts in every sphere for the purpose of news from the city at large reaching you, such as a potential Masquerade breach coming to the attention of the police. Each time the Storyteller offers you such information, you must pay Influence to receive it.' },
      { name: 'Stakeout',            effect: 'Each Court, a number of times equal to your City Status; spend 1 Influence to learn one of the following about a target you can see: their Herd rating, their Feeding Grounds rating, or where they hold Feeding Rights. They will know this was done, unless you also spend Influence equal to their City Status.' },
      { name: 'Crackdown',           effect: 'Once per Downtime; spend Influence equal to the target\'s City Status to give your attempts to interfere with their Downtime actions the rote quality. This is not subtle.' },
      { name: 'Neighbourhood Watch', effect: 'Once per Court; spend Influence equal to the City Status of a target you can see to learn one of their Resistance Attributes.' },
    ],
    statusPower: 'Each session, you can lower another character\'s City Status by 1 when they breach what you are charged to enforce. Your enforcement must conform to the norms of court. If you overstep, others will be justified in dropping your own City Status.',
  },
};
