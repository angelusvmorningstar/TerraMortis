# Note for Angelus — the umbrella docs aren't reachable from outside your machine

From the second-opinion review (`BRIEF-2026-08-24-second-opinion.md`), Peter's session, 2026-08-24.

## The problem

`data-map.md`, `cycle-model.md`, `rebrand-game-story-admin.md`, and `PETER-DEV-TRANSITION.md` all
live directly under `D:\Terra Mortis` — the umbrella folder itself, not inside any of the three git
repos. The brief calls that folder out as "not a git repo itself," which is accurate, but the
consequence is that those four files are **not in version control anywhere**. They only exist on
your machine.

This isn't a one-off slip. `D:\Terra Mortis\...` is cited as a source of truth in over 270 places
across all three repos — `epic-dbo-database-ownership.md`, dozens of story files, `deferred-work.md`,
even the `.claude/session-start.md` playbooks. `epic-dbo` in particular treats
`D:\Terra Mortis\data-map.md` as its primary source and tells the reader "do not edit
`data-map.md` — the TM Story session holds it." So the ecosystem's own designated ground-truth
document for cross-repo data ownership lives in exactly one place, addressed by a path that only
resolves on one machine.

## Why it matters for this review

I cloned `TerraMortisGame`, `TerraMortisStory`, and `TerraMortisAdmin` to do the second-opinion pass
you asked for. That brought over everything tracked in git — including every file that *cites*
`D:\Terra Mortis\data-map.md` — but not `data-map.md` itself, because it was never committed
anywhere the clone could reach. Ask 2 of the brief (the migration/ownership second opinion) can't
proceed without it. Ask 1 (the downtime-form review) didn't depend on it and is done.

This is also a durability risk independent of this review: if that machine is lost, so is the
ecosystem's own record of what data lives where and why — the same class of risk as the old
TerraMortis checkout I flagged and cleared out separately, just at the "single document" scale
instead of "single repo."

## What I'd suggest

Commit `data-map.md` and the other three umbrella files into one of the repos — my instinct is
`TerraMortisGame/specs/`, since `epic-dbo` already treats it as authoritative there and TM Game is
the repo the brief itself calls the most critical to get right. A short pointer file left behind in
the other two repos' `specs/` (or wherever they currently cite the old path) pointing at the new
location would keep the existing 270+ citations resolvable without a mass rewrite.

If you'd rather keep it as a standalone reference doc outside any single app's ownership, a small
fourth "umbrella" repo works too — the point either way is just that it needs a `git remote`, so it
stops being unreachable by construction.

Once it's committed somewhere I can clone, I can pick Ask 2 straight back up.
