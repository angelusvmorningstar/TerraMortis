// server/lib/ordeal-cascade.js — THE one atomic ordeals[] upsert for TM Game.
//
// WHAT IT REPLACES. Four near-identical, non-atomic implementations, one inline in each of:
// history.js, questionnaire.js, ordeal-responses.js, ordeal-submissions.js. Each did a targeted
// match-on-`ordeals.name` `updateOne`, then a SEPARATE `$push` `updateOne` if that matched nothing
// — a check-then-act race. Two concurrent cascades landing on the same character+ordeal (e.g. an
// ST marking complete in the admin panel at the same moment a player's own submission triggers the
// same cascade) could both see `matchedCount === 0` before either had pushed, and both then `$push`,
// producing a DUPLICATE `ordeals[]` entry — which doubles the derived XP, since it's computed as
// `ordeals.filter(o => o.complete).length * 3` (see public/js/editor/xp.js's `xpOrdeals()`).
//
// TM Admin independently hit and fixed the identical bug in their own port of this shape
// (server/lib/ordeal-xp-cascade.js, review round 2026-08-20) — this is the same fix, ported back
// to TM Game's four original sources rather than reproducing the race a fifth time.
//
// Rewritten as ONE atomic aggregation-pipeline `updateOne` (the `[...]` update form) so the
// match-or-append decision and the write happen as a single server-side operation MongoDB can
// never interleave with another write to the same document — the race is closed structurally.
//
// Deliberately does NOT write an `xp` field on the entry. TM Admin's own port does, as a
// considered, separate policy decision documented in its own header (AC5). Doing the same here
// would be a silent, unrelated behaviour change riding along with a concurrency fix — this module
// only closes the race; the entry shape is exactly what the four functions it replaces already
// wrote.
export async function upsertOrdeal(charsCollection, charId, ordealName, now) {
  const entry = { name: ordealName, complete: true, approved_at: now };
  const result = await charsCollection.updateOne(
    { _id: charId },
    [
      {
        $set: {
          ordeals: {
            $cond: [
              { $in: [ordealName, { $ifNull: ['$ordeals.name', []] }] },
              {
                $map: {
                  input: '$ordeals',
                  as: 'o',
                  in: {
                    $cond: [
                      { $eq: ['$$o.name', ordealName] },
                      { $mergeObjects: ['$$o', entry] },
                      '$$o',
                    ],
                  },
                },
              },
              { $concatArrays: [{ $ifNull: ['$ordeals', []] }, [entry]] },
            ],
          },
        },
      },
    ],
  );
  return result.matchedCount > 0;
}
