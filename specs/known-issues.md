# Known Issues

Tracked issues to address in future stories. Not blocking current work.

## Admin Character Sheet — Edit View

1. **No pronouns edit option** — Pronouns field is displayed in view mode but there is no input to edit it. Should be a text field in the identity section.

2. **Attributes section overflows column** — In edit view, the attributes section expands past the right edge of its container. The right side is clipped and inaccessible.

3. **Priority dropdowns not mutually exclusive** — Attribute priority selectors (Primary/Secondary/Tertiary) allow the same value on all three groups. Same issue with skill priority selectors. Should enforce that each value is used exactly once.

## CSV Export — Future Enhancements

4. **Blood Stats pool breakdown** — Currently shows `Pool: 8` (numeric only). Desired: show attribute + skill + discipline names with calculated total in parentheses, e.g. `Presence + Intimidation + Nightmare (8)`. Requires either a `pool_string` field on each power (data migration) or a power-to-pool lookup table mapping VtR 2e discipline powers to their canonical pool formulas.

## Future Features — Not Needed for Downtime Launch

5. **Attendance and XP Tracker** — Per-session tracking of player attendance with XP awards: 1 XP for attending (Game), 1 for costume/immersion, 1 for downtime submission. Should write to character `xp_log.earned.game`. Needs per-month view with columns matching the existing Excel tracker (Paid, Game, DT, Extra, Feed). Could replace/expand Story 3.3 (Session Log). Reference: Excel attendance tracker screenshot.

6. **Finance Tracker** — Monthly income tracking by payment method (PayID, PayPal, Cash, Exiles). Per-month revenue, expenses by category (OfficeW, Bags, etc.), running totals, expected vs actual diff. Linked to attendance tracker (payment status per player per month). Reference: Excel finance tracker screenshot. Needs its own collection in MongoDB.
