/* Game app — downtime report view.
   Shows the most recent published DT narrative for the active character. */

import { renderLatestReport } from '../tabs/story-tab.js';

export async function loadDtLookup(el, char) {
  await renderLatestReport(el, char);
}
