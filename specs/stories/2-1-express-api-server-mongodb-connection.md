# Story 2.1: Express API Server + MongoDB Connection

**Status:** ready-for-dev

## Story

As an ST,
I want a shared API server backed by MongoDB,
so that all three STs can access and modify the same character data from any device.

## Acceptance Criteria

1. Express server starts, connects to MongoDB Atlas, and responds to a health check endpoint
2. MongoDB connection uses environment variables (no credentials in code)
3. Server runs with ES modules (`"type": "module"` in package.json)
4. CORS is configured to allow requests from Netlify-hosted frontend and `localhost` for development
5. Server directory structure matches the architecture doc (`server/index.js`, `server/db.js`, `server/config.js`, `server/routes/`, `server/middleware/`)
6. A `/api/health` endpoint returns `{ "status": "ok", "db": "connected" }` when MongoDB is reachable
7. `.env.example` documents all required environment variables
8. `.env` is added to `.gitignore`

## Tasks / Subtasks

- [ ] Task 1: Server project setup (AC: #3, #5, #7, #8)
  - [ ] Create `server/package.json` with `"type": "module"` and dependencies
  - [ ] Create `.env.example` with `MONGODB_URI`, `PORT`, `NODE_ENV`, `CORS_ORIGIN`
  - [ ] Add `.env` to root `.gitignore` (currently missing)
  - [ ] Create `server/config.js` — load env vars via dotenv, export config object
- [ ] Task 2: MongoDB connection (AC: #1, #2, #6)
  - [ ] Create `server/db.js` — `MongoClient` connection with retry, export `getDb()` and collection accessors
  - [ ] Connection string from `config.js`, never hardcoded
  - [ ] Graceful shutdown: close MongoDB connection on `SIGINT`/`SIGTERM`
- [ ] Task 3: Express app setup (AC: #1, #4, #6)
  - [ ] Create `server/index.js` — Express app, CORS middleware, JSON body parser, route mounting, listen
  - [ ] CORS: allow origins from `config.CORS_ORIGIN` (comma-separated list for dev + prod)
  - [ ] `GET /api/health` route returning DB connection status
- [ ] Task 4: Directory scaffolding (AC: #5)
  - [ ] Create empty `server/routes/` directory with a placeholder comment in `index.js` for future route files
  - [ ] Create empty `server/middleware/` directory (auth.js comes in story 2.2)
- [ ] Task 5: Verify end-to-end (AC: #1, #6)
  - [ ] `cd server && npm install && npm run dev` starts the server
  - [ ] `curl http://localhost:3000/api/health` returns `{ "status": "ok", "db": "connected" }`
  - [ ] Server logs connection success/failure to console

## Dev Notes

### Architecture Compliance

**Source:** `specs/architecture-st-admin.md`

This story creates the `server/` directory — the Express API that all frontend modules will talk to via `public/js/data/api.js` (created in story 2.3). The API is a **thin CRUD persistence pipe**. Zero business logic server-side. All VtR 2e rules stay in browser JS.

### Target File Structure

```
server/
├── package.json          # NEW — server dependencies, "type": "module"
├── index.js              # NEW — Express app setup, middleware, listen
├── db.js                 # NEW — MongoDB connection, getDb(), collection accessors
├── config.js             # NEW — env var loading, config export
├── routes/               # NEW — empty, populated in stories 2.3+
└── middleware/            # NEW — empty, auth.js added in story 2.2
```

Root additions:
```
.env.example              # NEW — environment variable template
.gitignore                # EDIT — add .env
```

### Package Versions (verified 2026-03-31)

| Package | Version | Import pattern |
|---|---|---|
| express | ^5.2.1 | `import express from 'express'` |
| mongodb | ^7.1.0 | `import { MongoClient } from 'mongodb'` |
| dotenv | ^17.3.1 | `import 'dotenv/config'` |
| cors | ^2.8.6 | `import cors from 'cors'` |

**Node.js requirement:** 20.19.0+ (MongoDB driver v7 requirement).

All packages work cleanly with ES modules and `"type": "module"`. No workarounds needed.

### ES Module Gotchas

- File extensions **required** in all relative imports: `import { getDb } from './db.js'`
- Use default imports for CommonJS packages: `import express from 'express'` (not `import { Router } from 'express'` — destructure after)
- No `require()` in ES module files
- `__dirname` is not available — use `import.meta.url` if needed (unlikely for this story)

### MongoDB Connection Pattern

```js
// server/db.js — reference pattern
import { MongoClient } from 'mongodb';
import { config } from './config.js';

let client;
let db;

export async function connectDb() {
  client = new MongoClient(config.MONGODB_URI);
  await client.connect();
  db = client.db(); // uses DB name from connection string
}

export function getDb() {
  if (!db) throw new Error('Database not connected');
  return db;
}

export function getCollection(name) {
  return getDb().collection(name);
}

export async function closeDb() {
  if (client) await client.close();
}
```

### Config Pattern

```js
// server/config.js — reference pattern
import 'dotenv/config';

export const config = {
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/tm_suite',
  PORT: parseInt(process.env.PORT, 10) || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:8080',
};
```

### .env.example Content

```
# MongoDB Atlas connection string
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/tm_suite

# Server port
PORT=3000

# Environment
NODE_ENV=development

# Allowed CORS origins (comma-separated)
CORS_ORIGIN=http://localhost:8080,http://localhost:3000
```

### Coding Standards (from architecture)

- British English in all comments and error messages
- `camelCase` functions, `kebab-case` filenames
- No file over 500 lines
- Comment the why, not the what
- Validate incoming requests at boundaries (not applicable yet — no data routes)

### What This Story Does NOT Do

- No CRUD routes for characters (story 2.3)
- No Discord auth (story 2.2)
- No frontend changes (story 2.4)
- No data migration (story 2.3)
- No Netlify deployment config (story 2.6)

This story is purely: server starts, connects to MongoDB, health check works.

### Existing Codebase Context

- Root `package.json` exists with `"type": "commonjs"` and devDependencies for Playwright. **Do not modify** — the server has its own `package.json`.
- `.gitignore` already excludes `node_modules/` but does **not** exclude `.env` — this must be added.
- No `server/` directory exists yet — create from scratch.
- No `netlify.toml` exists yet — not this story's concern.

### Testing

No automated test framework for the server. Manual verification:

1. Start server: `cd server && npm run dev`
2. Hit health check: `curl http://localhost:3000/api/health`
3. Verify response: `{ "status": "ok", "db": "connected" }`
4. Kill server, verify graceful shutdown (no hanging connections)
5. Start server with invalid `MONGODB_URI`, verify error logged and health returns `{ "status": "error", "db": "disconnected" }`

### References

- [Source: specs/architecture-st-admin.md — Core Architectural Decisions, Data Architecture, Server-Side Code Conventions]
- [Source: specs/architecture/coding-standards.md — all naming and style conventions]
- [Source: specs/prd/epic-restructure-proposal.md — Epic 2: Backend Foundation, Story 2.1]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
