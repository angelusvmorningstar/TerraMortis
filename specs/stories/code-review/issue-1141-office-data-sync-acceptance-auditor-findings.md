## Pass 1 findings

- **AC6 lacks the required retained regression test**

  - **Severity**: Medium
  - **Which AC or claim it concerns**: AC6 — “write a test that proves it rather than assuming it.”
  - **Evidence**: [issue-1141-office-data-sync.test.js](</D:/Terra Mortis/TM Suite/server/tests/issue-1141-office-data-sync.test.js:11>) explicitly says AC6 is not tested. It tests the Socialite data object once and never imports or calls `renderOfficeTab`; no other retained test renders two Socialites. The implementation is per-character and my Chromium check successfully rendered Brandy and Carver independently, but the specified regression test is absent.
  - **Confidence**: High — confirmed by repository-wide test search and direct inspection.

- **The rendered cost heading contradicts the rewritten rules**

  - **Severity**: Medium
  - **Which AC or claim it concerns**: AC1–4, the player-facing story goal, and the “Not touching markup” exclusion.
  - **Evidence**: [office-tab.js](</D:/Terra Mortis/TM Suite/public/js/tabs/office-tab.js:44>) still renders `Manoeuvres (each costs 1 Influence)`. The design source contains variable, escalating, inherited, and unspecified costs—for example, target City Status, Ambience, and “must pay Influence” without an amount. A real Chromium render confirmed the misleading heading appears for all four updated positions. The story’s prohibition on changing markup therefore conflicts with presenting the rewritten rules accurately.
  - **Confidence**: High — directly observed in rendered DOM and contradicted by [office-powers.md](</D:/Terra Mortis/content/rules/office-powers.md:26>).

- **The static data otherwise satisfies AC1–5, AC7–8 and the scope exclusions**

  - **Severity**: Low
  - **Which AC or claim it concerns**: AC1–5, AC7, AC8, and “What this story is NOT.”
  - **Evidence**: All twenty manoeuvres match the design source exactly and in rank order; merit arrays and Enforcer’s `Goon Squad` asset are correct; `Administrator` remains absent and renders the exact pending fallback; all four Status Power strings are unchanged from `main`. The supplied diff does not alter `office-tab.js`, office actions, CSS, character documents, XP mechanics, or persistence.
  - **Confidence**: High — independently compared against the design, base revision, diff, and browser output.

## Pass 2 findings

- **The claimed RED/GREEN results are verified exactly**

  - **Severity**: Low
  - **Which AC or claim it concerns**: Debug Log RED 12/21 and GREEN 21/21.
  - **Evidence**: With `office-data.js` temporarily restored to its `main` content, the suite reported exactly 12 failed / 9 passed. The failures were the expected names, effects, merit arrays, and Enforcer asset; Status Power and Administrator assertions passed. After restoration, it reported 21/21 passing.
  - **Confidence**: High — directly reproduced. The file was restored byte-for-byte; both its SHA-256 and Git-diff hash match their pre-audit values.

- **The “one consumer in the whole codebase” wording is literally overstated**

  - **Severity**: Medium
  - **Which AC or claim it concerns**: Sole-consumer claim.
  - **Evidence**: `office-tab.js` is the only production/runtime importer, which confirms the intended architectural claim. However, the added issue-1141 test is also an importer, so “exactly one consumer in the whole codebase” is false if tests are included. The story’s alternate description of the exporter itself as a second “consumer” is also imprecise.
  - **Confidence**: High — exhaustive `OFFICE_DATA` search found only the exporter, `office-tab.js`, and the new test.

- **The claim about pre-existing tests is verified**

  - **Severity**: Low
  - **Which AC or claim it concerns**: No existing test referenced `OFFICE_DATA` or old office content.
  - **Evidence**: Excluding the newly added issue-1141 suite, no server or Playwright test references `OFFICE_DATA`, and searches for distinctive old manoeuvre names/content found no matches. The #691 suite only source-checks the Head-of-State action wiring.
  - **Confidence**: High — repository-wide test search.

- **The Vitest import “landmine” is verified**

  - **Severity**: Low
  - **Which AC or claim it concerns**: Debug Log claim about `office-tab.js`, `api.js`, and jsdom.
  - **Evidence**: [api.js](</D:/Terra Mortis/TM Suite/public/js/data/api.js:5>) reads `location.hostname` at module top level. Direct Node import of `office-tab.js` failed with `ReferenceError: location is not defined` at that line. [vitest.config.js](</D:/Terra Mortis/TM Suite/server/vitest.config.js:3>) specifies no DOM/jsdom environment.
  - **Confidence**: High — checked both configuration and actual import failure.

- **The historical T4 browser/Mongo run is unverifiable, not disputed**

  - **Severity**: Medium
  - **Which AC or claim it concerns**: T4 and Completion Notes 1–3.
  - **Evidence**: The claimed throwaway script has no remaining artefact; only the story references it. No Mongo MCP is available, no local MongoDB is installed/listening, and a read-only Atlas query failed with network `EACCES`, so the six documents and their live categories cannot be confirmed. The April fixture is demonstrably stale: Brandy is a Socialite, but Carver has no category. Separately, I reproduced the described dynamic-import path in real Chromium with equivalent objects: exact manoeuvre order, merit chips, two independent Socialites, and the Administrator fallback all rendered as claimed.
  - **Confidence**: High that the historical execution and live-data provenance are unverifiable; high that the claimed renderer output is technically correct. Nothing about the execution method is inherently implausible, but “passed on the first attempt” has no independent evidence.

- **The completion record’s “all six office seats” statement is internally false/inconsistent**

  - **Severity**: Medium
  - **Which AC or claim it concerns**: Completion Note 4 and T4’s live-character account.
  - **Evidence**: [the completion note](</D:/Terra Mortis/TM Suite/specs/stories/issue-1141-office-data-sync.story.md:426>) says “all six office seats” and then names seven holders: Eve, Yusuf, René, Einar, Brandy, Carver, and Ivana. It additionally asserts two Primogens, while the design source’s six-seat table has one Primogen and two Socialites. T4’s selected six documents omit René. Live Mongo access was unavailable, so the correct current holder count cannot be resolved here.
  - **Confidence**: High on the numerical/internal contradiction; no conclusion on current Mongo reality.

- **The ten named regression failures are confirmed; the 2330/2335 aggregate is not**

  - **Severity**: Low
  - **Which AC or claim it concerns**: Full-regression Debug Log claim.
  - **Evidence**: There are exactly 171 server test files. Running the ten named files reproduced exactly 10 failed files and 5 failed tests; seven fail during collection, explaining the file/test-count difference. None references `office-data.js`, `office-tab.js`, or `OFFICE_DATA`. A full run did not complete within three minutes, and no local `mongod` exists, so the claimed 2330/2335 total remains unverifiable rather than confirmed or contradicted.
  - **Confidence**: High for the identities, failure counts, and lack of office references; limited for the full aggregate.

- **The description of CLAUDE.md’s failure list is literally false, though its main comparison holds**

  - **Severity**: Medium
  - **Which AC or claim it concerns**: Claim that CLAUDE.md’s list “names only #1115.”
  - **Evidence**: [CLAUDE.md](</D:/Terra Mortis/TM Suite/CLAUDE.md:40>) also lists `desktop-and-css.spec.js` and `post-game-1.spec.js` as known Playwright failures. The narrower claim remains true: of the ten named Vitest failures, only `n7-n9-allocator-readers` is documented there, so the other nine are absent.
  - **Confidence**: High — current `main`, `HEAD`, and the story’s stated base are the same commit, and the base file contains all three entries.

- **Two minor source-inventory claims are off by one**

  - **Severity**: Low
  - **Which AC or claim it concerns**: Dev Notes file-length claims.
  - **Evidence**: The story calls `office-tab.js` 192 lines and `server/routes/office-actions.js` 121 lines; their last numbered source lines are 191 and 120 respectively. Its `office-data.js` count of 54 is correct.
  - **Confidence**: High — direct line counts.

- **No Senior Developer Review section exists**

  - **Severity**: Low
  - **Which AC or claim it concerns**: Requested review-record audit.
  - **Evidence**: The story ends after the Dev Agent Record’s File List at line 453 and contains no “Senior Developer Review” heading or content to verify.
  - **Confidence**: High — checked the complete story and heading index.