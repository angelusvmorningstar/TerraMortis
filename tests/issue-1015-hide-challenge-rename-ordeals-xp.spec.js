// Smoke for issue #1015 —
//   1. MORE_APPS no longer contains a challenge entry (drives desktop
//      sidebar + phone More grid).
//   2. The phone bottom-nav ordeals entry is labelled 'XP' (id preserved).
//
// The player app requires Discord OAuth to render tabs, so these checks
// go against the delivered `js/app.js` source rather than driving the UI —
// same shape the parse-check guardrails use.

const { test, expect } = require('@playwright/test');

test('#1015 — MORE_APPS has no challenge entry', async ({ request }) => {
  const res = await request.get('/js/app.js');
  const src = await res.text();
  const start = src.indexOf('const MORE_APPS');
  expect(start).toBeGreaterThan(0);
  const end = src.indexOf('];', start);
  expect(end).toBeGreaterThan(start);
  const block = src.slice(start, end);
  expect(block).not.toMatch(/id:\s*['"]challenge['"]/);
});

test('#1015 — phone bottom-nav ordeals entry is labelled "XP"', async ({ request }) => {
  const res = await request.get('/js/app.js');
  const src = await res.text();
  // The phone bottom-nav array is the first array containing an ordeals
  // entry with a `goTab: 'ordeals'` field (MORE_APPS uses `section:`, not
  // `goTab:`). Locate that specific entry line.
  const re = /\{\s*id:\s*['"]ordeals['"][^}]*goTab:\s*['"]ordeals['"][^}]*\}/;
  const m = src.match(re);
  expect(m, 'phone bottom-nav ordeals entry not found').not.toBeNull();
  expect(m[0]).toMatch(/label:\s*['"]XP['"]/);
  expect(m[0]).not.toMatch(/label:\s*['"]Ordeals['"]/);
});

test('#1015 — challenge modal wiring is preserved (only the tile is hidden)', async ({ request }) => {
  // Guard rail: the click handler and modal function stay wired so future
  // programmatic uses continue to work. Only the surfaced tile is gone.
  const res = await request.get('/js/app.js');
  const src = await res.text();
  expect(src).toMatch(/openChallengeModal/);
  expect(src).toMatch(/if\s*\(\s*t\s*===?\s*['"]challenge['"]\s*\)/);
});
