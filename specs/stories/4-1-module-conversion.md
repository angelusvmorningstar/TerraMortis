# Story 4.1: Downtime Module Conversion

**Status:** Done

**Epic:** 4 — Downtime System

**Priority:** Standard

## Story

**As a** Storyteller using the admin app,
**I want** the downtime helper converted from standalone global scripts to ES modules integrated into the admin app,
**so that** I can upload and process downtime CSVs directly from the admin interface with data stored in MongoDB.

## What Changed

### New ES modules (converted from Peter's `downtime_helper/js/`)
- `public/js/downtime/parser.js` — CSV tokeniser and submission parser (from `parser.js`)
- `public/js/downtime/db.js` — API-backed data access replacing IndexedDB (from `db.js`)
- `public/js/downtime/roller.js` — Dice roller with modal UI (from `roller.js`)

### Admin app integration
- `public/js/admin/downtime-views.js` — Downtime domain: CSV upload, cycle management, submission grid
- `public/admin.html` — Downtime domain placeholder replaced with container
- `public/js/admin.js` — Wired `initDowntimeView()` on domain switch
- `public/css/admin-layout.css` — Downtime domain styles

### API additions
- `server/routes/downtime.js` — Added POST endpoint for `downtime_submissions`

## Conversion Decisions

- **IndexedDB → API**: All persistence goes through `/api/downtime_cycles` and `/api/downtime_submissions`
- **Auth**: Handled by admin app's existing Discord OAuth (no separate auth module needed)
- **Roller**: Converted to accept `onSave` callback instead of reaching into `window._submissions`
- **Dashboard rendering**: Peter's 1050-line `dashboard.js` will be brought forward in Stories 4.2-4.6 as features are built

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-03-31 | 1.0 | Implemented | Claude (Dev) |
