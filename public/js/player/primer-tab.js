/* Primer tab — renders the static primer HTML converted from the repo's
   markdown source with a sticky table of contents + scroll-spy.

   Source pipeline:
     public/primer/Terra_Mortis_Setting_Primer.md  (edited by hand)
       → `npm run primer:build` (uses marked, adds slug heading IDs)
       → public/primer/primer.html  (what the browser fetches below)

   The old path fetched HTML from /api/archive_documents/primer (populated
   via a .docx upload flow). That endpoint still exists as a fallback and
   is kept wired so Storytellers can still upload via the admin UI; the
   static file takes precedence because it ships with the Netlify build. */

export async function renderPrimerTab(el) {
  el.innerHTML = '<p class="placeholder-msg">Loading\u2026</p>';

  let html = '';
  try {
    const res = await fetch('/primer/primer.html', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    el.innerHTML = '<p class="placeholder-msg">The primer is not yet available.</p>';
    return;
  }

  // Build TOC entries from the heading IDs the converter already baked in.
  const parser = new DOMParser();
  const parsed = parser.parseFromString(html, 'text/html');
  const tocItems = [];
  parsed.querySelectorAll('h1[id], h2[id], h3[id]').forEach(h => {
    tocItems.push({
      id:    h.id,
      text:  h.textContent.trim(),
      level: parseInt(h.tagName[1], 10),
    });
  });

  let h = '<div class="primer-layout">';

  // Sticky TOC
  h += '<nav class="primer-toc" id="primer-toc">';
  h += '<div class="primer-toc-title">Contents</div>';
  if (tocItems.length) {
    h += '<ul class="primer-toc-list">';
    for (const item of tocItems) {
      h += `<li class="primer-toc-item primer-toc-h${item.level}">`;
      h += `<a class="primer-toc-link" href="#${item.id}">${item.text}</a>`;
      h += '</li>';
    }
    h += '</ul>';
  }
  h += '</nav>';

  // Content
  h += `<div class="primer-content reading-pane">${html}</div>`;

  h += '</div>';
  el.innerHTML = h;

  // The real scroll container for the player portal is #content (flex:1;
  // overflow-y:auto). #tab-primer has overflow-y:auto too, but since the
  // panel grows to fit its content it never overflows — its scrollTo is a
  // silent no-op, which is why the previous attempts to scroll `el` failed.
  const scrollRoot = document.getElementById('content') || document.scrollingElement || document.documentElement;

  // Intercept every #slug anchor inside the tab — both the sticky sidebar
  // TOC and the markdown's own in-document Contents section. Use the
  // browser's own scrollIntoView, which handles finding the right scroll
  // ancestor automatically and respects scroll-margin-top for the gutter
  // above the heading (set on .primer-content headings in components.css).
  el.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || !el.contains(a)) return;
    const href = a.getAttribute('href');
    if (!href || href.length < 2) return;
    const slug = href.slice(1);
    const sel  = '#' + (window.CSS && CSS.escape ? CSS.escape(slug) : slug);
    const target = el.querySelector(sel);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // Highlight active TOC link on scroll. Listen on #content (the real
  // scroll container) and compute positions via getBoundingClientRect
  // instead of scrollTop/offsetTop, which are brittle across flex + sticky
  // layouts. If the user leaves the primer tab we stop listening.
  const headings = [...el.querySelectorAll('.primer-content [id]')];
  const links    = [...el.querySelectorAll('.primer-toc-link')];

  if (headings.length) {
    const onScroll = () => {
      // Only update highlights while the primer tab is the active one.
      if (!el.classList.contains('active')) return;
      let active = 0;
      for (let i = 0; i < headings.length; i++) {
        const hTop = headings[i].getBoundingClientRect().top;
        if (hTop <= 120) active = i;
      }
      links.forEach((l, i) => l.classList.toggle('primer-toc-active', i === active));
    };
    scrollRoot.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
}
