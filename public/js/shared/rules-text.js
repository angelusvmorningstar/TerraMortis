/**
 * Shared rules_text renderer + collapsed-expander builder.
 *
 * Issue #994: `purchasable_powers.rules_text` (markdown-lite, from #992's
 * uplift) is displayed at three call sites — suite sheet Powers drawers,
 * editor sheet drawers (pacts + generic merit row), and the dice modal.
 * This module is the single source of truth for turning rules_text into
 * safe HTML and for the collapsed toggle markup so all three sites stay
 * byte-identical and XSS-safe.
 *
 * Format contract (per #992): paragraphs separated by blank lines;
 * `**bold**` markers; an optional standalone `---` line ahead of a
 * `**TM Errata:**` section. No other markdown.
 */
import { esc } from '../data/helpers.js';

/**
 * Render rules_text (+ rules_source provenance) to safe HTML.
 * Escapes the ENTIRE input first via esc(), then applies exactly three
 * transforms against the already-escaped string: `**...**` -> <strong>,
 * blank-line breaks -> <p> paragraphs, a standalone `---` line -> a
 * tokenised horizontal-rule div. Returns '' for empty input.
 */
export function renderRulesText(rulesText, rulesSource) {
  const raw = (rulesText == null ? '' : String(rulesText));
  if (!raw.trim()) return '';

  const escaped = esc(raw);
  const lines = escaped.split('\n');

  let html = '';
  let para = [];
  const flushPara = () => {
    if (!para.length) return;
    const joined = para.join('<br>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html += `<p class="rules-text-p">${joined}</p>`;
    para = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '---') {
      flushPara();
      html += '<div class="rules-text-hr"></div>';
    } else if (trimmed === '') {
      flushPara();
    } else {
      para.push(line);
    }
  }
  flushPara();

  if (rulesSource) {
    html += `<div class="rules-text-source">Source: ${esc(rulesSource)}</div>`;
  }
  return html;
}

let _autoSeq = 0;

/**
 * Build a collapsed expander block (toggle button + hidden body). Returns
 * '' when rulesText is empty so call sites can splice the result in
 * unconditionally without an extra branch.
 *
 * @param {string} id - caller-supplied unique id fragment (alnum only recommended)
 * @param {string} rulesText
 * @param {string} [rulesSource]
 * @param {{label?: string}} [opts] - label defaults to "Full rules"
 */
export function renderRulesExpander(id, rulesText, rulesSource, opts = {}) {
  const text = (rulesText == null ? '' : String(rulesText));
  if (!text.trim()) return '';
  const label = opts.label || 'Full rules';
  const safeId = esc(String(id || ('rt-auto-' + (_autoSeq++))));
  const body = renderRulesText(text, rulesSource);
  return '<div class="rules-expander">'
    + '<button type="button" class="rules-expander-toggle" onclick="event.stopPropagation();toggleRulesText(\'' + safeId + '\')">'
    + '<span class="rules-expander-arr">›</span><span>' + esc(label) + '</span>'
    + '</button>'
    + '<div class="rules-expander-body" id="rules-body-' + safeId + '">' + body + '</div>'
    + '</div>';
}

/**
 * Toggle a rendered expander open/closed. Wired as a real click handler
 * (inline onclick on the <button>, never inside a `change` listener — see
 * the repo's listener-routing blind-spot precedent). Stateless per-id DOM
 * toggle — safe to share a single global across suite + editor + dice
 * modal since it never touches module-level "currently open" state.
 */
export function toggleRulesText(id) {
  const body = document.getElementById('rules-body-' + id);
  if (!body) return;
  const isOpen = body.classList.contains('visible');
  body.classList.toggle('visible', !isOpen);
  const toggleBtn = body.previousElementSibling;
  if (toggleBtn && toggleBtn.classList.contains('rules-expander-toggle')) {
    toggleBtn.classList.toggle('open', !isOpen);
  }
}

// Rendered HTML uses an inline onclick="toggleRulesText(...)" attribute, so
// the handler must be reachable as a bare global regardless of which module
// (suite/sheet.js, editor/sheet.js) happened to import this file first.
if (typeof window !== 'undefined') {
  window.toggleRulesText = toggleRulesText;
}
