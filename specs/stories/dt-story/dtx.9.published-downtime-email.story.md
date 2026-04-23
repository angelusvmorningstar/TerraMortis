# Story DTX.9: Automated Downtime Published Email

Status: done

## Story

As a Storyteller publishing a character's downtime results,
I want the system to automatically send the player an email notification,
so that players are promptly informed their results are available and reminded how to perform their feeding roll at the next game.

## Acceptance Criteria

1. When `st_review.outcome_visibility` transitions to `'published'` in the PUT `/api/downtime_submissions/:id` endpoint, an email is sent to the linked player's email address.
2. The email is only sent on the transition to `'published'` — not on every PUT, and not if the field was already `'published'` before the update.
3. The email subject is: `Your downtime results are ready — [Character Display Name]`.
4. The email body contains:
   - A brief intro: the player's character name, the cycle label (fetched from `downtime_cycles`), and a link to the player portal.
   - The full published narrative (`st_review.outcome_text`) rendered as readable plain text (markdown stripped to plain text for email body; HTML version may use basic formatting).
   - A standard "Feeding Roll Reminder" block explaining how to roll feeding at game start (see Dev Notes for exact copy).
5. If the player has no email address on file (`players.email` is null/empty), the publish proceeds normally and the email step is silently skipped — no error is thrown.
6. If the email send fails (SMTP error, network issue), the failure is logged server-side but the PUT response is not affected — the publish always succeeds regardless of email outcome.
7. Email credentials are configured via environment variables (`EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`). If any required variable is absent, the email step is skipped silently.
8. The email sends from `terramortislarp@gmail.com` in production (configured via `EMAIL_FROM` env var).

## Tasks / Subtasks

- [ ] Task 1: Add nodemailer dependency (AC: 7, 8)
  - [ ] In `server/`, run `npm install nodemailer`.
  - [ ] Add `nodemailer` to `server/package.json` dependencies.

- [ ] Task 2: Create email helper `server/helpers/email.js` (AC: 5, 6, 7, 8)
  - [ ] Create `server/helpers/email.js` as an ES module.
  - [ ] Export `createTransporter()` — creates a nodemailer transporter from env vars (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`). Returns `null` if any var is missing.
  - [ ] Export `sendDowntimePublishedEmail({ toEmail, charName, cycleLabel, outcomeText, portalUrl })` — builds subject + body (plain text + HTML), calls `transporter.sendMail`. Wraps in try/catch; logs failure, never throws.
  - [ ] Plain-text body: strip markdown (replace `##` headings with all-caps + newline, strip `*`, etc.) — no external dep needed, simple regex.
  - [ ] HTML body: wrap headings in `<h3>`, wrap paragraphs in `<p>`, use inline styles matching the TM parchment aesthetic (dark bg optional — keep it simple, most clients render plain HTML well).
  - [ ] Include the feeding roll reminder block (see Dev Notes) as a distinct section at the bottom of both plain-text and HTML versions.

- [ ] Task 3: Detect publish transition in `server/routes/downtime.js` PUT handler (AC: 1, 2)
  - [ ] In `submissionsRouter.put('/:id', ...)`, after the existing ownership/deadline checks and before the `findOneAndUpdate`, load the existing document to read its current `st_review.outcome_visibility`.
  - [ ] After the `findOneAndUpdate` succeeds, check: `wasNotPublished && req.body['st_review.outcome_visibility'] === 'published'` (or detect from the `updates` object using dot-notation key). If this is a publish transition, trigger email (Task 4).
  - [ ] Note: `st_review` fields are stripped from player requests earlier in the handler — only ST requests reach this point with `st_review` fields. The transition check only needs to run when `st_review.outcome_visibility` is in the update.

- [ ] Task 4: Look up player email and send (AC: 1, 3, 4, 5, 6)
  - [ ] After confirmed publish transition: load the submission's `character_id`, fetch the character from `characters` collection to get `character.player` (Discord username / player identifier).
  - [ ] Fetch the player record from `players` collection where `discord_username` (or the relevant join field — see Dev Notes) matches. Extract `player.email`.
  - [ ] Fetch the cycle label from `downtime_cycles` using `submission.cycle_id`.
  - [ ] Call `sendDowntimePublishedEmail(...)` with the assembled data. Fire-and-forget (do not await in the response path — use `.catch(err => console.error(...))` to avoid blocking).

- [ ] Task 5: Add env vars to server `.env.example` / documentation (AC: 7, 8)
  - [ ] Add to `server/.env` (local) and document in any `.env.example` or README: `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`.
  - [ ] For Gmail: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`. `SMTP_USER` = Gmail address, `SMTP_PASS` = Google App Password (not the account password — requires 2FA enabled on the Google account).

## Dev Notes

### No existing email infrastructure

The project has zero email dependencies. nodemailer is the standard Node.js choice — lightweight, no account required beyond an SMTP server, works with Gmail App Passwords.

### Gmail App Password setup (one-time, done by ST admin)

1. Enable 2-Step Verification on `terramortislarp@gmail.com`
2. Go to Google Account → Security → App Passwords
3. Generate an app password for "Mail" / "Other (TM Suite)"
4. Set `SMTP_PASS` to the generated 16-character password
5. Set `SMTP_USER=terramortislarp@gmail.com`

### Player email join path

```
submission.character_id
  → characters collection: find { _id: character_id }, get character.player
  → players collection: find { discord_username: character.player } (or discord_id if stored)
  → players.email
```

The exact join field needs to be verified against the live players collection. The `players` route at `server/routes/players.js` shows players have `discord_username`, `discord_id`, and `email` fields. The character `player` field stores the player's Discord username or display name — confirm the join key matches what's actually stored.

If the join is ambiguous, fall back to: ST looks up email manually (AC 5 covers missing email gracefully).

### Publish transition detection

In the PUT handler, `req.body` contains dot-notation keys (e.g., `'st_review.outcome_visibility': 'published'`). Detection:

```js
const isPublishTransition =
  req.body['st_review.outcome_visibility'] === 'published' &&
  existingDoc?.st_review?.outcome_visibility !== 'published';
```

Load `existingDoc` with a `findOne` before the update. This adds one DB read per PUT but only for ST requests that touch `st_review` — acceptable cost.

### Feeding Roll Reminder copy

Include verbatim in the email (both plain-text and HTML):

```
--- FEEDING ROLL REMINDER ---

At the start of the next game, you will roll your feeding pool.

Your feeding pool was submitted as: [feeding method from submission responses._feed_method, or "your declared method" if missing]

Steps:
1. Roll your pool at check-in (STs will prompt you).
2. Each success finds one vessel — the ST will assign vitae values.
3. Allocate your safe vitae across your vessels as you choose.
4. Any risky or critical vitae carries risk — discuss with an ST before taking it.

If you have any questions about your pool or results, speak to an ST before game begins.
```

The `_feed_method` value is in `submission.responses._feed_method`. Map it to a human-readable label using the same `FEED_METHODS` mapping from `public/js/player/downtime-data.js` — duplicate the mapping in the email helper or import a shared constants file.

### Portal URL

`portalUrl` should be the Netlify URL: `https://terramortissuite.netlify.app` — hardcode as a fallback, or expose via env var `PORTAL_URL`.

### Fire-and-forget pattern

Email must never block the HTTP response:

```js
// After findOneAndUpdate succeeds:
if (isPublishTransition) {
  sendDowntimePublishedEmail({ ... }).catch(err =>
    console.error('[email] Failed to send downtime published email:', err.message)
  );
}
```

### Key files

- `server/helpers/email.js` — new file (email helper)
- `server/routes/downtime.js` — PUT `/api/downtime_submissions/:id` handler, ~line 102
- `server/package.json` — add nodemailer dependency
- `server/.env` — add SMTP env vars (local only, never commit)

### Schema note

No schema changes needed. `st_review.outcome_visibility` already exists with `enum: ['draft', 'ready', 'published']`. The email is triggered by the application layer, not the schema.

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

### File List
