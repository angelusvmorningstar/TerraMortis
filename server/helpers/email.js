/**
 * Email helper — nodemailer SMTP via env vars.
 *
 * Required env vars:
 *   EMAIL_FROM   — sender address, e.g. terramortislarp@gmail.com
 *   SMTP_HOST    — e.g. smtp.gmail.com
 *   SMTP_PORT    — e.g. 587
 *   SMTP_USER    — Gmail address
 *   SMTP_PASS    — Google App Password (not account password)
 *
 * If any required var is missing the helper no-ops silently.
 */

import nodemailer from 'nodemailer';

const FEED_METHOD_NAMES = {
  seduction:    'Seduction',
  stalking:     'Stalking',
  force:        'By Force',
  familiar:     'Familiar Face',
  intimidation: 'Intimidation',
  other:        'Other (custom)',
};

const PORTAL_URL = process.env.PORTAL_URL || 'https://terramortissuite.netlify.app';

function createTransporter() {
  const { EMAIL_FROM, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!EMAIL_FROM || !SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: false, // STARTTLS on port 587
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

/** Strip markdown to plain text (headings → ALL CAPS, strip *, #, etc.) */
function mdToPlain(md) {
  return (md || '')
    .replace(/^#{1,6}\s+(.+)$/gm, (_, t) => t.toUpperCase())
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

/** Convert markdown to minimal HTML for email clients. */
function mdToHtml(md) {
  const lines = (md || '').split('\n');
  const out = [];
  for (const line of lines) {
    const hMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (hMatch) {
      out.push(`<h3 style="color:#c8a84b;font-family:Georgia,serif;margin:16px 0 6px;">${hMatch[1]}</h3>`);
    } else if (line.trim()) {
      out.push(`<p style="margin:4px 0;line-height:1.6;">${line
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')}</p>`);
    } else {
      out.push('<br>');
    }
  }
  return out.join('\n');
}

function feedingReminderPlain(feedMethodId) {
  const method = FEED_METHOD_NAMES[feedMethodId] || feedMethodId || 'your declared method';
  return `
--- FEEDING ROLL REMINDER ---

At the start of the next game session, you will roll your feeding pool.

Your submitted feeding method: ${method}

Steps:
1. Roll your pool at check-in (STs will prompt you).
2. Each success finds one vessel — the ST will assign vitae values.
3. Allocate your safe vitae across your vessels as you choose.
4. Any risky or critical vitae carries risk — speak to an ST before taking it.

If you have questions about your pool or results, speak to an ST before game begins.

View your results at: ${PORTAL_URL}
`.trim();
}

function feedingReminderHtml(feedMethodId) {
  const method = FEED_METHOD_NAMES[feedMethodId] || feedMethodId || 'your declared method';
  return `
<hr style="border:none;border-top:1px solid #444;margin:24px 0;">
<h3 style="color:#c8a84b;font-family:Georgia,serif;margin:0 0 8px;">Feeding Roll Reminder</h3>
<p style="margin:4px 0;">At the start of the next game session, you will roll your feeding pool.</p>
<p style="margin:8px 0;"><strong>Your submitted feeding method:</strong> ${method}</p>
<ol style="padding-left:20px;line-height:1.8;">
  <li>Roll your pool at check-in — STs will prompt you.</li>
  <li>Each success finds one vessel. The ST will assign vitae values.</li>
  <li>Allocate your safe vitae across your vessels as you choose.</li>
  <li>Any risky or critical vitae carries risk — speak to an ST before taking it.</li>
</ol>
<p style="margin:12px 0;">If you have questions about your pool or results, speak to an ST before game begins.</p>
<p style="margin:12px 0;"><a href="${PORTAL_URL}" style="color:#c8a84b;">View your results at the player portal</a></p>
`.trim();
}

/**
 * Send the downtime-published notification to a player.
 * Never throws — failures are logged and swallowed.
 *
 * @param {object} opts
 * @param {string} opts.toEmail
 * @param {string} opts.charName
 * @param {string} opts.cycleLabel
 * @param {string} opts.outcomeText   — compiled markdown narrative
 * @param {string} [opts.feedMethodId] — _feed_method value from submission
 */
export async function sendDowntimePublishedEmail({ toEmail, charName, cycleLabel, outcomeText, feedMethodId }) {
  if (!toEmail) return;

  const transporter = createTransporter();
  if (!transporter) return;

  const subject = `Your downtime results are ready — ${charName}`;

  const plainParts = [
    `Your downtime results for ${charName} (${cycleLabel}) are now available.`,
    '',
    mdToPlain(outcomeText),
    '',
    feedingReminderPlain(feedMethodId),
  ];

  const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#1a1612;color:#d4c8a8;font-family:Georgia,serif;max-width:640px;margin:0 auto;padding:24px;">
  <h2 style="color:#c8a84b;font-family:Georgia,serif;border-bottom:1px solid #444;padding-bottom:8px;">
    Terra Mortis — Downtime Results
  </h2>
  <p style="margin:0 0 16px;">
    Your downtime results for <strong>${charName}</strong> (${cycleLabel}) are now available.
  </p>
  <div style="background:#111;border:1px solid #333;border-radius:4px;padding:16px;margin-bottom:16px;">
    ${mdToHtml(outcomeText)}
  </div>
  ${feedingReminderHtml(feedMethodId)}
  <hr style="border:none;border-top:1px solid #333;margin:24px 0;">
  <p style="font-size:11px;color:#666;">Terra Mortis LARP — this message was sent automatically.</p>
</body>
</html>`.trim();

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: toEmail,
      subject,
      text: plainParts.join('\n'),
      html: htmlBody,
    });
    console.log(`[email] Downtime published email sent to ${toEmail} for ${charName}`);
  } catch (err) {
    console.error(`[email] Failed to send to ${toEmail}:`, err.message);
  }
}
