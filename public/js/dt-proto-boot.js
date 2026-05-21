// DT Prototype boot — fetch shim + static data + initDowntimeView.
// Committed on this branch; the data it loads (public/dt-proto-data/) is gitignored.

const DATA = '/dt-proto-data';

// ── 1. Load static data (real fetch, before shim is installed) ──────────────
const [submissions, cycles, territories, chars] = await Promise.all([
  fetch(`${DATA}/submissions.json`).then(r => r.json()),
  fetch(`${DATA}/cycles.json`).then(r => r.json()),
  fetch(`${DATA}/territories.json`).then(r => r.json()),
  fetch(`${DATA}/characters.json`).then(r => r.json()),
]).catch(err => {
  document.getElementById('proto-loading').textContent =
    `Failed to load proto data: ${err.message}. Make sure public/dt-proto-data/ exists.`;
  throw err;
});

document.getElementById('proto-loading').remove();

// ── 2. Fetch shim — intercepts /api/ calls, returns static data ─────────────
const _realFetch = window.fetch.bind(window);

window.fetch = function shimFetch(url, opts = {}) {
  const urlStr = String(typeof url === 'string' ? url : url.url ?? url);
  if (!urlStr.includes('/api/')) return _realFetch(url, opts);

  const method = (opts.method || 'GET').toUpperCase();
  const apiPath = urlStr.replace(/^.*\/api\//, '');
  const seg = apiPath.split('?')[0].split('/');

  const ok = (body, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }));
  const noContent = () =>
    Promise.resolve(new Response(null, { status: 204 }));
  const echo = (status = 200) => {
    const body = opts.body ? (() => { try { return JSON.parse(opts.body); } catch { return {}; } })() : {};
    return ok(body, status);
  };

  if (method === 'GET') {
    if (seg[0] === 'downtime_cycles') return ok(cycles);

    if (seg[0] === 'downtime_submissions') {
      const cycleId = new URL(urlStr, location.href).searchParams.get('cycle_id');
      const result = cycleId
        ? submissions.filter(s => String(s.cycle_id) === String(cycleId))
        : submissions;
      return ok(result);
    }

    if (seg[0] === 'territories') return ok(territories);
    if (seg[0] === 'characters') return ok(chars);

    if (seg[0] === 'players') {
      if (seg[1] === 'display-names') {
        return ok(chars.filter(c => c.player).map(c => ({
          character_id: String(c._id),
          display_name: c.player,
        })));
      }
      return ok([]);
    }

    // Shim out everything else as empty
    if (seg[0] === 'st_mods') return ok([]);
    if (seg[0] === 'game_sessions') return ok([]);
    if (seg[0] === 'npc_personas') return ok([]);
    if (seg[0] === 'settings') return ok({});
    if (seg[0] === 'project_invitations') return ok([]);
    if (seg[0] === 'tickets') return ok([]);
    if (seg[0] === 'tracker_state') return ok(null, 404);
    if (seg[0] === 'auth') return ok({ role: 'st', username: 'Proto ST' });

    console.warn('[dt-proto shim] unhandled GET:', apiPath);
    return ok([]);
  }

  if (method === 'DELETE') return noContent();
  if (method === 'POST') return echo(201);
  return echo(200); // PUT, PATCH
};

// ── 3. Import and init ───────────────────────────────────────────────────────
const { initDowntimeView } = await import('./admin/downtime-views.js');
await initDowntimeView(chars);
