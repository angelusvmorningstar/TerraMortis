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

  // In-document TOC links (from the markdown's own Contents section) use
  // standard #slug hrefs. Intercept them so we scroll the tab panel, not the
  // window, and avoid polluting the browser URL bar.
  el.querySelectorAll('.primer-content a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const href = a.getAttribute('href');
      if (!href || href.length < 2) return;
      const target = el.querySelector(href);
      if (!target) return;
      e.preventDefault();
      el.scrollTo({ top: target.offsetTop - el.offsetTop - 16, behavior: 'smooth' });
    });
  });

  // Sticky-sidebar TOC links — same behaviour.
  el.querySelectorAll('.primer-toc-link').forEach(a => {
    a.addEventListener('click', e => {
      const href = a.getAttribute('href');
      if (!href || href.length < 2) return;
      const target = el.querySelector(href);
      if (!target) return;
      e.preventDefault();
      el.scrollTo({ top: target.offsetTop - el.offsetTop - 16, behavior: 'smooth' });
    });
  });

  // Highlight active TOC link on scroll
  const content  = el.querySelector('.primer-content');
  const headings = [...el.querySelectorAll('.primer-content [id]')];
  const links    = [...el.querySelectorAll('.primer-toc-link')];

  if (headings.length && content) {
    const onScroll = () => {
      const scrollTop = el.scrollTop;
      let active = 0;
      for (let i = 0; i < headings.length; i++) {
        if (headings[i].offsetTop - el.offsetTop <= scrollTop + 80) active = i;
      }
      links.forEach((l, i) => l.classList.toggle('primer-toc-active', i === active));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
}
