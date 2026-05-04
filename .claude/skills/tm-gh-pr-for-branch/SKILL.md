---
name: TM GH PR For Branch
description: Open a GitHub pull request for the current branch with a properly formatted body that links the BMAD story, closes any referenced issue, and includes a test plan. Use when the user says "open a PR", "create a pull request for this branch", or "ready to merge this branch".
---

# TM GH PR For Branch

Bridges the project's branch flow (Morningstar/Piatra/side-branches → dev → main) into a consistent PR template that cross-references BMAD stories, issues, ADRs, and runbooks. Avoids hand-rolling PR descriptions and enforces the project's hard rule: no merge to `main` without explicit instruction in the user's message.

## When to Use

Invoke when the user asks for any of:
- "Open / create / file a PR for this branch"
- "Pull request from `<branch>` into `<base>`"
- "Ready to merge — open the PR"

Do **not** invoke for:
- Drafting commit messages (use `smart-commit` or just `git commit`).
- Reviewing existing PRs (use `gh pr view` / `gh pr review` directly).
- Pushing the branch — assume that's done; if it isn't, instruct the user.

## Inputs

- **Base branch** (optional, default = `dev`). Most PRs target `dev`. PRs to `main` require an explicit `--base main` from the user *and* the user's current message must explicitly authorise merging-to-main flow.
- **Story path** (optional). If not given, the skill scans the branch's commits for `specs/stories/...` references and asks if exactly one match is found, or prompts if multiple/none.
- **Closes #N** (optional). If not given, the skill auto-detects in this order:
  1. **Branch name** matches `<owner>/issue-(\d+)-...` (the convention from `tm-gh-issue-pickup`) → that issue number is auto-added.
  2. Branch commits scanned for `Closes #N`, `Fixes #N`, `Resolves #N`, or standalone `#N` references.
  3. None — surface as "_None_" in the PR body, ask user if they want to add one before creating.
- `--draft` → create as draft PR.
- `--no-draft` → explicit non-draft (overrides any default).
- Default: PRs are created **non-draft**.

## Steps

1. **Verify prerequisites:**
   - `gh auth status` succeeds. If not, abort with "run `gh auth login`".
   - Current branch is not `main` and not the base branch. If on the base, abort.
   - Branch is pushed (`git rev-parse --verify origin/<branch>` succeeds). If not, ask user whether to push first.
2. **Determine base branch.** Default `dev` unless overridden. If user requested `--base main`:
   - Check the user's current message text for explicit authorisation: must contain a phrase like "merge to main", "PR to main", "ship", or "deploy".
   - If absent, refuse with: "PRs to main require explicit per-message authorisation per CLAUDE.md hard rule."
3. **Gather context:**
   - Commit log: `git log <base>..HEAD --oneline` and `git log <base>..HEAD --format='%B' | head -50`
   - Diff summary: `git diff --stat <base>...HEAD`
   - Story references: grep commit bodies for `specs/stories/[a-z0-9.-]+\.story\.md`. Deduplicate.
   - Issue references: grep commit bodies for `(?:Closes|Fixes|Resolves) #(\d+)` and standalone `#(\d+)`.
   - ADR references: grep for `specs/architecture/adr-[0-9]+`.
   - Runbook references: grep for `specs/runbooks/`.
4. **Construct the PR title:**
   - If exactly one story is referenced and the branch name encodes a feature, use the story's title (read frontmatter).
   - Else use the most recent commit's subject line.
   - Cap at 70 chars; truncate with ellipsis if longer.
5. **Build the PR body** using this exact template (omit empty sections):

   ```markdown
   ## Summary

   <2-4 bullets distilled from commit messages — focus on the *why*, not the *what*>

   ## Closes

   <list of `- Closes #N` lines, or "_None_">

   ## Story

   <list of `- specs/stories/<file>` for each referenced story, or "_No story referenced_">

   ## ADR / Design

   <list of `- specs/architecture/...` and `- specs/design/...` references>

   ## Runbook

   <list of `- specs/runbooks/...` references, or omit section>

   ## Test plan

   - [ ] <derive from story's Verification > Commands if exactly one story; else from commit-message conventions>
   - [ ] CI green
   - [ ] Manual: <derive from story's Verification > Manual checks; else "smoke-test the affected feature in admin / suite UI">

   ## Branch flow

   - From: `<head-branch>`
   - Into: `<base-branch>`
   - <if base == main: warn "PRODUCTION MERGE — auto-deploys to Netlify and Render on merge">
   ```

6. **Print the planned `gh pr create` command and body** to the user. Format:
   ```
   PLANNED: gh pr create --base <base> --head <head> --title "<title>" [--draft]
   --- BODY ---
   <body>
   ------------
   ```
7. **Always ask for confirmation** before executing. PRs are GitHub-visible writes; per CLAUDE.md hard rule, no automatic creation. The confirmation prompt must include: head branch, base branch, draft state, title.
8. **On confirm, execute** via Bash tool with the body passed via heredoc to preserve formatting:
   ```sh
   gh pr create --base <base> --head <head> --title "<title>" [--draft] --body "$(cat <<'EOF'
   <body>
   EOF
   )"
   ```
9. **Capture the PR URL** from `gh`'s output and report: "Opened PR #<n> at <url>". If `gh` returns non-zero (e.g. PR already exists), surface the error and do not retry.

## Boundaries

- **Never** open a PR to `main` without explicit per-message authorisation. Each PR-to-main is its own opt-in; prior session opt-ins do not carry forward.
- **Never** auto-merge after creating. The skill ends at "PR opened".
- **Never** push the branch as a side-effect. If the branch isn't pushed, ask first.
- **Never** modify commit history (rebase, force-push, amend) as part of opening a PR. If the branch needs cleanup, that's a separate explicit request.
- If the branch contains an unmerged merge commit from `main` or `dev`, surface it in the planned body so the reviewer knows.
- If `gh pr list --head <branch>` shows an existing open PR, abort and report it — do not open duplicates.

## Example

User: `open a PR for adversary into dev`

Skill:
1. Verifies `gh` auth and that `adversary` is pushed.
2. Confirms base = `dev`.
3. Reads commits between `dev..adversary` — finds the ADR-001 revision commit and the two script commits.
4. Detects story references in commit bodies (RDE-0, RDE-1, RDE-3) and ADR references.
5. Builds title: `docs(rde): adversarial revision of ADR-001 + RDE epic`.
6. Builds body with Summary (3 bullets), Story list, ADR list, Test Plan with story verification commands.
7. Prints the planned `gh pr create` and asks for confirmation.
8. On `y`, opens the PR and reports: `Opened PR #5 at https://github.com/angelusvmorningstar/TerraMortis/pull/5`.

## Verification

After running, check that:
- `gh pr view <n>` shows the rendered body matches the printed template.
- The PR base/head are correct.
- Linked issues are auto-cross-referenced by GitHub (search for "linked references" in the PR view).
