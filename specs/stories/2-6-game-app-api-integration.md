# Story 2.6: Game App API Integration

**Status:** In Progress

**Epic:** 2 — Backend Foundation

**Priority:** Standard

## Story

**As a** Storyteller using the game app at a live session,
**I want** the game app to load character data from the API on startup and fall back to locally cached data if the API is unreachable,
**so that** I always have up-to-date shared data when online, and the app still works at venues with unreliable WiFi.

## Context

The admin app (`admin.html`) already loads characters from the API via `api.js`. The game app (`index.html`) still loads from localStorage only. This story bridges that gap with a dual-mode loader and adds the Netlify deployment config so both apps can be deployed with an API proxy.

## Acceptance Criteria

1. `loader.js` exports a `loadCharsFromApi()` function that fetches characters from `/api/characters`, caches them to `localStorage` key `tm_chars_db`, and returns the array.
2. If the API call fails (network error, server down, auth error), `loadCharsFromApi()` falls back to localStorage cached data silently (no error shown to user).
3. The game app (`app.js`) calls `loadCharsFromApi()` during initialisation so it gets fresh API data when online.
4. If both API and localStorage are empty, the game app falls back to embedded `CHARS_DATA` (existing behaviour preserved).
5. `netlify.toml` exists with `publish = "public"` and a redirect rule proxying `/api/*` to the Render API server URL.
6. The admin app's data loading is unaffected (it already uses `api.js` directly).

## Tasks

- [x] Create story spec file
- [ ] Update `public/js/data/loader.js` with `loadCharsFromApi()` (AC 1-2, 4)
- [ ] Update `public/js/app.js` to call loader on init (AC 3)
- [ ] Create `netlify.toml` (AC 5)
- [ ] Syntax-check all modified files

## Dev Notes

### Dual-Mode Strategy (from architecture doc)
- **Admin app (API-first):** Always fetches from API. Requires network. Already works via `admin.js` → `api.js`.
- **Game app (cache-first):** Fetches from API on startup, caches to localStorage. Falls back to cached data if API is unreachable. ST syncs before game by opening the game app while online.

### loader.js Current State
Currently unused — nothing imports it. It has `loadChars()`, `saveChars()`, `getTrackerData()`, `setTrackerData()` functions. Will be rewritten to serve as the game app's data loading entry point.

### app.js Data Loading
Currently `loadAllData()` calls `loadDB()` from `export.js` which reads localStorage directly. Story 2.6 inserts an API fetch attempt before that localStorage read.

### Render API URL
The Render deployment URL will be configured as an environment variable in Netlify. For now, use a placeholder in `netlify.toml` that can be updated when Render is deployed.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-03-31 | 0.1 | Initial draft | Claude (Dev) |
