# DT AI Agent Vision
*Source: Yusuf (PK), 2026-04-15*

## Overview

A vision for automating DT processing using a dedicated AI agent that interfaces with the TM Suite via API.

---

## DT Input

- The UI interface is the primary collection point for DT submissions going forward
- Ensure it captures all required actions and details
- Key advantage: actions are directly linked to characters (no vague lookup)

---

## DT Reporting

- Player DT summaries delivered through the UI
- Requires a well-structured **DT Report** schema that captures all info to return to players
- Schema should be defined and enforced

---

## API Endpoints for DT

New endpoints needed on the Express API:

- **Auth:** `X-API-KEY` header (not Discord OAuth) — allows non-browser AI sessions to authenticate
- **GET** character summaries
- **GET** downtime submissions
- **POST** DT reports (AI writes results back to DB, players see via UI)

Rationale: Discord OAuth requires interactive browser flow; API key allows headless AI agent sessions.

---

## Separate AI Agent Project

A separate folder/repo (name TBD) on the machine with:

- `CLAUDE.md` — explains project structure, where everything is, API endpoints, DB connection
- Per-player folders
- `HISTORY.md` — session history
- `ASPIRATION.md` — campaign goals / ST intentions
- `PROJECT_HISTORY.md` — chronicle of events
- Consistent framework/arrangement documented in CLAUDE.md

---

## AI Agent Capabilities (in the separate project)

Tooled up with:
- API access (via X-API-KEY endpoints above) — OR direct MongoDB connection string
- Recipes/runbooks for standard ST exercises:
  - Investigation and summary (the "red string" exercise)
  - Roll resolution
  - Outcome calculation
- Workflow:
  1. Pull character info and DT submissions from DB
  2. Build local MD files to track investigation threads
  3. Run investigation/summary logic
  4. Implement rolls and outcomes
  5. Update DB via API POST
  6. Reports sent back to players via API → visible in player UI

---

## Key Design Decisions

- API key auth separates AI agent access from human ST access (Discord OAuth stays for ST UI)
- Local MD files in the separate project act as working memory between AI sessions
- The AI agent is a different Claude Code session — TM Suite is the data layer, not the agent's home

---

## Next Steps (when ready to build)

1. Define DT Report schema
2. Add `X-API-KEY` auth middleware to Express API
3. Add GET endpoints for characters + submissions
4. Add POST endpoint for DT reports
5. Create the separate agent project with CLAUDE.md framework
6. Develop and document ST processing recipes

---

*Reference document — architectural vision, not an active sprint item*
