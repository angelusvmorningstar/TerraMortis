// Removes st_review data from downtime submissions before sending to players.
// Published outcome text is promoted to a top-level field so player code
// never needs to know about st_review at all.

export function stripStReview(submission) {
  if (!submission.st_review) return submission;

  const { outcome_text, outcome_visibility } = submission.st_review;

  if (outcome_visibility === 'published') {
    submission.published_outcome = outcome_text;
  }

  delete submission.st_review;
  return submission;
}
