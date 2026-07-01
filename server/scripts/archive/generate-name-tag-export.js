import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('../../node_modules/xlsx/xlsx.js');

const BASE = 'D:\\Terra Mortis\\Character Sheets\\Sheet Elements\\';

const CLAN = {
  Mekhet:    BASE + 'Mekhet icon.svg',
  Daeva:     BASE + 'Daeva icon.svg',
  Ventrue:   BASE + 'Ventrue icon.svg',
  Gangrel:   BASE + 'Gangrel icon.svg',
  Nosferatu: BASE + 'Nosferatu icon.svg',
};
const COV = {
  'Circle of the Crone': BASE + 'Crone icon.svg',
  'Carthian Movement':   BASE + 'Carthian icon.svg',
  'Lancea et Sanctum':   BASE + 'Lance icon.svg',
  'Invictus':            BASE + 'Invictus icon.svg',
};

const COURT = new Set(['Regent','Harpy','Premier','Protector','Primogen','Sheriff','Herald','Whip']);
const ct  = h => (h && COURT.has(h)) ? h : '¬'; // ¬
const bp  = v => v >= 2 ? '†' : '';              // †
const hum = v => v <= 4 ? '˅' : '~';             // ˅
const pr  = p => (p && p.trim()) ? p : '¬';       // ¬
const ag  = a => a || '';
const ft  = f => (f && f.trim()) ? f : '';

const rows = [
  // Effective City Status = status.city + TITLE_STATUS_BONUS[court_category] + regent ambience bonus
  // TITLE_STATUS_BONUS: Head of State +3, Primogen +2, Socialite/Enforcer/Administrator +1
  // Ambience bonus (regent only): Curated/Verdant +1, The Rack +2
  // Source: calcCityStatus() in public/js/data/accessors.js
  ['Sheet','Character Name','Pronouns','Clan Icon','Covenant Icon','Court Title','BP Icon','Hum Icon','Apparent Age','Features','City Status'],

  // Alice Vunder — status.city=2, no court_category, North Shore=Tended(0) → 2
  ['tblCharDataAlice','Alice Vunder','she/her',CLAN.Mekhet,COV['Circle of the Crone'],ct('Regent'),bp(1),hum(6),'Late 20s','',2],

  // Anichka — Hierophant is covenant role, not court; apparent_age updated; features preserved from Excel
  // status.city=2, no court_category, no ambience → 2
  ['tblCharDataAnichka','Anichka','she/her',CLAN.Mekhet,COV['Circle of the Crone'],ct('Hierophant'),bp(1),hum(6),'Late Teens','smells like animals',2],

  // Benedict Wiesel — NEW; status.city=0 → 0
  ['tblCharDataBenedict','Benedict Wiesel',pr(''),CLAN.Ventrue,COV['Lancea et Sanctum'],ct(null),bp(1),hum(7),'Early 20s','',0],

  // Brandy LaRoux — status.city=3, Socialite(+1) → 4
  ['tblCharDataBrandy','Brandy LaRoux','she/her',CLAN.Gangrel,COV['Circle of the Crone'],ct('Harpy'),bp(1),hum(5),'Late 20s','',4],

  // Carver — status.city=2, no court_category → 2
  ['tblCharDataCarver','Carver','he/him',CLAN.Ventrue,COV['Lancea et Sanctum'],ct(null),bp(2),hum(6),'Mid 40s','',2],

  // Casamir 'Cazz' — Dr is personal, not a court title; status.city=2 → 2
  ["tblCharDataCazz","Casamir 'Cazz'",'he/they',CLAN.Ventrue,COV['Carthian Movement'],ct('Dr'),bp(2),hum(6),'Mid 30s','',2],

  // Charles Mercer-Willows — Preacher is covenant role; status.city=2 → 2
  ['tblCharDataCharles','Charles Mercer-Willows','he/him',CLAN.Ventrue,COV['Circle of the Crone'],ct('Preacher'),bp(1),hum(5),'Mid 30s','',2],

  // Charlie Ballsack — Sir Knight not a court title; status.city=2 → 2
  ["tblCharDataCharlie","Charlie Ballsack",'it/it',CLAN.Nosferatu,COV['Invictus'],ct('Sir Knight'),bp(1),hum(4),'Too Leprous to Tell','Rotting puss ridden leprous flesh',2],

  // Conrad Sondergaard — status.city=2 → 2
  ['tblCharDataConrad','Conrad Sondergaard','he/him',CLAN.Mekhet,COV['Lancea et Sanctum'],ct(null),bp(2),hum(7),'Late 20s','',2],

  // Cyrus Reynolds — Fame preserved from Excel; status.city=2 → 2
  ['tblCharDataCyrus','Cyrus Reynolds','he/him',CLAN.Daeva,COV['Circle of the Crone'],ct(null),bp(1),hum(6),'Mid 30s','Fame',2],

  // Don Ezzelino Rocio 'Etsy' — NEW; status.city=0 → 0
  ["tblCharDataEtsy","Don Ezzelino Rocio 'Etsy'",pr(''),CLAN.Ventrue,COV['Invictus'],ct(null),bp(1),hum(6),'Late 30s','',0],

  // Edna Judge — status.city=3, Primogen(+2) → 5
  ['tblCharDataEdna','Edna Judge','she/her',CLAN.Nosferatu,COV['Lancea et Sanctum'],ct('Bishop'),bp(1),hum(4),'Late 50s','',5],

  // Einar Solveig — status.city=3, no court_category → 3
  ['tblCharDataEinar','Einar Solveig','he/him',CLAN.Ventrue,COV['Carthian Movement'],ct(null),bp(2),hum(5),'Late 30s','',3],

  // Eve Lockridge — status.city=3, Head of State(+3) → 6
  ['tblCharDataEve','Eve Lockridge','they/them',CLAN.Daeva,COV['Carthian Movement'],ct('Premier'),bp(1),hum(6),'Mid 20s','',6],

  // Hazel — Sister is personal honorific; status.city=2 → 2
  ['tblCharDataHazel','Hazel','she/her',CLAN.Ventrue,COV['Lancea et Sanctum'],ct('Sister'),bp(2),hum(4),'','',2],

  // Henry St. John 'Keeper' — court_category=null; status.city=4 → 4
  ["tblCharDataKeeper","Henry St. John 'Keeper'",'He/They',CLAN.Mekhet,COV['Circle of the Crone'],ct('Senator'),bp(2),hum(3),'Mid 40s','Inhumanly high presence',4],

  // Ivana Horvat — status.city=3 → 3
  ['tblCharDataIvana','Ivana Horvat','she/her',CLAN.Gangrel,COV['Circle of the Crone'],ct(null),bp(1),hum(5),'Mid 20s','',3],

  // Jack Fallow — status.city=3, The Academy regent=Curated(+1) → 4
  ['tblCharDataJack','Jack Fallow','he/him',CLAN.Mekhet,COV['Circle of the Crone'],ct('Regent'),bp(1),hum(4),'Mid 40s','',4],

  // Julia Dolancia — NEW; status.city=1 → 1
  ['tblCharDataJulia','Julia Dolancia',pr(null),CLAN.Nosferatu,COV['Invictus'],ct('Lady'),bp(2),hum(5),'Late 30s','',1],

  // Laura — NEW; status.city=0 → 0
  ['tblCharDataLaura','Laura',pr(''),CLAN.Nosferatu,COV['Lancea et Sanctum'],ct(null),bp(1),hum(7),'','',0],

  // Livia — Striking Looks preserved; status.city=2 → 2
  ['tblCharDataLivia','Livia','she/her',CLAN.Daeva,COV['Lancea et Sanctum'],ct(null),bp(1),hum(6),'','Striking Looks',2],

  // Ludica Lachramore — status.city=3 → 3
  ['tblCharDataLudica','Ludica Lachramore','she/her',CLAN.Mekhet,COV['Invictus'],ct('Lady'),bp(1),hum(5),'Mid 20s','',3],

  // Macheath 'Mac' — status.city=2 → 2
  ["tblCharDataMac","Macheath 'Mac'",'he/him',CLAN.Mekhet,COV['Carthian Movement'],ct(null),bp(2),hum(5),'Mid 30s','',2],

  // Magda — status.city=1 → 1
  ['tblCharDataMagda','Magda','she/her',CLAN.Nosferatu,COV['Lancea et Sanctum'],ct(null),bp(1),hum(6),'','',1],

  // Margaret 'Doc' Kane — status.city=2, Enforcer(+1) → 3
  ["tblCharDataDoc","Margaret 'Doc' Kane",'she/her',CLAN.Gangrel,COV['Carthian Movement'],ct('Protector'),bp(2),hum(6),'','',3],

  // Reed Justice — status.city=4, no court_category, Harbour=Untended(0) → 4
  ['tblCharDataReed','Reed Justice','he/him',CLAN.Ventrue,COV['Invictus'],ct('Regent'),bp(1),hum(6),'Late 30s','',4],

  // René Meyer — status.city=2, no court_category, Second City=Settled(0) → 2
  ['tblCharDataReneM','René Meyer','she/her',CLAN.Daeva,COV['Carthian Movement'],ct('Regent'),bp(1),hum(5),'Late 20s','',2],

  // René St. Dominique — status.city=2, Primogen(+2), Dockyards=Neglected(0) → 4
  ['tblCharDataReneSt','René St. Dominique','he/him',CLAN.Ventrue,COV['Invictus'],ct('Primogen'),bp(2),hum(5),'','',4],

  // Ryan Ambrose — Mister is personal; status.city=1 → 1
  ['tblCharDataRyan','Ryan Ambrose',pr(null),CLAN.Gangrel,COV['Invictus'],ct('Mister'),bp(1),hum(6),'Late 20s','',1],

  // Tegan Groves — status.city=2 → 2
  ['tblCharDataTegan','Tegan Groves','she/her',CLAN.Gangrel,COV['Lancea et Sanctum'],ct(null),bp(1),hum(6),'Mid 20s','',2],

  // Wan Yelong — Lord is personal; status.city=2 → 2
  ['tblCharDataWan','Wan Yelong','he/him',CLAN.Mekhet,COV['Invictus'],ct('Lord'),bp(1),hum(6),'Mid 50s','',2],

  // Xavier Boussade — NEW; status.city=1 → 1
  ['tblCharDataXavier','Xavier Boussade','he/him',CLAN.Nosferatu,COV['Carthian Movement'],ct(null),bp(2),hum(4),'Early 30s','Air of Menace',1],

  // Yusuf Kalusicj — was 'Mammon'; status.city=3 → 3
  ['tblCharDataMammon','Yusuf Kalusicj','he/him',CLAN.Nosferatu,COV['Carthian Movement'],ct(null),bp(2),hum(4),'Indeterminate','Air of Menace',3],

  // Zac — NEW; status.city=0 → 0
  ['tblCharDataZac','Zac','he/him',CLAN.Daeva,COV['Carthian Movement'],ct(null),bp(2),hum(7),'','',0],
];

const ws = XLSX.utils.aoa_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
XLSX.writeFile(wb, 'D:\\Terra Mortis\\Character Sheets\\Data Merge Export.xlsx');
console.log(`Written ${rows.length - 1} character rows.`);
