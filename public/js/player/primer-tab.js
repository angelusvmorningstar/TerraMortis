/* AR-5: Primer tab — renders stored primer HTML with a sticky table of contents. */

import { apiGet } from '../data/api.js';

export async function renderPrimerTab(el) {
  el.innerHTML = '<p class="placeholder-msg">Loading\u2026</p>';

  let doc;
  try {
    doc = await apiGet('/api/archive_documents/primer');
  } catch {
    el.innerHTML = '<p class="placeholder-msg">The primer is not yet available.</p>';
    return;
  }

  // Inject IDs into headings and build TOC entries
  let html = doc.content_html || '';
  const tocItems = [];
  let idx = 0;

  html = html.replace(/<(h[1-3])([^>]*)>([\s\S]*?)<\/h[1-3]>/gi, (_match, tag, attrs, inner) => {
    const id   = `ph-${idx++}`;
    const level = parseInt(tag[1], 10);
    const text  = inner.replace(/<[^>]+>/g, '').trim();
    tocItems.push({ id, text, level });
    return `<${tag}${attrs} id="${id}">${inner}</${tag}>`;
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

  // Highlight active TOC link on scroll
  const content = el.querySelector('.primer-content');
  const headings = [...el.querySelectorAll('[id^="ph-"]')];
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
