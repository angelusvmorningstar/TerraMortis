---
name: TM GH Issue From Story
description: Create a GitHub issue from a BMAD story file. Reads the story's frontmatter, Intent, and Acceptance Criteria, builds a properly formatted issue body, and runs gh issue create. Use when the user says "open an issue for this story", "make an issue from rde.X", or asks to track a BMAD story on GitHub.
---

# TM GH Issue From Story

Bridges BMAD stories (markdown files in `specs/stories/`) into trackable GitHub issues. Avoids hand-rolling issue bodies and keeps a consistent template across the repo.

## When to Use

Invoke when the user asks for any of:
- "Open / create / file an issue for `<story-path>` (or story `rde.N`)"
- "Track this story on GitHub"
- "Make a GitHub issue for the next sprint"

Do **not** invoke for:
- One-off bug reports the user is dictating directly (just use `gh issue create` straight)
- Generic questions about issues (use `gh issue list` / `view`)

## Inputs

- **Story file path** (required). One of:
  - Explicit path: `specs/stories/rde.3.pt-migration-pilot.story.md`
  - Story ID the skill resolves: `rde.3` → glob `specs/stories/rde.3*.story.md`
- **Optional flags from the user message**:
  - `--draft` → set issue body but don't create yet (just print the `gh` command for review)
  - `--label <l>,<l>` → extra labels beyond the auto-derived ones
  - `--assignee <user>` → set assignee

## Steps

1. **Resolve and read the story file.** If only a story ID was given, glob to find it. Fail with a clear message if zero or multiple matches.
2. **Parse frontmatter** (between `---` lines at top): `title`, `type`, `status`, `context` array, optional `recommended_model`.
3. **Extract sections** from the body:
   - `## Intent` → first paragraph (the "**Problem:**" line) becomes the issue's lead.
   - `## Tasks & Acceptance > Acceptance Criteria` → checkbox list in the issue body. Each `- Given … when … then …` becomes `- [ ] …` (unchecked).
   - `## Verification > Commands` → fenced code block in Test Plan.
4. **Auto-derive labels**:
   - Story `type: feature` → label `feature`
   - Story `type: refactor` → label `refactor`
   - Story `type: test` → label `test`
   - Story file matches `rde.*` → label `epic:rde`
   - Story file matches `dt*` → label `epic:downtime`
   - Story file matches `pp.*` → label `epic:pp`
   - Always add: `bmad-story`
   - Merge with any user-supplied `--label`s; deduplicate.
5. **Build the issue body** using this exact template (substitute placeholders):

   ```markdown
   ## Story
   - **File**: `<story-path>`
   - **Type**: <type>
   - **Status**: <status>
   - **Context**: <comma-separated context list, each as code-formatted path>
   <if recommended_model present>- **Recommended model**: <recommended_model></if>

   ## Intent

   <Intent section's "Problem:" paragraph verbatim>

   ## Acceptance Criteria

   <each criterion as an unchecked checkbox>

   ## Test Plan

   <Verification > Commands section, fenced as ```sh>

   ## Manual checks

   <Verification > Manual checks section as bullet list>

   ---
   _Auto-created from BMAD story by `tm-gh-issue-from-story` skill. Edit the source story (`<story-path>`) for canonical updates._
   ```

6. **Print the planned `gh issue create` command and body** to the user. Format:
   ```
   PLANNED: gh issue create --title "<title>" --label "<labels>" [--assignee <a>]
   --- BODY ---
   <body>
   ------------
   ```
7. **If `--draft` was supplied**, stop here — the user will run it themselves.
8. **Otherwise, ask for confirmation** ("Create this issue? (y/N)") before executing. The session's hard rule: no GitHub-visible writes without per-request confirmation.
9. **On confirm, execute** via Bash tool, capture the issue URL/number from `gh`'s output, and report it back: "Created #<n> at <url>". If `gh` returns non-zero, surface the error and do not retry silently.

## Boundaries

- **Never** edit the source story file. The story is the source of truth; the issue is a mirror.
- **Never** create issues against a repo other than the one the working directory is in. Cross-repo issues require explicit opt-in.
- **Never** auto-assign or auto-label outside the rules above. User asks for `--assignee`/`--label`, the skill obeys; otherwise stays minimal.
- If the story has no `## Acceptance Criteria` block, fall back to the `Tasks & Acceptance > Execution` checklist as the body's task list and note the gap.
- If `gh auth status` fails, abort with a clear "run `gh auth login` first" message — do not attempt anything else.

## Example

User: `open an issue for rde.0`

Skill:
1. Globs `specs/stories/rde.0*.story.md` → finds `rde.0.legacy-migration-cleanup.story.md`.
2. Reads frontmatter (title: "Legacy data-migration cleanup…", type: refactor, context: ADR-001 + design summary).
3. Extracts Intent and Acceptance Criteria.
4. Derives labels: `refactor`, `epic:rde`, `bmad-story`.
5. Prints the planned `gh issue create` and body.
6. Asks: "Create this issue?"
7. On `y`, runs and reports `Created #4 at https://github.com/angelusvmorningstar/TerraMortis/issues/4`.

## Verification

After running, check that:
- `gh issue view <n>` shows the body matches what was printed.
- The issue carries the auto-derived labels.
- The story file's path is reachable via the link in the issue body (relative path from repo root).
