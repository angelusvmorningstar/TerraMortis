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

  // Intercept every #slug anchor inside the tab — both the sticky sidebar
  // TOC and the markdown's own in-document Contents section. Scroll the
  // tab panel (the actual scroll container), not the window. We compute
  // the scroll delta from getBoundingClientRect instead of offsetTop
  // because offsetTop is relative to the nearest positioned ancestor, which
  // isn't guaranteed to be `el` — whereas getBoundingClientRect is
  // viewport-relative and works regardless of the containing-block chain.
  const scrollToAnchor = (href) => {
    if (!href || href.length < 2) return false;
    const slug = href.slice(1);
    const sel  = '#' + (window.CSS && CSS.escape ? CSS.escape(slug) : slug);
    const target = el.querySelector(sel);
    if (!target) return false;
    const elRect     = el.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top = el.scrollTop + (targetRect.top - elRect.top) - 16;
    el.scrollTo({ top, behavior: 'smooth' });
    return true;
  };

  el.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || !el.contains(a)) return;
    if (scrollToAnchor(a.getAttribute('href'))) e.preventDefault();
  });

  // Highlight active TOC link on scroll. Uses getBoundingClientRect for the
  // same reason — offsetTop was lying to us.
  const content  = el.querySelector('.primer-content');
  const headings = [...el.querySelectorAll('.primer-content [id]')];
  const links    = [...el.querySelectorAll('.primer-toc-link')];

  if (headings.length && content) {
    const onScroll = () => {
      const elTop = el.getBoundingClientRect().top;
      let active = 0;
      for (let i = 0; i < headings.length; i++) {
        const hTop = headings[i].getBoundingClientRect().top - elTop;
        if (hTop <= 80) active = i;
      }
      links.forEach((l, i) => l.classList.toggle('primer-toc-active', i === active));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
}
