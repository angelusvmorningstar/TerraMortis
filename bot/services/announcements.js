/**
 * Announcement polling service.
 * Polls the TM Suite API for new devlog entries and downtime cycle status
 * changes, then posts to the configured Discord channels.
 *
 * Channel IDs are read from env vars so they can be set per-environment
 * without code changes.
 *
 * Env vars:
 *   ANNOUNCE_DEVLOG_CHANNEL_ID     — channel for dev log posts
 *   ANNOUNCE_DOWNTIME_CHANNEL_ID   — channel for downtime lifecycle posts
 *   ANNOUNCE_GAME_CHANNEL_ID       — channel for game notices
 *   TM_API_URL                     — base URL for TM Suite API
 */

const API = process.env.TM_API_URL || 'https://tm-suite-api.onrender.com';

// In-memory state — resets on restart, which is fine (bot won't re-announce
// things it missed; it only announces new events from boot onward).
const seen = {
  devlogIds: new Set(),
  cycleStatuses: new Map(), // cycle_id → last known status
};

async function apiFetch(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`API ${path} returned ${res.status}`);
  return res.json();
}

function channel(client, id) {
  if (!id) return null;
  return client.channels.cache.get(id) ?? null;
}

// ── Devlog polling ────────────────────────────────────────────────────────────

async function pollDevlog(client) {
  const ch = channel(client, process.env.ANNOUNCE_DEVLOG_CHANNEL_ID);
  if (!ch) return;

  const entries = await apiFetch('/api/devlog_entries');
  const sorted = [...entries].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  for (const entry of sorted) {
    const id = String(entry._id);
    if (seen.devlogIds.has(id)) continue;
    seen.devlogIds.add(id);

    // Skip seeding the cache on first boot — only announce entries after startup
    if (seen.devlogIds.size === sorted.length && seen.devlogIds.has(id)) continue;

    await ch.send({
      embeds: [{
        title: `📋 Dev Log — ${entry.version ?? 'Update'}`,
        description: entry.body ?? entry.summary ?? '',
        color: 0xe0c47a,
        timestamp: entry.created_at,
      }],
    });
  }
}

// ── Downtime cycle polling ────────────────────────────────────────────────────

const CYCLE_MESSAGES = {
  open:      '📬 **Downtime is open.** Submit your actions in the player portal.',
  closed:    '🔒 **Downtime submissions are now closed.**',
  published: '📣 **Downtime outcomes have been released.** Check the player portal for your results.',
};

async function pollCycles(client) {
  const ch = channel(client, process.env.ANNOUNCE_DOWNTIME_CHANNEL_ID);
  if (!ch) return;

  const cycles = await apiFetch('/api/downtime_cycles');

  for (const cycle of cycles) {
    const id = String(cycle._id);
    const prev = seen.cycleStatuses.get(id);
    const curr = cycle.status;

    seen.cycleStatuses.set(id, curr);

    // Don't announce on first boot — seed the known state silently
    if (prev === undefined) continue;

    if (prev !== curr && CYCLE_MESSAGES[curr]) {
      await ch.send(`**Cycle ${cycle.cycle_number}** — ${CYCLE_MESSAGES[curr]}`);
    }
  }
}

// ── Main loop ─────────────────────────────────────────────────────────────────

export function startAnnouncementPolling(client) {
  const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  async function tick() {
    try { await pollDevlog(client); } catch (e) { console.error('[announcements] devlog poll error:', e.message); }
    try { await pollCycles(client); } catch (e) { console.error('[announcements] cycle poll error:', e.message); }
  }

  // Seed state on first tick (boot), then start announcing on subsequent ticks
  tick().then(() => {
    setInterval(tick, INTERVAL_MS);
    console.log(`[announcements] Polling every ${INTERVAL_MS / 1000}s`);
  });
}
