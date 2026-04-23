# Story EPA.1: Fix status.city Schema Validation Error

Status: done

## Story

**As an** ST editing a character's status in the admin view,
**I want** saving status fields to succeed without a validation error,
**so that** I can update city status without workarounds or data loss.

## Background

Live game on 2026-04-18 produced this console error when saving a character's status from the ST admin view:

```
api.js:27 API PUT /api/characters/69d73ea49162ece35897a484 validation errors: [
  {
    "path": "(root)",
    "message": "must NOT have additional properties",
    "property": "status.city"
  }
]
```

The character schema at `server/schemas/character.schema.js` defines `status.city` at line 96–100 — it IS in the schema. The error therefore has a different root cause that must be investigated before writing any code.

**Likely causes to investigate in order:**

1. The deployed Render instance has not restarted since the schema was last updated — the running process has a stale schema in memory. Check when `status.city` was added vs the last Render deploy.
2. The client is sending a field outside the `status` object that is not in the schema (e.g. a top-level `status_city` field, or a legacy field).
3. The `characterPartialSchema` (the PUT schema) is being derived incorrectly and stripping `status.city`.
4. There is a second schema file that was loaded instead of the canonical one.

## Acceptance Criteria

1. Root cause is identified and documented in Dev Agent Record.
2. Saving `status.city` from the ST admin character editor succeeds with HTTP 200.
3. No regression to other character fields — a full character PUT round-trip passes validation.
4. If the fix requires a schema change, the change is minimal and targeted — no speculative additions.
5. If the fix is a Render restart (stale deploy), document this and confirm it resolves the issue without code changes.

## Tasks / Subtasks

- [ ] Investigate root cause (AC: #1)
  - [ ] Read `server/schemas/character.schema.js` and confirm `status.city` definition at lines 93–101
  - [ ] Check `server/middleware/validateCharacter.js` — confirm which schema is used for PUT vs POST
  - [ ] Check `server/routes/characters.js` — confirm `validateCharacterPartial` is applied to PUT, not `validateCharacter`
  - [ ] Search client-side code for where the status save body is constructed — confirm no extra fields are included
  - [ ] Check git log for when `status.city` was added to schema vs last deploy to Render
- [ ] Apply fix (AC: #2, #3)
  - [ ] If schema gap: add missing field with correct type/constraints
  - [ ] If client sends extra field: strip it before PUT or add to schema
  - [ ] If stale deploy: document resolution, no code change required
- [ ] Verify (AC: #4, #5)
  - [ ] Manually test saving status fields from admin character editor
  - [ ] Confirm no other fields produce validation errors on PUT

## Dev Notes

### Key Files

- `server/schemas/character.schema.js` — `status` object definition at lines 93–101. Has `additionalProperties: false`.
- `server/middleware/validateCharacter.js` — applies schema validation middleware. Confirm it uses `characterPartialSchema` for PUT (partial updates) not the full schema.
- `server/routes/characters.js` — character PUT route uses `validateCharacterPartial` middleware, which strips required fields but keeps all property definitions and `additionalProperties: false`.
- Client-side status editor — likely in `public/js/editor/identity.js` or `public/js/admin/players-view.js` — check what fields are included in the PUT body.

### Schema Definition (confirmed present)

```js
// server/schemas/character.schema.js lines 93–101
status: {
  type: 'object',
  properties: {
    city:     { type: 'integer', minimum: 0, maximum: 10 },
    clan:     { type: 'integer', minimum: 0, maximum: 5 },
    covenant: { type: 'integer', minimum: 0, maximum: 5 }
  },
  additionalProperties: false
},
```

### Validation Error Pattern

`additionalProperties: false` at any nesting level will reject unrecognised fields. If the client sends `{ status: { city: 2, someOtherField: 1 } }`, the `someOtherField` will trigger this error even though `city` is valid.

### References

- [Source: specs/architecture/system-map.md#Section 9] — Known validation issues
- [Source: server/schemas/character.schema.js#lines 93-101]
- [Source: server/middleware/validateCharacter.js]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
