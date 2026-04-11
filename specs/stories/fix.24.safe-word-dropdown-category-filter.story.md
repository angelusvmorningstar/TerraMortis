# Story fix.24: Safe Word Shared Merit Dropdown — Category Filter

## Status: done

## Story

**As an** ST,
**I want** the Oath of the Safe Word `shared_merit` dropdown to list all influence merits on the character's sheet,
**so that** I can select the merit to share with a partner.

## Background

The dropdown for `shared_merit` on a Safe Word pact was filtering via the rules API DB with `_db.type === 'Social'`. The API rules DB uses a different type taxonomy — influence merits (Allies, Resources, Contacts, etc.) are not reliably classified as `'Social'`. This caused the dropdown to show "No Social Merits on sheet" even when the character had multiple influence merits.

## Fix

Replace the unreliable rules-DB type lookup with a direct filter on the character's own `merits` array:

```js
const _sm = (c.merits || []).filter(m => m.category === 'influence')
```

This uses the schema's `category` field which is authoritative.

## Files Changed

- `public/js/editor/sheet.js` — Safe Word shared_merit select build

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-11 | 1.0 | Implemented | Claude (SM) |
