# Adversarial review: dbo-8-touchstone-mechanic-identity-split

## High

- None found.

## Medium

- [Pass 2] Live relationship picker still offers the retired `touchstone` kind — Medium — `public/js/data/relationship-kinds.js:36` — Trigger: in the NPC relationship editor, create or edit a relationship and select **Touchstone**, then save; Observable consequence: `public/js/admin/relationship-editor.js:199-225` renders the stale option and submits it at lines 462-479, but the server schema rejects it with HTTP 400, leaving a user-visible broken choice and contradicting the client taxonomy's claim that it matches `KIND_ENUM`; Confidence: high.
- [Pass 2] Cleanup can delete a relationship that changed kind after planning — Medium — `server/scripts/dbo-8-orphaned-touchstone-edges-cleanup.mjs:105` — Trigger: `planCleanup` reads a `kind:'touchstone'` row, an ST successfully PUTs that existing row to a schema-valid non-touchstone kind before apply, then `applyCleanup(..., {apply:true})` runs; Observable consequence: the fresh backup captures the converted document, but line 111 deletes by `_id` only, destroying a now-valid relationship (recoverable only by manual backup restoration); Confidence: high.

## Low

- [Pass 1] Orphaned touchstone kind-badge CSS remains — Low — `public/css/components.css:619` — Trigger: load any character sheet after the sole `sh-ts-slot-kind` emitter is removed from `public/js/editor/sheet.js`; Observable consequence: `.sh-ts-slot-kind` and `.sh-ts-slot-kind.dim` are dead maintenance surface and add unused CSS bytes, with no functional impact; Confidence: high.
- [Pass 2] Live suite renderer retains the retired `_npc_name` branch — Low — `public/js/suite/sheet.js:262` — Trigger: render touchstones through the main suite sheet after server enrichment and schema support have been removed; Observable consequence: the live renderer still documents and evaluates `t._npc_name || t.name`, leaving dead mechanic-specific code and making the retirement incomplete, although normal current data still renders correctly through `t.name`; Confidence: high.
- [Pass 3b] Claimed green regression cannot be reproduced in this review environment — Low — `specs/stories/dbo-8-touchstone-mechanic-identity-split.md:210` — Trigger: run the required 12-file gate; Observable consequence: Atlas access to `tm_suite_test` fails with `connect EACCES 159.143.141.178:27017`, producing `11 failed | 1 skipped` files and `191 skipped` tests, so the author's separate 24-file/394-test result is neither confirmed nor disproved here; Confidence: high.

## Validation notes

### Ship decision

- **Not ready to ship as-is.** Remove the stale `touchstone` option from the live relationship taxonomy and make cleanup deletion conditional on the document still carrying `kind:'touchstone'` (with a concurrency test). The Low dead-code/CSS cleanup can be folded into the same correction.

### Pass 1 freeze

- Files opened: `specs/stories/code-review/dbo-8-touchstone-mechanic-identity-split-diff.txt` only.
- Findings frozen before any repository source or story-spec file was opened.

### Pass 2 freeze

- Files opened or line-inspected: `public/js/data/relationship-kinds.js`, `public/js/admin/relationship-editor.js`, `public/js/suite/sheet.js`, `public/js/editor/edit.js` (targeted search), `public/css/components.css` (targeted search), `server/routes/characters.js`, `server/routes/relationships.js`, both changed schemas, the DBO-8 cleanup script/test, `api-touchstone-edges.test.js`, `api-relationships-player-create.test.js`, both comparison cleanup/migration scripts, and both validation middlewares. `server/scripts/archive/` was searched only to classify historical hits. No sibling repository was opened.
- `validateTouchstones` has exactly one caller and no I/O; `forPlayer` is gone from the single-character handler; `_enrichCollectiveSharing` does not consume touchstone enrichment; PUT's `isSt` remains used by the player gate; `CLEARABLE` is membership-only and `TRACKED` is iterated by field name; `apiGet` has no remaining call in `edit.js`, while `apiDelete` remains used for equipment removal.
- The removed pc+npc endpoint check was touchstone-only and did not enforce another kind's rules.
- Direct AJV execution confirmed the intended schema failures: `edge_id` and `touchstone_meta` fail `additionalProperties`; `kind:'touchstone'` fails `enum`. The route tests reach those schema middlewares before the relevant business handlers, although their bare `400` assertions are less diagnostic than checking `errors`.

### Pass 3a freeze

- No additional finding beyond Pass 2: AC4's cap and anchor-range checks remain correct, and AC8's negative requests reach the AJV schema middleware before route business logic.
- Read only the story content preceding `## Dev Agent Record`; the author record remained unopened until this freeze was written.

### Pass 3b claim audit

- The live dry-run claim (one retired orphan with `touchstone_meta.humanity:6`) is **unverifiable by this reviewer**: the review rules forbid touching live `tm_suite`. It is neither accepted nor rejected.
- The exact-token claim that no live path uses `edge_id`/`touchstone_meta`/`touchstone_edge_ids` is consistent with the independent sweep; remaining non-archive hits are tests, the cleanup utility, or explanatory comments. The broader implication that the relationship-touchstone mechanic is absent from live code is false because `public/js/data/relationship-kinds.js:36` still feeds a selectable admin UI option.
- “Mirrors `dbo-1-purchasable-powers-field-cleanup.mjs`'s shape exactly” is overstated: DBO-1 re-derives eligibility from its fresh read and guards the write; DBO-8 backs up fresh documents but deletes stale planned IDs without checking current kind.
- Seven syntax checks passed. The 394-test claim could not be reproduced because network policy blocked `tm_suite_test`; the required 12-file gate discovered 191 tests, all skipped, rather than exercising assertions.

### Command ledger (exact commands and real results)

Pass 1:

- `Get-Content -LiteralPath 'specs/stories/code-review/dbo-8-touchstone-mechanic-identity-split-diff.txt' -Raw` — exit 0; printed the complete 1,213-line diff (the tool display reported `Total output lines: 1213` and truncated its UI rendering).
- `$d = Get-Content -LiteralPath 'specs/stories/code-review/dbo-8-touchstone-mechanic-identity-split-diff.txt'; $d[0..399]` — exit 0; printed diff lines 1–400.
- `$d = Get-Content -LiteralPath 'specs/stories/code-review/dbo-8-touchstone-mechanic-identity-split-diff.txt'; $d[400..799]` — exit 0; printed diff lines 401–800.
- `$d = Get-Content -LiteralPath 'specs/stories/code-review/dbo-8-touchstone-mechanic-identity-split-diff.txt'; $d[800..1212]` — exit 0; printed diff lines 801–1,213. The combined tool display warned that its 14,014-token output was truncated.
- `$d = Get-Content -LiteralPath 'specs/stories/code-review/dbo-8-touchstone-mechanic-identity-split-diff.txt'; $d[300..699]` — exit 0; printed the requested 400-line middle slice, including both schemas and the complete cleanup implementation.
- `$d = Get-Content -LiteralPath 'specs/stories/code-review/dbo-8-touchstone-mechanic-identity-split-diff.txt'; $d[700..899]` — exit 0; printed the requested 200-line test slice.
- `Select-String -LiteralPath 'specs/stories/code-review/dbo-8-touchstone-mechanic-identity-split-diff.txt' -Pattern 'validateTouchstones|forPlayer|isSt|CLEARABLE|TRACKED|sh-ts-slot-kind|apiGet|_npc_name|enrichTouchstoneNpcNames' | ForEach-Object { '{0}: {1}' -f $_.LineNumber, $_.Line }` — exit 0; returned the expected definition/call removals and the removed `sh-ts-slot-kind` emitter at diff line 134.

Pass 2:

- `rg --files -g 'AGENTS.md' -g '!server/scripts/archive/**' .` — exit 1, no output (no `AGENTS.md` found).
- `rg -n -S -g '!server/scripts/archive/**' "edge_id|touchstone_meta|kind\s*[:=]\s*['\"]touchstone['\"]|enrichTouchstoneNpcNames|touchstoneShapeError|_npc_name|touchstone_edge_ids" public server` — command parsing failed with exit 1 and no search output; rerun below with separate `-e` expressions.
- `rg -n -S -g '!server/scripts/archive/**' -e edge_id -e touchstone_meta -e enrichTouchstoneNpcNames -e touchstoneShapeError -e _npc_name -e touchstone_edge_ids public server` — exit 0; key live hit: `public/js/suite/sheet.js:263,270` still documents/reads `_npc_name`; other mechanic-token hits were comments/tests/cleanup fixtures. Unrelated `personal_story_npc_name` substring hits were also printed.
- `rg -n -S "sh-ts-slot-kind" public server -g '!server/scripts/archive/**'` — exit 0; exactly two hits, `public/css/components.css:619-620`.
- `rg -n -S "kind.?[:=].?['\"]touchstone['\"]|['\"]touchstone['\"]" public server -g '!server/scripts/archive/**'` — command parsing failed with exit 1; the next command used fixed-string expressions.
- `rg -n -S -F -e "'touchstone'" -e '"touchstone"' public server -g '!server/scripts/archive/**'` — exit 0; 89 output lines. Key mechanic hit: `public/js/data/relationship-kinds.js:36`; also printed unrelated downtime/investigation uses and data fixtures.
- `Get-Content -LiteralPath 'public/js/data/relationship-kinds.js' -Raw` — exit 0; printed the full taxonomy, including selectable `{ code: 'touchstone', ... }` and the claim that codes match server `KIND_ENUM`.
- `rg -n -S "relationship-kinds|RELATIONSHIP_KINDS|KINDS_BY_FAMILY|kindOptions" public/js server -g '!server/scripts/archive/**'` — exit 0; showed live imports in `public/js/admin/relationship-editor.js` and `public/js/tabs/downtime-form.js`.
- `$p='public/js/suite/sheet.js'; $lines=Get-Content -LiteralPath $p; for($i=245;$i -le 280;$i++){ '{0}: {1}' -f ($i+1),$lines[$i] }` — exit 0; lines 262–270 showed the stale enrichment comment and `t._npc_name || t.name`.
- `rg -n -S "suite/sheet.js|from './suite/sheet|from '../suite/sheet|renderTouchstones" public server -g '!server/scripts/archive/**'` — exit 0; `public/js/app.js:123` imports the suite renderer, confirming it is live.
- `$p='public/js/admin/relationship-editor.js'; $lines=Get-Content -LiteralPath $p; for($i=0;$i -lt $lines.Length;$i++){ if($lines[$i] -match 'RELATIONSHIP_KINDS|kindsByFamily|kindByCode|kind-select|rel-kind'){ '{0}: {1}' -f ($i+1),$lines[$i] } }` — exit 0; returned imports and use sites at lines 9-10, 118, 150, 192, 199, and 396.
- `rg -n -S "kindsByFamily\(|RELATIONSHIP_KINDS" public/js/admin/relationship-editor.js public/js/tabs/downtime-form.js` — exit 0; showed the editor import and `kindsByFamily()` at line 199.
- `rg -n -S "api/relationships" public/js/admin/relationship-editor.js` — exit 0; showed GET at 66, POST at 473, PUT at 479, DELETE at 495.
- `$p='public/js/admin/relationship-editor.js'; $lines=Get-Content -LiteralPath $p; foreach($range in @(@(180,225),@(360,420),@(450,485))){ for($i=$range[0]-1;$i -le $range[1]-1;$i++){ '{0}: {1}' -f ($i+1),$lines[$i] } }` — exit 0; confirmed taxonomy-to-option rendering and POST/PUT submission.
- `$p='server/routes/relationships.js'; $lines=Get-Content -LiteralPath $p; for($i=350;$i -le 470;$i++){ '{0}: {1}' -f ($i+1),$lines[$i] }` — exit 0; confirmed name-based `CLEARABLE`/`TRACKED` processing and kind-changing ST updates.
- `$p='server/scripts/dbo-8-orphaned-touchstone-edges-cleanup.mjs'; $lines=Get-Content -LiteralPath $p; for($i=65;$i -le 120;$i++){ '{0}: {1}' -f ($i+1),$lines[$i] }` — exit 0; showed fresh backup read at 105 and `_id`-only delete at 111.
- `Get-Content -LiteralPath 'server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs' -Raw` — exit 0; printed the full comparison script, including fresh eligibility re-derivation and DB-level guards.
- `Get-Content -LiteralPath 'server/scripts/migrate-office-purchases-to-seats.mjs' -Raw` — exit 0; printed the full comparison migration, including `updated_at` concurrency guards before write and delete.
- `$p='server/routes/relationships.js'; $lines=Get-Content -LiteralPath $p; for($i=290;$i -le 350;$i++){ '{0}: {1}' -f ($i+1),$lines[$i] }` — exit 0; showed `isSt` declared at 334 and used at 337.
- `rg -n -S "validateTouchstones" public server -g '!server/scripts/archive/**'` — exit 0; only definition `characters.js:124` and call `characters.js:499`.
- `rg -n -S "forPlayer|_enrichCollectiveSharing|enrichTouchstoneNpcNames" server/routes/characters.js` — exit 0; only `_enrichCollectiveSharing` definition/calls remained.
- `rg -n -S "apiGet\(" public/js/editor/edit.js` — exit 1, no output (no remaining call).
- `rg -n -S "apiDelete\(" public/js/editor/edit.js` — exit 0; `edit.js:1203` equipment removal remains.
- `rg -n -S -e edge_id -e touchstone_meta -e enrichTouchstoneNpcNames -e touchstoneShapeError -e _npc_name -e touchstone_edge_ids server/scripts/archive` — exit 0; mechanic hits were confined to archived audit/cleanup scripts; numerous unrelated `personal_story_npc_name` backup hits also printed.
- `rg -n -S "sameEndpoint|endpoint|ENDPOINT|MORTAL|PC_TO_PC|typ" server/routes/relationships.js server/schemas/relationship.schema.js` — exit 0; showed generic endpoint collision/schema checks plus player endpoint-kind rules; no other kind used the removed touchstone shape validator.
- `rg -n -S "function validate|export function validate|const validate" server` — exit 0; identified generic and character validation middleware plus unrelated validators.
- `Get-Content -LiteralPath 'server/middleware/validate.js' -Raw` — exit 0; printed AJV middleware returning structured 400 errors.
- `$p='server/tests/api-touchstone-edges.test.js'; $lines=Get-Content -LiteralPath $p; for($i=135;$i -le 210;$i++){ '{0}: {1}' -f ($i+1),$lines[$i] }` — exit 0; showed the three negative requests and bare status assertions.
- `$p='server/schemas/character.schema.js'; $lines=Get-Content -LiteralPath $p; for($i=235;$i -le 265;$i++){ '{0}: {1}' -f ($i+1),$lines[$i] }` — exit 0; touchstone items allow only `humanity`, `name`, `desc`, with `additionalProperties:false`.
- `$p='server/schemas/relationship.schema.js'; $lines=Get-Content -LiteralPath $p; for($i=80;$i -le 112;$i++){ '{0}: {1}' -f ($i+1),$lines[$i] }` — exit 0; `kind` uses current `KIND_ENUM` and root has `additionalProperties:false`.
- `Get-Content -LiteralPath 'server/middleware/validateCharacter.js' -Raw` — exit 0; printed the compiled full/partial AJV middleware.
- `$p='server/routes/characters.js'; $lines=Get-Content -LiteralPath $p; for($i=470;$i -le 510;$i++){ '{0}: {1}' -f ($i+1),$lines[$i] }` — exit 0; showed synchronous validation call at 499.
- `rg -n -S "router.put\('/:id'" server/routes/characters.js` — exit 0; showed `validateCharacterPartial` before the handler at line 448.
- `rg -n -S "function stripEphemeral|export.*stripEphemeral" server && Get-Content -LiteralPath 'server/middleware/stripEphemeral.js' -Raw` — exit 1: first part found `characters.js:27`; second part failed because that middleware is inline and the named file does not exist.
- `$p='server/routes/characters.js'; $lines=Get-Content -LiteralPath $p; for($i=0;$i -le 42;$i++){ '{0}: {1}' -f ($i+1),$lines[$i] }` — exit 0; confirmed only top-level underscore-prefixed fields are stripped, not nested `edge_id`.
- AJV probe (PowerShell here-string piped to `node --input-type=module`, importing both schemas and validating `edge_id`, `kind:'touchstone'`, and `touchstone_meta`) — exit 0; exact results: `edge_id false ... additionalProperty:"edge_id"`; `kind false ... keyword:"enum"`; `touchstone_meta false ... additionalProperty:"touchstone_meta"`. AJV also printed its existing `allowUnionTypes` strict-mode warning.
- `npx vitest run tests/dbo-8-orphaned-touchstone-edges-cleanup.test.js` (working directory `server`) — exit 0, but `Test Files 1 skipped (1)`, `Tests 4 skipped (4)`; no assertions ran because the test database was unavailable.

Pass 3a:

- `$p='specs/stories/dbo-8-touchstone-mechanic-identity-split.md'; $lines=Get-Content -LiteralPath $p; $marker=($lines | Select-String -SimpleMatch '## Dev Agent Record' | Select-Object -First 1).LineNumber; if(-not $marker){ throw 'Dev Agent Record marker not found' }; $lines[0..($marker-2)]` — exit 0; printed only Story through References, stopping before the author record.
- `$p='server/routes/characters.js'; $lines=Get-Content -LiteralPath $p; for($i=108;$i -le 145;$i++){ '{0}: {1}' -f ($i+1),$lines[$i] }` — exit 0; cap `> 6`, Ventrue/non-Ventrue anchors, and `[anchor-5, anchor]` range remain.
- `$p='server/tests/api-touchstone-edges.test.js'; $lines=Get-Content -LiteralPath $p; for($i=40;$i -le 138;$i++){ '{0}: {1}' -f ($i+1),$lines[$i] }` — exit 0; showed six-item cap and humanity range tests.
- `rg -n -S "edge_id|touchstone_meta|KIND_ENUM|characterSchema|relationshipSchema|Ajv" server/tests/api-touchstone-edges.test.js server/tests/dbo-8-orphaned-touchstone-edges-cleanup.test.js server/tests/api-relationships-player-create.test.js` — exit 0; showed API-level payload coverage but no direct schema imports in those tests.

Pass 3b and final verification:

- `$p='specs/stories/dbo-8-touchstone-mechanic-identity-split.md'; $lines=Get-Content -LiteralPath $p; $marker=($lines | Select-String -SimpleMatch '## Dev Agent Record' | Select-Object -First 1).LineNumber; if(-not $marker){ throw 'Dev Agent Record marker not found' }; $lines[($marker-1)..($lines.Length-1)]` — exit 0; printed the full Dev Agent Record only after Pass 3a was frozen.
- Primary gate, run from `D:\Terra Mortis\TM Suite\server` (the PowerShell-workdir equivalent of the requested `cd server && ...`): `npx vitest run tests/api-characters.test.js tests/api-characters-carthian-pull.test.js tests/api-characters-crud.test.js tests/api-characters-public-fields.test.js tests/api-characters-safe-place-locations.test.js tests/api-relationships.test.js tests/api-relationships-for-character.test.js tests/api-relationships-mutual.test.js tests/api-relationships-player-create.test.js tests/api-relationships-player-edit.test.js tests/api-touchstone-edges.test.js tests/dbo-8-orphaned-touchstone-edges-cleanup.test.js` — exit 1 after 129.6s. Summary: `Test Files 11 failed | 1 skipped (12)`; `Tests 191 skipped (191)`; `Duration 123.98s`. Repeated root error: `[setupDb] connectDb() failed: connect EACCES 159.143.141.178:27017`; no test assertion executed.
- `node --check "public/js/editor/edit.js"` — exit 0, no output.
- `node --check "public/js/editor/sheet.js"` — exit 0, no output.
- `node --check "server/routes/characters.js"` — exit 0, no output.
- `node --check "server/routes/relationships.js"` — exit 0, no output.
- `node --check "server/schemas/character.schema.js"` — exit 0, no output.
- `node --check "server/schemas/relationship.schema.js"` — exit 0, no output.
- `node --check "server/scripts/dbo-8-orphaned-touchstone-edges-cleanup.mjs"` — exit 0, no output.
- `git status --short` — exit 0; reported 1,538 pre-existing/unrelated untracked entries plus this required report and two permission warnings for `C:\Users\angel/.config/git/ignore`; it showed no tracked modification made by this review.
- `git diff --check` — exit 0, no output.
- `git diff -- 'specs/stories/code-review/dbo-8-touchstone-mechanic-identity-split-codex-findings.md'` — exit 0, no output because the required report is untracked.
- `git status --short -- public/js/editor/edit.js public/js/editor/sheet.js public/js/suite/sheet.js public/js/data/relationship-kinds.js server/routes/characters.js server/routes/relationships.js server/schemas/character.schema.js server/schemas/relationship.schema.js server/scripts/dbo-8-orphaned-touchstone-edges-cleanup.mjs server/tests/api-touchstone-edges.test.js server/tests/api-relationships-player-create.test.js server/tests/dbo-8-orphaned-touchstone-edges-cleanup.test.js specs/stories/code-review/dbo-8-touchstone-mechanic-identity-split-codex-findings.md` — exit 0; only `?? specs/stories/code-review/dbo-8-touchstone-mechanic-identity-split-codex-findings.md`, plus the same two global-ignore permission warnings.
- `Select-String -LiteralPath 'specs/stories/dbo-8-touchstone-mechanic-identity-split.md' -Pattern 'Full regression: 24 test files' | ForEach-Object { '{0}: {1}' -f $_.LineNumber, $_.Line }` — exit 0; matches at task line 137 and Dev Agent Record line 210.

### Attestation

- I completed the passes in order and froze Pass 1, Pass 2, and Pass 3a before opening the next pass's permitted material.
- I never opened or referenced a sibling repository, never queried live `tm_suite`, and never invoked the cleanup script directly. The only DB-oriented executions were the explicitly permitted test commands; both targeted `tm_suite_test` and could not connect.
- I made no temporary source edit. The only file created/updated was this required findings report, using `apply_patch`; scoped Git status confirms every reviewed source/test file is unchanged by this review and only this report is untracked.
