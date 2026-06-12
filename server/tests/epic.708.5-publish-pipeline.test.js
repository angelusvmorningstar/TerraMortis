/**
 * Contract tests — CYCLE epic #708, story 5: Publish Pipeline
 * Static-grep assertions over server/routes/downtime.js and
 * public/js/admin/cycle-views.js.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';

const DOWNTIME    = fs.readFileSync('../server/routes/downtime.js', 'utf8');
const CYCLE_VIEWS = fs.readFileSync('../public/js/admin/cycle-views.js', 'utf8');

describe('epic.708.5 — downtime.js: POST /:id/publish endpoint', () => {
  it('registers a POST handler on cyclesRouter', () => {
    expect(DOWNTIME).toContain('cyclesRouter.post');
  });

  it('routes to /publish path', () => {
    expect(DOWNTIME).toContain("'/:id/publish'");
  });

  it('is ST-only via requireRole', () => {
    const publishBlock = DOWNTIME.slice(DOWNTIME.indexOf("'/:id/publish'"));
    expect(publishBlock.slice(0, 60)).toContain('requireRole');
  });

  it('sets published_outcome from outcome_text', () => {
    expect(DOWNTIME).toContain('published_outcome');
  });

  it('sets outcome_visibility to published', () => {
    expect(DOWNTIME).toContain('outcome_visibility');
    expect(DOWNTIME).toContain("'published'");
  });

  it('sets published_at timestamp', () => {
    expect(DOWNTIME).toContain('published_at');
  });

  it('returns published and skipped counts', () => {
    expect(DOWNTIME).toContain('{ published, skipped }');
  });

  it('skips already-published submissions', () => {
    expect(DOWNTIME).toContain('skipped++');
  });
});

describe('epic.708.5 — cycle-views.js: Publish Reports button', () => {
  it('renders a Publish Reports button per cycle row', () => {
    expect(CYCLE_VIEWS).toContain('Publish Reports');
  });

  it('calls the /publish endpoint', () => {
    expect(CYCLE_VIEWS).toContain('/publish');
  });

  it('displays pluralised publish count feedback', () => {
    expect(CYCLE_VIEWS).toContain("'s') + ' published.'");
  });

  it('shows fallback message when no reports found', () => {
    expect(CYCLE_VIEWS).toContain('No compiled reports found.');
  });

  it('disables button during in-flight request', () => {
    expect(CYCLE_VIEWS).toContain('publishBtn.disabled = true');
  });
});
