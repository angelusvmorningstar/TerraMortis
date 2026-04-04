# Terra Mortis: Downtime 1 Process Retrospective

This document captures the full scope of Downtime 1 processing for the Terra Mortis chronicle: what was done, how it was done, the hurdles encountered, and the methodology that emerged. It is intended as a reference for future downtimes and for onboarding any new collaborators into the process.

---

## 1. Scope of Work

Downtime 1 covered the period between Game 1 and Game 2 of the chronicle. The ST team needed to process downtime submissions for approximately 25 active player characters (with a further 6 characters outstanding at session end). Each character required:

- Feeding resolution (territory assignment, dice pool, Vitae outcome)
- Project resolution (1 to 4 player-submitted actions per character, each requiring pool construction, dice rolling, and narrative drafting)
- Merit action resolution (Allies, Contacts, Resources, Status, Retainers used as directed actions)
- Intelligence dossier (general intelligence by sphere, Cacophony Savvy intel, mystical visions, rumours)
- Territory report (narrative account of what the character observed in their operating territory)
- Letter from Home (an in-character letter from an NPC to the character)
- Touchstone vignette (a short second-person scene depicting the character's interaction with their mortal anchor)
- ST notes and explainer blocks (flagging items for the ST team's internal reference)

The final output was one markdown file per character (`Downtime1_[Character].md`), plus several ST-facing reference documents.

---

## 2. Timeline and Chat Sessions

The work spanned approximately eight distinct chat sessions between 11 March and 18 March 2026, each handling a different phase of the process:

**Session 1: Downtime Documentation Support** (pre-processing)
Drafted the player-facing Downtime Guide and a mock downtime submission, establishing the format and expectations for what players would submit. This laid the groundwork for processing by defining what a project slot is, how XP spending interacts with actions, and how merit actions work.

**Session 2: Downtime Results Analysis** (initial mechanical processing)
The first pass at processing raw submissions from `Downtime1.xlsx`. This session established the workflow of: extract submission, construct dice pool, roll, propose narrative outcomes for ST confirmation. Characters were processed roughly two at a time (alphabetically). Letters from Home and touchstone vignettes were drafted here for early characters. Key calibration decisions were made, including the rule that 1 success equals a full success (not partial), and how Contacts, Allies, and Resources generate information. The session ended with roughly half the characters processed and several outstanding rolls awaiting ST confirmation.

**Session 3: Downtime Continued** (brief reconnection)
A short session to locate and reconnect with the Downtime Results Analysis session. No substantive work completed; served as a bridge.

**Session 4: Character Profiles** (touchstone and bloodline work)
Touchstone proposals were finalised for all 31 characters. Key rules were established: in-person physical contact required (no phone calls); primary touchstone must be a living mortal; secondary slots can be objects, places, or animals; first referent in a scene cannot be a pronoun. Bloodline history sections were added to relevant profiles. A Touchstone Guidelines document was produced.

**Session 5: Downtime 1 (broken)** (letter production and calibration)
The main production session for player-facing letters. All 25 character files were imported, touchstone scenes were calibrated against profiles and the Touchstone Guidelines, prose fragments were fixed, and ST notes were added. Every touchstone was checked for: valid in-person contact, correct first referent, geographical consistency (e.g. catching a grave scene set in Sydney when the character's husband died in Ohio), and mechanical validity against Humanity rules. The session ended when the `/mnt/user-data/outputs/` filesystem broke, preventing files from being saved for download. A handoff message was prepared for the next session.

**Session 6: Downtime 1.2** (reconstruction and framework building)
Attempted to reconstruct all 25 files from conversation search after the filesystem failure. The search index could not reliably surface prose content from prior sessions, so the files were rebuilt from source materials (character profiles, submission data, project pools, feeding matrix). The investigation framework was formalised during this session, establishing success thresholds for different categories of information (public identity: 5 successes; hidden identity: 10; haven: 10 + Security; touchstone/bloodline: 15). The territorial ambience model was also codified. Explainer blockquotes were added throughout all files.

**Session 7: Building a Downtime Model** (framework formalisation)
Recognised that the ad hoc resolution approach from earlier sessions was producing too many errors, and built three formal reference documents from scratch: the Downtime Resolution Reference (pool construction, modifiers, flagging conventions), the Investigation Matrix (thresholds and success interpretation), and the Feeding Matrix (all 25 characters' feeding locations, pools, dice counts, and territory contributions). The ambience calculation was run in full, producing updated territory ratings. Key mechanical rules were locked: project successes count directly toward the ambience tally (not halved); Dramatic Failure on zero successes applies only when a Discipline is in the pool; pool order is always Attribute + Skill + Discipline.

**Session 8: Feeding Matrix Rolls** (mid-session continuation)
A continuation session after a filesystem failure. Rebuilt the feeding matrix in outputs, rolled remaining ambience projects (Charles Shoring Up, Doc Kane Street Medicine, Edna Judge, Jack Fallow Big Man on Campus). Corrected multiple matrix errors including Barrens feeder counts and pool ordering.

**Session 9: Downtime 1.3** (final processing and review)
The final production session. Remaining characters were processed (Keeper, Kirk, Ludica, Rene Meyer, Yusuf, and others). The process review document was written, capturing all recurring error patterns, calibration rules, and workflow improvements. A handoff instructions document and NPC register were also produced. The session ended with 25 characters complete and 6 still outstanding (Einar, Jelle, Livia, Lothaire, Magda, Ryan Ambrose).

---

## 3. Source Materials

The following inputs fed the process:

- `Downtime1.xlsx`: raw player submissions from the Google Form. Column 3 is character name; columns 6 to 11 are territory feeding declarations; columns 17 to 24 are projects and merit actions. The uploaded version in `/mnt/user-data/uploads/` was more complete than the project copy.
- `CharacterData.xlsx`: the master character data spreadsheet. Requires openpyxl with `data_only=True` to read. Attributes at columns 16 to 24, skills at 25 to 48, disciplines around 248 to 265, merits around 155 to 220. Column mapping K to W (row 1 headers): K=Lost, L=CP, M=SP, N=XP, O=Cnv, P=Ttl, Q=Min, R=Max, S=(empty), T=Spc, U=Bon, V=Add, W=9A.
- Individual character profile `.md` files in `/mnt/project/`
- `Downtime1_Character_Reports.md`: the initial ST summary of all submissions
- `Downtime1_Project_Pools.md`: calculated dice pools for every project
- `Downtime1_ST_Intersection_Report.md`: cross-character conflicts and overlapping actions
- `Downtime1_Global_Effects.md`: chronicle-wide events affecting all characters
- `Downtime1_Sphere_Matrix.md`: influence sphere usage across all characters
- `Downtime1_Territory_Influence.md`: influence spending by territory
- `Terra_Mortis_Touchstone_Guidelines.md`: the touchstone rules document
- `TM_Downtime_Merit_Actions.md`: the highest-authority reference on what Allies, Contacts, Resources, Status, and Retainers can do in downtime
- `TM_Investigation_Matrix.md`: investigation thresholds and modifiers
- `TM_Downtime_Resolution_Reference.md`: pool construction, action types, and resolution rules

---

## 4. Outputs Produced

**Per-character files (25 completed):**
Individual markdown files for Alice Vunder, Anichka, Brandy LaRoux, Carver, Casimir, Charles Mercer-Willows, Charlie Ballsack, Conrad Sondergaard, Cyrus Reynolds, Dr Margaret Kane, Edna Judge, Eve Lockridge, Ivana Horvat, Jack Fallow, Keeper, Kirk Grimm, Ludica, Macheath, Reed Justice, Rene Meyer, Rene St Dominique, Sister Hazel, Tegan Groves, Wan Yelong, and Yusuf.

**ST reference documents:**
- `TM_Downtime_Resolution_Reference.md`: the core resolution framework
- `TM_Investigation_Matrix.md`: investigation thresholds and modifiers
- `Downtime1_Feeding_Matrix.md`: feeding pools, territory assignments, and ambience scoring
- `Downtime1_Mechanical_Resolutions.md`: all signed-off dice rolls with full results
- `Downtime_Process_Review.md`: error patterns and workflow improvements
- `Downtime1_Handoff_Instructions.md`: instructions for continuing in a new session
- `Downtime1_NPC_Register.md`: NPCs invented during downtime processing

**Not completed:**
Six characters (Einar Solveig, Jelle Dunneweld, Livia, Lothaire DuBois, Magda, Ryan Ambrose) were not started. These either submitted no projects or were deferred.

---

## 5. Methodology

The workflow that emerged through iteration (and was codified in the process review) follows these steps:

1. **Import**: copy the character's existing downtime file from `/mnt/project/` to `/mnt/user-data/outputs/`
2. **Pull submission**: extract all columns from `Downtime1.xlsx` for the character
3. **Pull stats**: extract attributes, skills, disciplines, and merits from `CharacterData.xlsx`
4. **Cross-reference matrix**: check `Downtime1_Feeding_Matrix.md` for feeding pool and territory
5. **Summarise**: present a structured summary of what was submitted and what pools and rolls are needed. Do not touch the file yet.
6. **Await confirmation**: get explicit sign-off on pools, penalties, and project scope before rolling
7. **Resolve merit actions first**: Allies, Contacts, Resources, Status. Present results before rolling projects. Allies actions within favour rating require no roll.
8. **Roll projects**: present each roll with pool, dice count, and results. Await ruling on what each delivers before drafting.
9. **Draft**: write the full file
10. **Style review**: check for the five recurring style errors before presenting
11. **Present for review**: deliver the file; wait for corrections
12. **Apply corrections**: targeted edits; re-present
13. **Update mechanical record**: add all rolls to `Downtime1_Mechanical_Resolutions.md`
14. **Update feeding matrix**: note any territory contributions

The key principle is that confirmation gates exist between summarising, rolling, interpreting, and drafting. Collapsing these steps was the single largest source of rework.

---

## 6. Hurdles and Errors

### 6.1 Filesystem Failures

The `/mnt/user-data/outputs/` directory experienced I/O errors on at least two occasions, losing all files produced in those sessions. This forced full reconstruction of work from conversation history (which was unreliable; the search index could not surface prose content from prior sessions) or from source materials. The workaround was writing to `/home/claude/` first, then copying to outputs, but this did not fully mitigate the problem. Each failure cost significant time and required handoff instructions to bridge into the next session.

### 6.2 Pool Construction Errors

Claude repeatedly constructed dice pools incorrectly before rolling. Examples included: using Presence + Occult for a feeding pool that was not viable; defaulting to Manipulation + Socialise for Contacts rolls regardless of context (when the correct approach is Manipulation + a contextually appropriate social skill); omitting penalties (such as the -4 large audience penalty for a broadcast); and misordering pool components (the correct order is always Attribute + Skill + Discipline).

The fix was a mandatory written pool summary before every roll, confirmed by the ST before dice are generated.

### 6.3 Result Misinterpretation

After rolling, Claude sometimes misread what a result delivered. The most consequential example was giving investigation-level intelligence to a character who had only achieved partial progress against a threshold (e.g. giving weapons smuggling intel on 5 successes when the threshold for that category was 10). Another recurring error was treating 1 success as a partial or marginal result, when the chronicle rule is that 1 success means the desired outcome is fully achieved.

The fix was checking every investigation result against the Investigation Matrix before writing the narrative, and stating the threshold and accumulated total explicitly.

### 6.4 Information Scope Errors

Claude generated ambient intelligence that was not asked for, or assigned investigation-grade information to merit actions that do not have investigation thresholds. Contacts and Allies cannot surface Kindred identities, merit ratings, or investigation-matrix-level intel. Merit actions must be explicitly directed by the player to produce anything; passive merits sitting on a sheet generate nothing.

### 6.5 Style Errors

Five recurring style problems required correction across multiple characters:

1. **Mechanics in prose**: naming success counts, pool components, or merit names in narrative text ("Five successes gives you..." or "The Dominate settled deep").
2. **Editorialising**: telling the player what something means or how to interpret it rather than showing what happened ("This is worth knowing" or "These things have a way of working out").
3. **Stacked declaratives**: two or three short sentences in a row that should be folded into one.
4. **Negative framing openers**: beginning narrative sections with what the character did not find or what went wrong, rather than what they encountered or accomplished.
5. **Discipline names in prose**: referring to powers by their mechanical names in player-facing narrative rather than describing their effects.

### 6.6 Touchstone Calibration

Multiple touchstone scenes required rewriting after initial drafts. Common problems included: phone calls instead of in-person contact (Alice Vunder's scene was a phone call to her sister; rewritten as an in-person visit); geographical inconsistencies (Edna Judge's grave scene was set in Sydney when the character's husband died in Ohio in 1947); invalid touchstones (Keeper's initial proposal was Alice Vunder, a Kindred, violating the fundamental rule that Kindred cannot be touchstones); scenes with no actual encounter (Ludica's scene had her not entering the bar, meaning no in-person contact occurred); and pronoun-first referents (multiple scenes opened with "She" or "He" instead of naming the touchstone).

### 6.7 Instruction Sequencing

Claude frequently jumped ahead to later steps before completing directed earlier ones. The most common pattern was moving to project drafting before resolving Allies and Contacts actions, or drafting narrative before rolls were confirmed. The rule established was: complete the directed step, present the result, and wait. Do not reorder, restructure, or anticipate the next step.

### 6.8 Cross-Session Context Loss

Each new chat session started with partial or zero context from prior sessions. The conversation search tool could not reliably surface specific prose content, only chat summaries and fragments. This meant that calibration decisions, editorial rulings, and mechanical corrections had to be re-established in each session, or captured in reference documents that could be loaded at the start of each session. The creation of the Resolution Reference, Investigation Matrix, Process Review, and Handoff Instructions documents was a direct response to this problem.

---

## 7. Key Rules Established

These rules were established through iterative correction during Downtime 1 and are now codified for future downtimes:

**Resolution:**
- 1 success = desired outcome achieved. More successes = better or more detailed outcome. Never treat 1 success as partial.
- Pool order is always Attribute + Skill + Discipline.
- Discipline in pool raises stakes: zero successes becomes Dramatic Failure.
- Project successes count directly toward territory ambience tally (not halved).
- Maximum one step improvement per month; up to two steps degradation.
- Contested rolls: defender wins ties.

**Merit Actions:**
- Merit actions must be explicitly directed to generate information. Passive merits produce nothing.
- Contacts use Manipulation + a contextually appropriate social skill (not always Socialise).
- Allies actions within favour rating (favour equal to or less than Allies dots) require no roll.
- Contacts and Allies cannot surface Kindred identities, merit ratings, or investigation-threshold information.

**Investigation:**
- Extended action with thresholds: public identity 5; hidden identity/private activities 10; haven 10 + Security; touchstone/bloodline 15.
- No lead penalty: -5. Penalty equal to target's Obfuscate rating. +2 for target travelling openly to Court. +2 for target drawing attention during downtime.
- Starting point requires shadowing the target from Court, not merely attending Court.
- When investigation falls below threshold due to blocking: character sees the shape of concealment, never learns who blocked.
- Investigation reveals action, not state. A character's sheet is not a target.

**Feeding:**
- Herds, Mystery Cults, and cults are Vitae bonuses on top of a feeding roll, not a replacement for hunting. Every character still needs a territory and a hunting method.
- Cult/Herd feeding does not count toward territory feeder cap.
- Animal feeding within a territory does not impact the population cap.
- The Barrens is not a territory; it is everywhere outside territories.
- For Downtime 1 specifically, there were no regents and no territory claims, so poaching was not relevant. All feeding was treated as resident.

**Touchstones:**
- Must involve in-person physical contact. Phone, correspondence, and remote observation do not qualify.
- Each touchstone is a single individual.
- Non-elder characters must have a living mortal as primary touchstone.
- Secondary and tertiary slots can be objects, places, or animals with full mechanical benefit.
- First referent in a touchstone scene cannot be a pronoun.
- Detached touchstones (Humanity below attachment level) are a non-issue narratively; the scene stands.

**Letters from Home:**
- The letter is always a reply from an NPC to the character, never from the character.
- Letters are character moments only. No plot hooks.
- If the player has not specified a correspondent, the ST invents one from the character's background and flags it.

**Style:**
- All prose: second person, present tense for touchstone vignettes.
- No em dashes anywhere.
- British English throughout.
- No success counts, discipline names, or mechanical terms in player-facing narrative.
- No editorialising about what results mean.
- Never dictate what a player has chosen, felt, or done.

---

## 8. What Worked Well

- The Letter from Home format was consistent and effective once the convention was established (reply, not outgoing).
- Touchstone vignettes were generally strong and required minimal revision once the calibration rules were in place.
- Explainer blocks in project sections handled the player-facing / ST-facing split effectively.
- The workflow of pull submission, pull stats, summarise, confirm, roll, draft, review worked when followed.
- Identifying when a character has no projects and flagging it for ST invention (Ludica, Yusuf) was the right call rather than leaving it blank.
- The Mechanical Resolutions log provided a clean audit trail of every roll and its outcome.
- The Investigation Matrix gave a clear, repeatable framework for calibrating what information is available at what cost.
- Rolling dice in-session using Python scripts was reliable and transparent (full roll arrays printed for verification).

---

## 9. Recommendations for Downtime 2

1. **Load all reference documents at session start.** The Resolution Reference, Investigation Matrix, Merit Actions guide, and Process Review should be read before any character work begins. This was the single most effective improvement when it was introduced.

2. **Pool summary before every roll.** Present the full pool as: Attribute X + Skill Y + Discipline Z = N dice, with any penalties noted. Get confirmation before rolling.

3. **Threshold check before narrative.** For any investigation roll, state the threshold and accumulated total before writing what it reveals.

4. **Allies and Contacts first, always.** Resolve merit actions before projects. Do not ask about projects until merit actions are complete.

5. **Style pass before presenting.** Run the five-point check (mechanics in prose, editorialising, stacked declaratives, negative framing openers, discipline names) before presenting any draft.

6. **Establish an action type taxonomy.** The following categories were proposed for Downtime 2: Increase/Decrease Ambiance, Patrol/Scout, Hide, Investigate-PC/NPC/Plot, Protect, Attack, Support, Grow, Rumour, Block, Misc. Classifying each submitted action before processing it will reduce scope errors.

7. **Write to `/home/claude/` first, then copy to outputs.** This mitigates filesystem failures.

8. **Produce the NPC Register as a living document.** Every NPC invented during downtime processing should be recorded immediately so they can be reused consistently.

9. **Handoff instructions for every session.** Assume each new session starts with zero context. A brief handoff document at session end saves significant ramp-up time.

10. **Resident/Poacher distinction applies from Downtime 2 onward.** Territory claims and regent assignments will be in place, making this mechanically relevant for the first time.
