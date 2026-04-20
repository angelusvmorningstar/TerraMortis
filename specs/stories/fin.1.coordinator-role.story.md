---
id: fin.1
epic: finance-coordinator
status: ready-for-dev
priority: high
---

# Story FIN-1: Coordinator Role

As an ST,
I want to assign a `coordinator` role to a player account,
So that Lyn and future non-ST admins can access financial and check-in tools without ST privileges.

---

## Context

Lyn handles door check-in and fee collection. She has a Discord account and her player record already exists in the system — she just needs a `coordinator` role. This role gates access to the check-in and finance tabs in the game app, without exposing any ST storytelling tools.

Currently allowed roles: `st`, `player`. Adding `coordinator` as a third role.

---

## Acceptance Criteria

**Role definition**

**Given** the players collection schema
**When** a player record has `role: 'coordinator'`
**Then** the server middleware recognises it as a valid, non-ST privileged role

**Auth redirect**

**Given** a coordinator logs in via Discord OAuth
**When** the auth callback runs
**Then** they are redirected to the game app (`index.html`), not `admin.html`

**Game app visibility**

**Given** a coordinator is authenticated in the game app
**When** the nav renders
**Then** Check-In and Finance tabs are visible
**And** all ST-only tabs (Territory, Tracker, Combat, etc.) remain hidden unless the user is ST

**Admin.html access blocked**

**Given** a coordinator attempts to access `admin.html`
**When** the auth middleware runs
**Then** they receive a 403 or are redirected away — coordinator role does not grant admin access

**Lyn's record updated**

**Given** Lyn's existing player record in the `players` collection
**When** this story ships
**Then** her `role` field is updated to `coordinator`

---

## Implementation Notes

### Server

**`server/schemas/player.schema.js`** — add `coordinator` to the role enum:
```js
role: { type: 'string', enum: ['st', 'player', 'coordinator'] }
```

**`server/middleware/auth.js`** — add coordinator check:
```js
export function isCoordinator(req, res, next) {
  if (req.user?.role === 'coordinator' || req.user?.role === 'st') return next();
  return res.status(403).json({ error: 'Coordinator access required' });
}
```

**`server/routes/auth.js`** — update redirect logic:
```js
// After successful OAuth
const role = player.role;
if (role === 'st') return res.redirect('/admin.html');
if (role === 'coordinator') return res.redirect('/index.html');
return res.redirect('/player.html');
```

### Game app client

**`public/js/app.js`** — the game app already checks `role === 'st'` to show ST tabs. Extend to `role === 'st' || role === 'coordinator'` for check-in and finance tabs only. All other ST-gated tabs remain `role === 'st'` only.

### Lyn's record

Update via MongoDB directly or a one-line migration:
```js
db.players.updateOne({ discord_id: '<Lyn_ID>' }, { $set: { role: 'coordinator' } })
```
Lyn's Discord ID is already in the system.

---

## Files Expected to Change

- `server/schemas/player.schema.js`
- `server/middleware/auth.js`
- `server/routes/auth.js`
- `public/js/app.js`

## Dev Agent Record
### Agent Model Used
### Completion Notes
### File List
