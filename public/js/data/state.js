/* Shared mutable state — single source of truth for all modules */

const state = {
  chars: [],
  editIdx: -1,
  dirty: new Set(),
  editMode: false,
  openExpId: null
};

export default state;
