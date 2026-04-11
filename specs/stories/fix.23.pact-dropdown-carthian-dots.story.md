# Story fix.23: Pact Dropdown — Carthian Law Merits + Dot Display

## Status: done

## Story

**As an** ST,
**I want** the Pact dropdown to include Carthian Law merits and display clean dot counts,
**so that** all oath types are selectable and dot notation is readable.

## Background

Two independent bugs in the pact dropdown (`sheet.js`):

1. The filter for pact-eligible merits only included `type === 'Invictus Oath'` from the rules DB. Carthian Law merits (`type === 'Carthian Law'`) were silently excluded, so STs could not add Carthian Law pacts.

2. The dot count display in the dropdown was rendered with a repeated open-paren bug — the string concatenation produced `(●●(●●` instead of `(●●)`.

## Acceptance Criteria

1. Pact dropdown includes entries where `v.type === 'Invictus Oath' || v.type === 'Carthian Law'`
2. Dot display renders correctly as `(●●)` — no repeated open-paren

## Files Changed

- `public/js/editor/sheet.js` — filter condition and string split at dot display

## Dev Notes

Both bugs were in the same short inline expression. Fixed in a single edit.

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-11 | 1.0 | Implemented | Claude (SM) |
