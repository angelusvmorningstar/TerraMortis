// inherent-intentional: legacy bridge for parallel-write only
// Re-exports applyDerivedMerits from the client module so server-side tests
// can run the same code that ships to the browser.
// Removed after the final family migrates (ADR-001).
export { applyDerivedMerits, mciPoolTotal } from '../../../public/js/editor/mci.js';
