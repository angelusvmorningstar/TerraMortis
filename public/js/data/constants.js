/* VtR 2e reference constants */

export const CLANS = ['Daeva','Gangrel','Mekhet','Nosferatu','Ventrue'];
export const COVENANTS = ['Carthian Movement','Circle of the Crone','Invictus','Lancea et Sanctum','Ordo Dracul'];
export const ATTR_MENTAL = ['Intelligence','Wits','Resolve'];
export const ATTR_PHYSICAL = ['Strength','Dexterity','Stamina'];
export const ATTR_SOCIAL = ['Presence','Manipulation','Composure'];
export const ALL_ATTRS = [...ATTR_MENTAL,...ATTR_PHYSICAL,...ATTR_SOCIAL];
export const SKILLS_MENTAL = ['Academics','Computer','Crafts','Investigation','Medicine','Occult','Politics','Science'];
export const SKILLS_PHYSICAL = ['Athletics','Brawl','Drive','Firearms','Larceny','Stealth','Survival','Weaponry'];
export const SKILLS_SOCIAL = ['Animal Ken','Empathy','Expression','Intimidation','Persuasion','Socialise','Streetwise','Subterfuge'];
export const ALL_SKILLS = [...SKILLS_MENTAL,...SKILLS_PHYSICAL,...SKILLS_SOCIAL];
export const SKILL_CATS = {Mental:SKILLS_MENTAL, Physical:SKILLS_PHYSICAL, Social:SKILLS_SOCIAL};
export const MASKS_DIRGES = ['Authoritarian','Child','Competitor','Conformist','Conspirator','Courtesan','Cult Leader','Deviant','Follower','Guru','Idealist','Jester','Junkie','Martyr','Masochist','Monster','Nurturer','Penitent','Perfectionist','Questioner','Rebel','Scholar','Social Chameleon','Spy','Survivor','Visionary'];
export const COURT_TITLES = ['','Head of State','Socialite','Primogen','Enforcer','Administrator','Premier','Protector','Harpy','Regent'];

export const BLOODLINE_DISCS = {
  'Ankou':['Auspex','Celerity','Obfuscate','Vigour'],
  'Apollinaire':['Animalism','Dominate','Resilience','Obfuscate'],
  'Bron':['Animalism','Auspex','Dominate','Resilience'],
  'Gorgons':['Animalism','Dominate','Protean','Resilience'],
  'Icelus':['Auspex','Dominate','Obfuscate','Resilience'],
  'Jharana':['Auspex','Celerity','Obfuscate','Vigour'],
  'Kerberos':['Animalism','Majesty','Protean','Resilience'],
  'Khaibit':['Auspex','Celerity','Obfuscate','Vigour'],
  'Lasombra':['Animalism','Dominate','Nightmare','Resilience'],
  'Lidérc':['Celerity','Majesty','Obfuscate','Vigour'],
  'Lygos':['Auspex','Nightmare','Obfuscate','Vigour'],
  'Malkovians':['Animalism','Auspex','Dominate','Obfuscate'],
  'Mnemosyne':['Auspex','Celerity','Obfuscate','Dominate'],
  'Morbus':['Animalism','Auspex','Celerity','Obfuscate'],
  'Norvegi':['Auspex','Obfuscate','Resilience','Vigour'],
  'Nosoi':['Dominate','Obfuscate','Protean','Resilience'],
  'Order of Sir Martin':['Nightmare','Obfuscate','Resilience','Vigour'],
  'Rotgrafen':['Animalism','Dominate','Protean','Resilience'],
  'Scions of the First City':['Animalism','Auspex','Obfuscate','Resilience'],
  'Vardyvle':['Dominate','Obfuscate','Protean','Resilience'],
  'Vilseduire':['Majesty','Nightmare','Obfuscate','Resilience'],
  'Zelani':['Celerity','Majesty','Auspex','Vigour']
};

export const CLAN_BANES = {
  Daeva:{name:'Wanton Curse',effect:"Hungry at 5 or fewer Vitae, Starving at 3 or fewer. Dramatic Failures on feeding cause Persistent Dependent Condition toward a mortal NPC."},
  Gangrel:{name:'Feral Curse',effect:"Frenzy resistance dice pools capped by Humanity (doesn't affect Riding the Wave)."},
  Mekhet:{name:'Tenebrous Curse',effect:"Gain an extra bane at Humanity 6 (doesn't count towards cap); Humanity counts -1 for all Humanity-based banes."},
  Nosferatu:{name:'Lonely Curse',effect:"With mortals, Humanity counts -2; Presence/Manipulation failures become dramatic failures. Intimidation and Subterfuge unaffected."},
  Ventrue:{name:'Aloof Curse',effect:"First Touchstone attaches to Humanity 7; losing it detaches on first Humanity loss. Breaking points always treated as one step lower."}
};
