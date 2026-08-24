/* rlv.7 (#1039 item 2) — persistent per-power modifier chips.
   Player curates free-text label+value mods; the app remembers them per
   (character, power) and restores their last on/off state next time the
   same power is loaded — the roller's own state.WP/MOD/ROTE toggle
   pattern (roll-v2.js), generated from a list instead of hardcoded (D5).
   Modelled directly on tabs/draft-persist.js's own versioned-payload,
   composite-key shape. */

const VERSION = 1;
const CAP = 10; // matches chgMod()'s existing -10..+10 stepper bound, roll-v2.js

/**
 * Review fix (Pass 1, Medium): a plain `${charId}-${powerName}` template
 * was not injective — `(charId:"a-b", powerName:"c")` and
 * `(charId:"a", powerName:"b-c")` both produced `tm-rlv7-chips-a-b-c`,
 * letting two distinct character/pool pairs share and overwrite one chip
 * list. `encodeURIComponent` leaves `-` unescaped (it's in the unreserved
 * set), so a hyphen delimiter alone can't disambiguate two hyphenated
 * components — `|` is used instead, which `encodeURIComponent` DOES
 * escape (to `%7C`), so it can never appear literally inside either
 * encoded component and is therefore a safe, unambiguous separator.
 */
function key(charId, powerName) {
  return `tm-rlv7-chips-${encodeURIComponent(charId)}|${encodeURIComponent(powerName)}`;
}

export function clampChipValue(v) {
  const n = Math.trunc(Number(v) || 0);
  return Math.max(-CAP, Math.min(CAP, n));
}

/**
 * Review fix (Pass 1, Medium): a stored payload passing the outer shape
 * check (`v === VERSION`, `chips` is an array) was trusted field-for-field
 * with no per-entry validation — a corrupted-but-parseable payload with a
 * non-numeric `value` (e.g. `"10"`) could coerce `state.MOD += value` into
 * string concatenation instead of numeric addition, and an `id` containing
 * a quote/apostrophe could break the rendered markup. Every loaded entry
 * is now normalized through `clampChipValue` (the exact same clamp `addChip`
 * already applies on write) and type-checked; anything that doesn't shape
 * up as a real chip is dropped rather than passed through.
 */
function normalizeChip(c) {
  if (!c || typeof c !== 'object') return null;
  if (typeof c.id !== 'string' || !c.id) return null;
  if (typeof c.label !== 'string' || !c.label) return null;
  const value = clampChipValue(c.value);
  if (!value) return null;
  return { id: c.id, label: c.label, value, on: c.on === true };
}

export function loadChips(charId, powerName) {
  if (!charId || !powerName) return [];
  try {
    const raw = localStorage.getItem(key(charId, powerName));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== VERSION || !Array.isArray(parsed.chips)) return [];
    return parsed.chips.map(normalizeChip).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Review fix (Pass 1/3a, Medium): this used to swallow the exception and
 * return nothing, while every caller below still returned `next` as if the
 * write had succeeded — a QuotaExceeded/disabled-storage failure was
 * presented to the roller as a successful, persistent mutation that then
 * silently vanished on reload. Returns whether the write actually
 * succeeded so callers can return the UNCHANGED list on failure — a
 * genuine no-op end-to-end (storage AND in-memory state both stay as they
 * were), matching this module's own "degrade to a silent no-op" contract
 * literally instead of only in the code comment.
 */
function saveChips(charId, powerName, chips) {
  if (!charId || !powerName) return false;
  try {
    localStorage.setItem(key(charId, powerName), JSON.stringify({ v: VERSION, chips }));
    return true;
  } catch {
    // QuotaExceeded or storage disabled — acceptable fallback failure.
    return false;
  }
}

export function addChip(charId, powerName, label, value) {
  const chips = loadChips(charId, powerName);
  const cleanLabel = String(label || '').trim().slice(0, 40);
  const cleanValue = clampChipValue(value);
  if (!cleanLabel || !cleanValue) return chips;
  const chip = { id: crypto.randomUUID(), label: cleanLabel, value: cleanValue, on: true };
  const next = [...chips, chip];
  return saveChips(charId, powerName, next) ? next : chips;
}

export function toggleChip(charId, powerName, chipId) {
  const chips = loadChips(charId, powerName);
  const next = chips.map(c => c.id === chipId ? { ...c, on: !c.on } : c);
  return saveChips(charId, powerName, next) ? next : chips;
}

export function removeChip(charId, powerName, chipId) {
  const chips = loadChips(charId, powerName);
  const next = chips.filter(c => c.id !== chipId);
  return saveChips(charId, powerName, next) ? next : chips;
}
