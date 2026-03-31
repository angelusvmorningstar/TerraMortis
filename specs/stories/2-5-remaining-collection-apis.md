# Story 2.5: Remaining Collection APIs

**Status:** In Progress

**Epic:** 2 — Backend Foundation

**Priority:** Standard

## Story

**As a** Storyteller,
**I want** CRUD API endpoints for territories, tracker state, session logs, downtime cycles, and downtime submissions,
**so that** all six MongoDB collections are accessible through the API and ready for the admin app domains to consume.

## Context

Story 2.3 established the characters CRUD pattern. This story replicates that pattern for the remaining five collections defined in the architecture doc (`specs/architecture-st-admin.md`).

## Acceptance Criteria

1. `GET /api/territories` returns all territory documents.
2. `PUT /api/territories/:id` updates a territory by ID and returns the updated document.
3. `GET /api/tracker_state/:character_id` returns the tracker state for a character (matched by `character_id` field, not `_id`).
4. `PUT /api/tracker_state/:character_id` upserts tracker state for a character and returns the document.
5. `POST /api/session_logs` creates a session log entry (requires `session_date` field) and returns it with 201.
6. `GET /api/session_logs` returns all session logs; when `?session_date=YYYY-MM-DD` query param is provided, filters to that date.
7. `GET /api/downtime_cycles` returns all cycles.
8. `POST /api/downtime_cycles` creates a new cycle and returns it with 201.
9. `GET /api/downtime_submissions` returns all submissions; when `?cycle_id=<id>` query param is provided, filters to that cycle.
10. `PUT /api/downtime_submissions/:id` updates a submission by ID and returns the updated document.
11. All endpoints require valid ST authentication (existing `requireAuth` middleware).
12. All endpoints follow the established error response format (`{ error, message }` with appropriate HTTP status codes).

## Tasks

- [ ] Create `server/routes/territories.js` (AC 1-2)
- [ ] Create `server/routes/tracker.js` (AC 3-4)
- [ ] Create `server/routes/sessions.js` (AC 5-6)
- [ ] Create `server/routes/downtime.js` (AC 7-10)
- [ ] Wire all routes into `server/index.js` with `requireAuth` (AC 11)
- [ ] Syntax-check all files and verify server boots

## Dev Notes

### Pattern Reference
Follow `server/routes/characters.js` exactly — same `parseId()` helper, same `getCollection()` usage, same error format.

### Route-to-File Mapping (from architecture doc)
| Route prefix | File | Collection(s) |
|---|---|---|
| `/api/territories` | `routes/territories.js` | `territories` |
| `/api/tracker_state` | `routes/tracker.js` | `tracker_state` |
| `/api/session_logs` | `routes/sessions.js` | `session_logs` |
| `/api/downtime_cycles` | `routes/downtime.js` | `downtime_cycles` |
| `/api/downtime_submissions` | `routes/downtime.js` | `downtime_submissions` |

### Special Behaviours
- **tracker.js**: Keyed by `character_id` field (not `_id`). PUT is an upsert — creates if not found.
- **sessions.js**: GET filters by `session_date` query param (exact match on date string).
- **downtime.js**: Two collections in one route file. GET submissions filters by `cycle_id` query param.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-03-31 | 0.1 | Initial draft | Claude (Dev) |
