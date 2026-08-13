import { Router } from 'express';
import { getCollection } from '../db.js';
import { isStRole } from '../middleware/auth.js';

const router = Router();
const col = () => getCollection('office_seats');

// GET /api/office_seats
// Reference info, open to any authenticated user — the same posture as
// office-merit-dots.js and office-manoeuvre-rank.js, whose own GET / handlers
// are open reads with ST-gated writes. There is no write verb here at all:
// oxp.2 only needs to READ seats in order to derive office XP from them. Seat
// creation and handover belong to other stories (oxp.5 and beyond), and the
// only writer today is the manual seed script oxp.1 shipped.
//
// Returns the full array of seat documents exactly as stored — no aggregation,
// no derived field. The XP arithmetic happens CLIENT-side in
// public/js/data/office-xp.js, from this array plus the two existing purchase
// routes, mirroring how office-tab.js already fetches office_merit_dots and
// office_manoeuvre_rank and computes from them. Derived values are never
// stored and, here, not even computed server-side, so there is exactly one
// implementation of the accrual rule and one place to test it.
//
// `_id` and `holder_id` are real BSON ObjectIds in storage and are serialised
// to strings at the JSON boundary, matching office_seat.schema.js's own
// documented convention (the schema validates the JSON-serialised form). A
// VACANT seat's `holder_id` is null and must stay null — the string 'null'
// would pass a truthiness check and silently point nowhere.
//
// `notes` is redacted to null for a non-ST caller (Codex review, oxp.2:
// office_seat.schema.js documents this field explicitly as "Provenance
// notes, ST caveats" — unlike its two sibling routes, which only ever expose
// numeric dot/rank data, this collection has a free-text field an ST might
// write something player-sensitive into). Angelus's ruling: keep the route
// open for every other field (needed by a future player-facing UI — that's
// still oxp.6/oxp.7's job), strip only `notes` rather than gating the whole
// route ST-only. `isStRole` also admits `dev` (the privacy-redacted ST
// login), matching every other ST-vs-everyone-else check in this codebase.
router.get('/', async (req, res) => {
  const docs = await col().find({}).toArray();
  const st = isStRole(req.user);
  res.json(docs.map(d => ({
    ...d,
    _id: String(d._id),
    holder_id: d.holder_id == null ? null : String(d.holder_id),
    notes: st ? (d.notes ?? null) : null,
  })));
});

export default router;
