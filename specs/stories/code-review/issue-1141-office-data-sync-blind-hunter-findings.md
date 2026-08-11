- **The committed suite does not test the required two-Socialite scenario**
  - **Severity**: Medium
  - **Location**: `server/tests/issue-1141-office-data-sync.test.js:11` (contradicts `specs/stories/issue-1141-office-data-sync.story.md:65`)
  - **Triggering input or sequence**: Render two different characters whose `court_category` is `Socialite`, sequentially or concurrently. The committed test never constructs characters or invokes `renderOfficeTab`.
  - **Observable consequence**: A regression where the second render overwrites, contaminates, or fails after the first would still leave this suite at 21/21 passing. The deleted throwaway browser test provides no ongoing regression protection.
  - **Confidence**: High. The complete test file imports only `OFFICE_DATA`, and its own comment explicitly acknowledges that AC6 is not tested despite the acceptance criterion saying to “write a test that proves it.”

- **The Administrator test cannot prove that the fallback still renders**
  - **Severity**: Low
  - **Location**: `server/tests/issue-1141-office-data-sync.test.js:104`
  - **Triggering input or sequence**: Remove or alter the fallback in `office-tab.js`, then render a character with `court_category: 'Administrator'` and run this test suite.
  - **Observable consequence**: The Administrator can receive no message or the wrong message while this test remains green, because it asserts only that `OFFICE_DATA.Administrator` is undefined.
  - **Confidence**: High. No rendering code is imported or exercised. This does verify the data precondition, but not AC7’s stated player-visible result.

- **The Head of State merit-count rationale contradicts the actual diff**
  - **Severity**: Low
  - **Location**: `specs/stories/issue-1141-office-data-sync.story.md:285`
  - **Triggering input or sequence**: Compare the old and new Head of State arrays, or render each version.
  - **Observable consequence**: The old version renders five chips—four real merits plus `Government House`—and the new version renders four. The story incorrectly says “still four items, no count regression” and describes the old set as “three-plus-a-duplicate.”
  - **Confidence**: High. Both arrays are visible in the diff and contain five and four entries respectively. The code change itself appears correct; the rationale is inaccurate.

- **The recorded red-test breakdown falsely says every position’s name assertion failed**
  - **Severity**: Low
  - **Location**: `specs/stories/issue-1141-office-data-sync.story.md:375`
  - **Triggering input or sequence**: Run the new tests against the pre-change data shown in the diff.
  - **Observable consequence**: Enforcer’s five manoeuvre names and order are identical before and after, so its ordered-name test passes. The stated total of 12 failures is consistent only with three name failures, four full-manoeuvre failures, four merit failures, and one asset failure—not name failures for all four positions.
  - **Confidence**: High. The old and expected Enforcer name arrays can be compared directly in the diff.