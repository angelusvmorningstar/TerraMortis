# Claude Code + GitHub setup for TerraMortis

One-time setup so the project's `tm-gh-*` skills and the commit-policy hook work end-to-end. Mostly for Angelus on first pull after Piatra-side adds these; equally applies to any future contributor.

## What you're enabling

After this is done, in any Claude Code session in this repo you can:

- Describe a feature/bug in chat → say "open an issue for this" → skill creates a templated GitHub issue.
- Say "pick up issue N" → skill creates a side branch, hands the issue to BMAD SM (`bmad-create-story`), spins up a story file with the issue body as context.
- Work happens (BMAD dev/QA cycle as normal).
- Say "open a PR for this branch" → skill builds a PR with `Closes #N` derived from branch name and links to story / ADR / runbook.
- The commit hook quietly blocks any `git commit` while you're on `main`, and warns once per commit on other branches so you can sanity-check the branch before it lands.

The skills live in `.claude/skills/tm-gh-*` and the hook in `.claude/hooks/check-branch-on-commit.sh` — all committed to the repo, so once you've done the steps below they just work.

## 1. Install `gh` CLI

**macOS** (via Homebrew):
```sh
brew install gh
```

**Linux** (Debian/Ubuntu):
```sh
sudo apt install gh
# or, for the latest:
# curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
# echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list
# sudo apt update && sudo apt install gh
```

**Windows** (winget):
```sh
winget install --id GitHub.cli
```

Verify:
```sh
gh --version
# expect: gh version 2.x ...
```

## 2. Authenticate

```sh
gh auth login
```

Choose:
- **GitHub.com**
- **HTTPS** (or SSH — both work; HTTPS is simpler if you're already on it)
- **Login with a web browser** — opens a browser, paste the one-time code, authorise.

Default scopes (`repo`, `read:org`, `gist`) are sufficient for the issue/PR flow.

Verify:
```sh
gh auth status
# expect: ✓ Logged in to github.com account <yours>
gh repo view --json name,owner | head -3
# expect: angelusvmorningstar/TerraMortis
```

## 3. Create the project label taxonomy

The `tm-gh-issue-create` skill auto-derives labels per issue. Most don't exist on the repo by default. Create them once (admin-only operation, so Angelus or anyone with admin):

```sh
# Type labels (bug / enhancement already exist as defaults)
gh label create "feature" --color "a2eeef" --description "New feature"
gh label create "refactor" --color "d4c5f9" --description "Code refactor without behaviour change"
gh label create "test" --color "fef2c0" --description "Test coverage / harness"
gh label create "chore" --color "fbca04" --description "Maintenance / tooling"
gh label create "docs" --color "0075ca" --description "Documentation"

# Epic labels — one per active epic
gh label create "epic:rde" --color "5319e7" --description "Rules Data Engine"
gh label create "epic:pp"  --color "5319e7" --description "Purchasable Powers unification"
gh label create "epic:dt"  --color "5319e7" --description "Downtime processing"
gh label create "epic:dts" --color "5319e7" --description "Downtime ST action improvements"
gh label create "epic:dtr" --color "5319e7" --description "Downtime roll resolution"
gh label create "epic:dtfc" --color "5319e7" --description "Downtime form calibration"
gh label create "epic:dtp"  --color "5319e7" --description "Downtime player delivery"
gh label create "epic:dtx"  --color "5319e7" --description "Downtime experience"
gh label create "epic:npcr" --color "5319e7" --description "NPC relationships"
gh label create "epic:ord"  --color "5319e7" --description "Ordeals tracking"
gh label create "epic:nav"  --color "5319e7" --description "Unified navigation"
gh label create "epic:city" --color "5319e7" --description "City refresh"

# Workflow / origin labels
gh label create "bmad-intake" --color "0e8a16" --description "Issue created via tm-gh-issue-create skill from chat"
gh label create "needs-triage" --color "d93f0b" --description "Awaiting triage / prioritisation"
gh label create "blocked" --color "b60205" --description "Blocked on external dependency"
```

Backfill labels onto already-created issues:
```sh
gh issue edit 4 --add-label "epic:rde,bmad-intake"
# ...etc
```

Skip any epic that's no longer active. Add new ones as new epics start.

## 4. Restart Claude Code

The commit-policy hook in `.claude/settings.json` is read at **session start**. If you had a Claude Code session open before pulling these changes, restart it (start a new session in this repo) so the hook engages.

Verify the hook is loaded by trying a no-op:
```sh
# In a Claude Code session, ask Claude to run a harmless git commit attempt on main:
git checkout main
# then ask Claude: "try to commit something"
# Expected: tool call blocked with the BLOCKED message from the hook.
git checkout Morningstar
```

If the block doesn't fire, the hook may not be wired — check `.claude/settings.json` is present (committed) and `.claude/hooks/check-branch-on-commit.sh` is executable (`ls -l` should show `-rwxr-xr-x`).

## 5. Test the end-to-end flow

Pick a small thing you want done. In a Claude Code session:

1. Describe it in chat: *"There's a bug where X happens and it should do Y. Code is around `<file>:<line>`."*
2. Ask: *"open an issue for this"*. Skill builds the body, asks confirmation, runs `gh issue create`. Note the issue number.
3. Later (could be next session): *"pick up issue N"*. Skill creates the branch (`<your-branch>/issue-N-slug`), switches to it, hands off to BMAD SM which spins up a story file under `specs/stories/`.
4. Work proceeds via the BMAD dev/QA cycle as normal. Commits land on the side branch. The commit hook warns each time so you can sanity-check the branch.
5. When done: *"open a PR for this branch into dev"*. Skill builds the PR body with `Closes #N` (derived from branch name), test plan from the story, and any ADR/runbook links it finds in commits.
6. PR review + merge → issue auto-closes via `Closes #N`.

## 6. The hard rules still apply

The commit hook enforces *one* of the project's hard rules (no commit on `main`). The others remain Claude's responsibility per `CLAUDE.md`:

- Never push to `origin` or merge to `main` without an explicit per-message instruction. A prior "push" or "merge to main" in a session does **not** carry forward.
- Always work on a working branch (`Morningstar` for Angelus, `Piatra` for Peter, or a side branch off either).
- Each merge to `main` triggers Netlify + Render auto-deploys (real money). Cadence is user-controlled.

These are wired into Claude's instructions and are reinforced (but not exhaustively enforced) by the hook. Treat them as binding.

## Troubleshooting

**`gh auth login` opens browser but never completes:** firewall/VPN may be intercepting the GitHub OAuth callback. Try the SSH path or paste-token mode (`gh auth login --with-token < token.txt`).

**Skill fires but no `gh` command runs:** check `gh auth status`. The skills abort early if not authenticated.

**Hook blocks commits I want to land on `main`:** you almost certainly want the side-branch path. If you really mean to commit on `main`, switch to `main` deliberately and use `--no-verify` (we don't recommend this — the hard rule is on the project, not the script).

**Hook warning fires on every commit and is noisy:** that's intentional. It's a one-line stderr note designed to make you (and Claude) consciously confirm the branch. If you want to silence it for known branches, edit `.claude/hooks/check-branch-on-commit.sh` and add a case.

**Skills don't appear in Claude's available list:** restart the Claude Code session. Skills are scanned at session start.
