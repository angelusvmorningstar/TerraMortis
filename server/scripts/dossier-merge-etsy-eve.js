import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { readFileSync } from 'node:fs';
const c = new MongoClient(process.env.MONGODB_URI); await c.connect();
const db = c.db('tm_suite');
const now = new Date().toISOString();
const recs = JSON.parse(readFileSync('server/scripts/_ingest-input.json', 'utf-8'));
const clip = (s, n = 240) => String(s).trim().replace(/\s+/g, ' ').slice(0, n);
const sev = t => /diablerie|amaranth|masquerade breach|killed.*prince|treason/i.test(t) ? 'life_threatening' : 'major';

const TARGETS = [
  { rx: 'Lockridge', label: 'Eve Lockridge' },
  { rx: 'Rocio', label: 'Etsy' },
];
for (const t of TARGETS) {
  const rec = recs.find(r => new RegExp(t.rx, 'i').test(r.name));
  if (!rec) { console.log(`${t.label}: no Excel record`); continue; }
  const ch = await db.collection('characters').findOne({ name: { $regex: t.rx, $options: 'i' } }, { projection: { _id: 1, name: 1, touchstones: 1 } });
  const sheetTs = JSON.stringify((ch.touchstones || []).map(x => x.desc || x.name).filter(Boolean));
  const f = [];
  const add = (tag, v, extra = {}) => { if (v && String(v).trim() && !/^(not yet|tbd|n\/a|none|open to it)$/i.test(String(v).trim())) f.push({ tag, value: clip(v), source: 'excel', ...extra }); };
  add('motivation', rec.why_sydney); add('motivation', rec.why_covenant); add('motivation', rec.court_motive);
  add('aspiration', rec.aspired_role); add('aspiration', rec.covenant_goals); add('aspiration', rec.clan_goals);
  add('worldview', rec.view_traditions); add('worldview', rec.view_elysium); add('worldview', rec.view_mortals);
  add('hunting_method', rec.hunting);
  add('notable_enemy', rec.opposed_cov);
  if (rec.touchstones) add('touchstone', rec.touchstones, { sheet_field: 'touchstones', sheet_value: sheetTs, clash: false, note: 'reconcile vs sheet' });
  if (rec.boons_debts && !/not yet|haven|tbd|don.?t have/i.test(rec.boons_debts)) {
    const owes = /owe(s)?\b/i.test(rec.boons_debts) && !/owes (me|you|him|her)/i.test(rec.boons_debts);
    add(owes ? 'debt' : 'boon', rec.boons_debts, { status: 'outstanding', st_hidden: true });
  }
  if (rec.secret && !/^(no|not yet|open to it|n\/a)\b/i.test(rec.secret.trim())) {
    add('secret', rec.secret, { severity: sev(rec.secret), compromised: /know|aware|seen|told/i.test(rec.secret), st_hidden: true, note: 'severity auto-graded - confirm' });
  }
  // merge: drop prior excel facts, push new
  await db.collection('character_dossier').updateOne({ character_id: ch._id }, { $pull: { facts: { source: 'excel' } } });
  await db.collection('character_dossier').updateOne({ character_id: ch._id }, { $push: { facts: { $each: f } }, $set: { updated_at: now } });
  const doc = await db.collection('character_dossier').findOne({ character_id: ch._id });
  console.log(`${ch.name} MERGE: +${f.length} excel facts -> ${doc.facts.length} total (sources: ${[...new Set(doc.facts.map(x => x.source))].join('+')}).`);
}
await c.close();
