/**
 * Session banner — populates #bn-date, #bn-time, #bn-deadline.
 * Primary source: TM Suite API (/api/game_sessions/next).
 * Fallback: Google Calendar iCal via CORS proxies.
 */
(function () {
  const API_URL  = 'https://tm-suite-api.onrender.com/api/game_sessions/next';
  const CAL_ID   = 'terramortislarp@gmail.com';
  const ICAL_URL = 'https://calendar.google.com/calendar/ical/' + encodeURIComponent(CAL_ID) + '/public/basic.ics';

  const PROXIES = [
    u => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
    u => 'https://corsproxy.io/?' + encodeURIComponent(u),
    u => 'https://thingproxy.freeboard.io/fetch/' + u,
    u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  ];

  const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  function fmt12(h, m) {
    const ap  = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 || 12;
    return m === 0 ? h12 + '\u202f' + ap : h12 + ':' + String(m).padStart(2, '0') + '\u202f' + ap;
  }

  function populateFromSession(session) {
    // Parse date as local time (avoid UTC-offset day shift)
    const [yr, mo, dy] = session.session_date.split('-').map(Number);
    const dt = new Date(yr, mo - 1, dy);
    document.getElementById('bn-date').textContent =
      DAYS[dt.getDay()] + ' ' + dy + ' ' + MONTHS[mo - 1] + ' ' + yr;

    if (session.doors_open) {
      const [h, m] = session.doors_open.split(':').map(Number);
      document.getElementById('bn-time').textContent = fmt12(h, m);
    } else {
      document.getElementById('bn-time').textContent = '—';
    }

    document.getElementById('bn-deadline').innerHTML = session.downtime_deadline
      ? 'Downtime deadline: <strong>' + session.downtime_deadline + '</strong>'
      : 'Downtime deadline: <strong>Midnight, Friday before game night</strong>';
  }

  // ── iCal fallback ────────────────────────────────────────────────────────────

  function parseIcal(text) {
    text = text.replace(/\r\n[ \t]/g, '').replace(/\r/g, '');
    const events = [];
    const blocks = text.split('BEGIN:VEVENT');
    blocks.shift();

    blocks.forEach(block => {
      const end = block.indexOf('END:VEVENT');
      if (end === -1) return;
      const body = block.substring(0, end);

      function getVal(key) {
        const m = body.match(new RegExp('^' + key + '(?:;[^:]*)?:(.*)$', 'm'));
        return m ? m[1].trim() : '';
      }

      const dtraw = getVal('DTSTART') || getVal('DTSTART;TZID=[^:]+');
      const desc  = getVal('DESCRIPTION').replace(/\\n/g, '\n').replace(/\\,/g, ',');

      let dt = null;
      const dm = dtraw.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
      if (dm) {
        const [, yr, mo, dy, hr = '0', mn = '0'] = dm;
        dt = dtraw.endsWith('Z')
          ? new Date(Date.UTC(+yr, +mo - 1, +dy, +hr, +mn))
          : new Date(+yr, +mo - 1, +dy, +hr, +mn);
      }
      if (dt) events.push({ dt, desc });
    });
    return events;
  }

  function populateFromIcal(text) {
    const now    = new Date();
    const events = parseIcal(text).filter(e => e.dt > now);
    if (!events.length) { setFallback('no upcoming events in feed'); return; }

    events.sort((a, b) => a.dt - b.dt);
    const { dt, desc } = events[0];

    document.getElementById('bn-date').textContent =
      DAYS[dt.getDay()] + ' ' + dt.getDate() + ' ' + MONTHS[dt.getMonth()] + ' ' + dt.getFullYear();
    document.getElementById('bn-time').textContent = fmt12(dt.getHours(), dt.getMinutes());

    const dlMatch = desc.match(/[Dd]owntime[^:\n]*:\s*([^\n]+)/);
    document.getElementById('bn-deadline').innerHTML = dlMatch
      ? 'Downtime deadline: <strong>' + dlMatch[1].trim() + '</strong>'
      : 'Downtime deadline: <strong>Midnight, Friday before game night</strong>';
  }

  function setFallback(reason) {
    console.warn('[TM Banner] fallback:', reason);
    document.getElementById('bn-date').textContent   = 'See calendar for next date';
    document.getElementById('bn-time').textContent   = '6\u202fpm';
    document.getElementById('bn-deadline').innerHTML = 'Downtime deadline: <strong>Midnight, Friday before game night</strong>';
  }

  async function loadBanner() {
    // 1. Try the TM Suite API first (set via admin Engine panel)
    try {
      const res = await fetch(API_URL, { cache: 'no-cache' });
      if (res.ok) {
        const session = await res.json();
        if (session && session.session_date) {
          populateFromSession(session);
          return;
        }
      }
    } catch (e) { /* fall through to iCal */ }

    // 2. Fall back to Google Calendar iCal via CORS proxies
    for (let i = 0; i < PROXIES.length; i++) {
      try {
        const res = await fetch(PROXIES[i](ICAL_URL), { cache: 'no-cache' });
        if (!res.ok) continue;
        const text = await res.text();
        if (!text.includes('BEGIN:VCALENDAR')) continue;
        populateFromIcal(text);
        return;
      } catch (e) { /* try next proxy */ }
    }

    setFallback('all sources failed');
  }

  loadBanner();
})();
