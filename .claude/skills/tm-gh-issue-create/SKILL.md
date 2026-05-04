---
name: TM GH Issue Create
description: Create a properly formatted GitHub issue from a chat description. Structures the user's natural-language request into a templated issue body (background, current vs desired behaviour, acceptance criteria, scope notes), auto-derives labels, runs gh issue create after explicit confirmation. Use when the user says "open an issue for...", "file a bug for...", "track this as an issue", "let's create an issue about...", or describes a feature/bug they want recorded.
---

# TM GH Issue Create

Turns a chat-described feature, bug, or task into a tracked GitHub issue with consistent template. This is the *intake* skill — issues created here become the starting point for the BMAD pipeline (which spins up later via `tm-gh-issue-pickup`).

## When to Use

Invoke when the user asks for any of:
- "Open / file / create an issue for `<X>`"
- "Track this on GitHub" / "add this to the backlog"
- "Let's record this as a bug / feature / task"
- A clearly-formed work intake intent that should outlive the chat session

Do **not** invoke for:
- One-line trivial bugs the user is fixing right now (just commit and move on)
- Questions about existing issues (use `gh issue list` / `view` directly)
- Story creation — issues are coarser than stories; the story is generated *later* from the issue when picked up via `tm-gh-issue-pickup`

## Inputs

- **The chat description** (the conversation context up to this invocation). The user may have spent multiple turns describing the problem; the skill should use that full context, not just the most recent message.
- **Optional explicit fields** the user may include:
  - `--type bug|feature|chore|docs` → maps to a label
  - `--epic rde|pp|dt|...` → maps to label `epic:<value>`
  - `--label <l>,<l>` → extra labels
  - `--assignee <user>`
  - `--draft` → print plan, don't create

## Steps

1. **Read the conversation context** to assemble the issue's substance. The skill should *not* invent details — only use what's been said. If essential information is missing (e.g. no clear acceptance criteria expressible), ask the user one focused clarifying question, then proceed.
2. **Verify `gh auth status`.** If not authenticated, abort with "run `gh auth login` first".
3. **Auto-derive metadata:**
   - **Title**: one-line summary distilled from the description, ≤70 chars. Imperative voice ("Add SSJ Status-dot path", not "I want SSJ to also count Status").
   - **Type**: inferred from language — bug-words ("broken", "wrong", "doesn't work") → `bug`; feature-words ("add", "support", "should also") → `feature`; otherwise ask. User's `--type` flag overrides.
   - **Epic label**: if the description mentions a known epic prefix (RDE, PP, DT, NPCR, etc.), apply `epic:<lowercase>`. User's `--epic` flag overrides.
   - **Standard labels**: always add `bmad-intake` so issues created via this skill are filterable.
4. **Build the issue body** using this template (omit empty sections):

   ```markdown
   ## Background

   <2-4 sentences from the chat: why this matters, what motivated raising it. Include any concrete trigger ("noticed while reviewing X", "user reported Y").>

   ## Current behaviour

   <if bug or "current vs desired" applies: describe what happens today, with concrete file:line refs if cited in chat>

   ## Desired behaviour

   <what should happen instead, or what the new feature should do>

   ## Acceptance criteria

   - [ ] <each as a Given/When/Then if possible, else a clear condition that can be checked>
   - [ ] ...

   ## Scope notes

   - **In scope**: <bullets>
   - **Out of scope**: <bullets — the things deliberately deferred>
   - **Open questions**: <bullets if any unresolved>

   ## References

   <list of code paths, ADRs, prior issues, runbooks, audit transcripts that the chat surfaced. Format as bullet list with code-formatted paths.>

   ---
   _Created via `tm-gh-issue-create` skill from chat session. The next step is `tm-gh-issue-pickup #<n>` to spin up a side branch and a BMAD story._
   ```

5. **Print the planned `gh issue create` command and body** to the user. Format:

   ```
   PLANNED:
     gh issue create \
       --title "<title>" \
       --label "<labels>" \
       [--assignee <a>]

   --- BODY ---
   <body>
   ------------
   ```

6. **If `--draft`** was supplied, stop here.
7. **Otherwise, ask for confirmation** ("Create this issue? (y/N)") before executing. No GitHub-visible writes without explicit per-invocation confirmation.
8. **On confirm, execute** via Bash with body via heredoc:

   ```sh
   gh issue create --title "<title>" --label "<labels>" [--assignee <a>] --body "$(cat <<'EOF'
   <body>
   EOF
   )"
   ```

9. **Capture issue number + URL** from `gh`'s output. Report:

   ```
   Created #<n> at <url>

   Next: when ready to start work, say "pick up issue <n>" and `tm-gh-issue-pickup` will create the branch and hand off to BMAD SM.
   ```

## Boundaries

- **Never** create an issue without confirmation.
- **Never** invent acceptance criteria the chat didn't surface. If the criteria are vague, ask one clarifying question first.
- **Never** auto-assign without `--assignee`.
- **Never** add an `epic:*` label the user didn't reference (explicitly or via clear language about a known epic).
- If the description is clearly a one-off bug fix the user is about to do in this session, ask whether they actually want an issue or just want to commit the fix — issues for trivia are noise.
- If `gh issue list --search "<title prefix>"` returns a likely duplicate, surface it before creating.

## Example

**Chat (across several turns):**
> User: "There's a bug where Secret Society Junkie's Herd bonus only counts MCI dots, but the merit description says Status OR MCI. Code is in domain.js around line 28."
> Assistant: (explains the issue)
> User: "open an issue for this"

**Skill:**
1. Reads the chat: the bug, the file location, the description-vs-code mismatch.
2. Asks one clarifying question: "Acceptance: should Status dots be summed from `c.status.city + c.status.clan + c.status.covenant.*`, or only specific covenants? And should the description be the canonical source if they disagree?"
3. After user clarifies, builds:
   - Title: `SSJ: Herd bonus should also count Status dots, not just MCI`
   - Labels: `bug`, `bmad-intake`
   - Body with Background (description-vs-code mismatch in `domain.js:28`), Current behaviour (only MCI summed), Desired behaviour (Status + MCI per merit description), Acceptance criteria (Given a char with Status 3 and MCI 2 and SSJ → Herd bonus = 5), References (`public/js/editor/domain.js:28-32`, `public/pdf-test.html:171`).
4. Prints planned command + body.
5. On `y`, runs `gh issue create`, reports `Created #14 at .../issues/14`.

## Verification

After running:
- `gh issue view <n>` shows the body matches.
- Labels applied as expected.
- The follow-up message points cleanly at `tm-gh-issue-pickup #<n>` for the next step.
