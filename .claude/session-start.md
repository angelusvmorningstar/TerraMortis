# TM Suite — Session Start Playbook

Run these in order. Keep output to ~6-10 lines. End on a concrete next action.

## 1. Branch sync (always first)
- `git branch --show-current` and `git status -sb`
- `git log HEAD..origin/dev --oneline` — if dev is ahead, surface it and
  recommend `git merge dev` BEFORE any new work (per CLAUDE.md).
- Never suggest pushing or merging to main.

## 2. Where we left off
- Read the newest `specs/investigations/*session-handover*.md` (by date).
  Summarise: what shipped, what's still open, any "needs a real Playwright run".

## 3. Live work queue
- `gh issue list --state open --limit 15`
- Highlight `bmad-intake` (ready to pick up) and `bug` items.
- Cross-check `specs/stories/sprint-status.yaml` for anything `review` /
  `in-progress` (note: this file lags the issues).

## 4. Recommend next step via the BMAD loop
- New issue → `tm-gh-issue-pickup` then `bmad-create-story` (SM).
- Story file ready → `bmad-dev-story`.
- After dev-story → ALWAYS suggest `bmad-agent-qa`, never PR.
- QA passed → `tm-gh-pr-for-branch`.

## 5. Guardrails (state only if relevant)
- Data/DB writes, migrations, seed runs → Peter, not Claude.
- Tests: run only the spec files for the changed area; capture to file, check $?.
- Angelus owns scope; Peter advises.

End with: the single most actionable item (usually the top bmad-intake issue
or the unfinished item from the handover), framed as a direct next step — not
"what would you like to work on?"
