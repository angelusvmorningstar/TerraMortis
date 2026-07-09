---
name: TM DT Resolve Haven Travel
description: Review a character's downtime haven/Safe Place location changes and travel discretion. Cross-references declared haven addresses against the map pipeline, geocodes new locations, checks for adversarial-territory overlap (werewolf/mage/Sin-Eater/etc.), and categorises travel discretion (Subtle/Neutral/Obvious) from the free-text travel description. Use when the user says "review havens", "check haven locations", "review travel", "travel discretion", or during the prep-work tier of downtime processing (haven/travel review, before Phase 0 mechanical resolution starts).
---

# TM DT Resolve Haven Travel

Reviews a character's declared haven (Safe Place) changes and travel method/precautions for a downtime cycle. Built from a live worked DT5 session with Angelus, following the same audit-first discipline as `tm-dt-resolve-feeding` and `tm-dt-resolve-sorcery`.

**Audit result:** unlike feeding (hardcoded ambience/tolerance formulas), this domain has **no mechanical Suite/Cockpit automation at all** — confirmed against `server/schemas/downtime_submission.schema.js`, which has exactly one relevant field: `travel` (free-text string, "Travel method and precautions"). Haven addresses live in a `safe_place_location_0`-style free-text field, also with no schema entry. This is a pure ST-judgement, cross-referencing task, not something the Suite computes for you.

See also: `dt5-lessons-for-cockpit.md` (`st-working/downtime/dt5/`) for the full methodology writeup this was built from, and `feedback_map_local_only_no_mongo`, `feedback_map_never_delete_locked` memories — both hard rules that apply directly here.

## When to Use

Invoke during the **prep-work tier** of downtime processing — this comes *before* Phase 0 (Sorcery) and any character-action resolution, as part of verifying world-state data checks out before touching a character's actual downtime. Triggers: "review havens", "check haven locations", "review travel", "travel discretion."

## Part 1 — Haven / Safe Place Location Review

1. **Read the character's declared haven text** (`safe_place_location_0` or equivalent free-text field) and compare against their character sheet's existing haven address / the local map data (`server/scripts/_locations-local.json`).
2. **Determine if this is a relocation** (new address vs. what's on record) or a confirmation of an existing haven. If ambiguous from the text, don't assume — ask.
3. **Geocode any new address** via OSM Nominatim (`nominatim.openstreetmap.org/search`, read-only, always set a real `User-Agent`). **Prefer an exact street address over a suburb-level fallback** — a suburb centroid is a placeholder, not a final answer, when a precise address is knowable or can be asked for.
4. **Check for adversarial-territory overlap** — point-in-polygon (`@turf/turf`) against the **full local zone file** (`_locations-local.json`), not just MongoDB's `locations` collection. This distinction matters: Mongo was found mid-cycle to have only 13 of 21 real zones, and a first-pass "all clear" that only checked Mongo was wrong and had to be corrected (filed as issue #976, logged for Peter — not something to fix in this skill). Always check both, and treat the local file as the more complete source if they disagree.
5. **If genuinely inside adversarial territory** (werewolf, mage, Sin-Eater, etc. — use the correct supernatural terminology, e.g. Sin-Eater not "ghost"), this is a real story consequence, not just a data flag — draft what the local supernatural power structure would actually do about an uninvited Kindred haven in their territory (warning, eviction threat, encounter), consistent with how this was handled for prior characters this cycle.
6. **Update the local file only, never MongoDB directly.** Edit `_locations-local.json` (via a Node script if the file is too large for the Edit tool), then regenerate: `node server/scripts/build-map-local.mjs` (run from `server/`), then `node cockpit/scripts/build-map-bundle.mjs` (run from `cockpit/`) to propagate through to what Cockpit actually serves. Verify the regeneration output confirms the expected feature counts.
7. **Hard rule: every save must check locked landmarks.** Before regenerating, confirm no previously-locked landmark/haven pin has gone missing — abort and investigate if one has. This is a standing hard rule (`feedback_map_never_delete_locked`), not a suggestion.
8. **Small, well-understood edits (a coordinate, an address) can be made directly** — edit, write, regenerate, verify live. No need for a heavier review process for a simple location correction (`feedback_map_edits_just_do_it`).

## Part 2 — Travel Discretion Categorisation

Established threshold rule (Angelus, this session — a living ST-set threshold, not inferable from data, confirm it's still current before relying on it):

- **Subtle**: any use of Obfuscate for the travel, including partial or conditional use. Not a high bar — any genuine use qualifies.
- **Neutral**: no Obfuscate, but genuine tradecraft/precautions described (route variation, timing, cover story, etc.).
- **Obvious**: neither of the above — travel with no notable discretion effort.

Steps:
1. Read the character's `travel` free-text field in full.
2. Categorise per the threshold above, stating which condition it met and why.
3. If borderline, apply the threshold consistently with how it's been applied to other characters this cycle already — a threshold decision, once set, should resolve similar cases the same way without relitigating each time.
4. A travel-route map overlay (tracing the actual line from court to haven) is a **deferred Cockpit feature, not something to build now** — note it for the character's record but don't attempt to implement route-tracing in this skill.

## Boundaries

- Never write haven/location changes to MongoDB directly — local file only, regenerated through the existing scripts, per the standing hard rule.
- Never skip the locked-landmark check before a map regeneration.
- Never treat a MongoDB-only zone check as sufficient — always check the local file too.
- Never assume the travel discretion threshold without confirming it's still the current ST-set rule for this cycle.
- Never invent a precise address when only a suburb is known — ask, or use the suburb-level geocode explicitly flagged as a fallback, not a final answer.
