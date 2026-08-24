/* rlv.7 (#1039 item 2) — persistent per-power modifier chips.
   Player curates free-text label+value mods; the app remembers them per
   (character, power) and restores their last on/off state next time the
   same power is loaded — the roller's own state.WP/MOD/ROTE toggle
   pattern (roll-v2.js), generated from a list instead of hardcoded (D5).
   Modelled directly on tabs/draft-persist.js's own versioned-payload,
   composite-key shape. */

const VERSION = 1;
const CAP = 10; // matches chgMod()'s existing -10..+10 stepper bound, roll-v2.js

function key(charId, powerName) {
  return `tm-rlv7-chips-${charId}-${powerName}`;
}

export function clampChipValue(v) {
  const n = Math.trunc(Number(v) || 0);
  return Math.max(-CAP, Math.min(CAP, n));
}

export function loadChips(charId, powerName) {
  if (!charId || !powerName) return [];
  try {
    const raw = localStorage.getItem(key(charId, powerName));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== VERSION || !Array.isArray(parsed.chips)) return [];
    return parsed.chips;
  } catch {
    return [];
  }
}

function saveChips(charId, powerName, chips) {
  if (!charId || !powerName) return;
  try {
    localStorage.setItem(key(charId, powerName), JSON.stringify({ v: VERSION, chips }));
  } catch {
    // QuotaExceeded or storage disabled — acceptable fallback failure.
  }
}

export function addChip(charId, powerName, label, value) {
  const chips = loadChips(charId, powerName);
  const cleanLabel = String(label || '').trim().slice(0, 40);
  const cleanValue = clampChipValue(value);
  if (!cleanLabel || !cleanValue) return chips;
  const chip = { id: crypto.randomUUID(), label: cleanLabel, value: cleanValue, on: true };
  const next = [...chips, chip];
  saveChips(charId, powerName, next);
  return next;
}

export function toggleChip(charId, powerName, chipId) {
  const chips = loadChips(charId, powerName);
  const next = chips.map(c => c.id === chipId ? { ...c, on: !c.on } : c);
  saveChips(charId, powerName, next);
  return next;
}

export function removeChip(charId, powerName, chipId) {
  const chips = loadChips(charId, powerName);
  const next = chips.filter(c => c.id !== chipId);
  saveChips(charId, powerName, next);
  return next;
}
