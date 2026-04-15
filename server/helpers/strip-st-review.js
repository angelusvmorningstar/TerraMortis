// Removes st_review data from downtime submissions before sending to players.
// Published outcome text is promoted to a top-level field so player code
// never needs to know about st_review at all.
// Also scrubs internal ST fields from resolved action arrays.

const INTERNAL_ACTION_KEYS = ['st_note', 'notes_thread', 'response_author', 'response_status'];

function scrubResolvedArray(arr) {
  if (!Array.isArray(arr)) return;
  arr.forEach(entry => {
    if (!entry) return;
    INTERNAL_ACTION_KEYS.forEach(k => { delete entry[k]; });
  });
}

export function stripStReview(submission) {
  if (submission.st_review) {
    const { outcome_text, outcome_visibility } = submission.st_review;
    if (outcome_visibility === 'published') {
      submission.published_outcome = outcome_text;
    }
    delete submission.st_review;
  }

  scrubResolvedArray(submission.projects_resolved);
  scrubResolvedArray(submission.merit_actions_resolved);

  return submission;
}
