/* Archive inline editor — ST-only contentEditable pane with a minimal toolbar.
 * Storage is HTML; styling rides the existing .reading-pane rules.
 * No external dependencies; uses document.execCommand for formatting.
 *
 * Usage:
 *   openInlineEditor(paneEl, docId, initialHtml, { onSaved, onCancelled });
 *   - onSaved(finalHtml) fires after a successful PUT.
 *   - onCancelled() fires when the user clicks Cancel.
 */

import { apiPut } from '../data/api.js';

let _paneEl       = null;
let _docId        = null;
let _initialHtml  = '';
let _onSaved      = null;
let _onCancelled  = null;

export function openInlineEditor(paneEl, docId, initialHtml, { onSaved, onCancelled } = {}) {
  _paneEl      = paneEl;
  _docId       = docId;
  _initialHtml = initialHtml || '';
  _onSaved     = typeof onSaved === 'function' ? onSaved : null;
  _onCancelled = typeof onCancelled === 'function' ? onCancelled : null;

  render();
}

function render() {
  let h = '<div class="arc-editor">';
  h += '<div class="arc-editor-toolbar" role="toolbar" aria-label="Formatting">';
  h += btn('h2',     'Heading 2',      'H2');
  h += btn('h3',     'Heading 3',      'H3');
  h += btn('p',      'Paragraph',      'P');
  h += '<span class="arc-toolbar-sep" aria-hidden="true"></span>';
  h += btn('bold',   'Bold',           '<strong>B</strong>');
  h += btn('italic', 'Italic',         '<em>I</em>');
  h += '<span class="arc-toolbar-sep" aria-hidden="true"></span>';
  h += btn('ul',     'Bulleted list',  '&bull;');
  h += btn('ol',     'Numbered list',  '1.');
  h += btn('link',   'Insert link',    'Link');
  h += '<span class="arc-toolbar-spacer"></span>';
  h += '<button type="button" class="arc-btn-save" data-action="save">Save</button>';
  h += '<button type="button" class="arc-btn-cancel" data-action="cancel">Cancel</button>';
  h += '</div>';
  h += `<div class="arc-editor-content reading-pane" contenteditable="true" id="arc-editor-content">${_initialHtml}</div>`;
  h += '<div class="arc-editor-status" id="arc-editor-status" role="status" aria-live="polite"></div>';
  h += '</div>';

  _paneEl.innerHTML = h;

  _paneEl.querySelector('.arc-editor-toolbar').addEventListener('click', onToolbarClick);
  _paneEl.querySelector('#arc-editor-content').addEventListener('keydown', onKeydown);
  _paneEl.querySelector('#arc-editor-content').focus();
}

function btn(cmd, title, label) {
  return `<button type="button" data-cmd="${cmd}" title="${title}" aria-label="${title}">${label}</button>`;
}

function onToolbarClick(e) {
  const button = e.target.closest('button');
  if (!button) return;

  const action = button.dataset.action;
  if (action === 'save')   { save(); return; }
  if (action === 'cancel') { cancel(); return; }

  const cmd = button.dataset.cmd;
  if (!cmd) return;

  const contentEl = _paneEl.querySelector('#arc-editor-content');
  contentEl.focus();

  switch (cmd) {
    case 'h2':     document.execCommand('formatBlock', false, 'H2'); break;
    case 'h3':     document.execCommand('formatBlock', false, 'H3'); break;
    case 'p':      document.execCommand('formatBlock', false, 'P');  break;
    case 'bold':   document.execCommand('bold');   break;
    case 'italic': document.execCommand('italic'); break;
    case 'ul':     document.execCommand('insertUnorderedList'); break;
    case 'ol':     document.execCommand('insertOrderedList');   break;
    case 'link': {
      const url = window.prompt('Link URL:', 'https://');
      if (url) document.execCommand('createLink', false, url);
      break;
    }
  }
}

function onKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    save();
  }
}

async function save() {
  const contentEl = _paneEl.querySelector('#arc-editor-content');
  const statusEl  = _paneEl.querySelector('#arc-editor-status');
  const html      = contentEl.innerHTML;

  statusEl.className  = 'arc-editor-status';
  statusEl.textContent = 'Saving…';

  try {
    await apiPut(`/api/archive_documents/${_docId}`, { content_html: html });
    statusEl.textContent = 'Saved';
    if (_onSaved) _onSaved(html);
  } catch (err) {
    statusEl.className  = 'arc-editor-status arc-editor-status-error';
    statusEl.textContent = 'Save failed: ' + (err?.message || 'Unknown error');
  }
}

function cancel() {
  if (_onCancelled) _onCancelled();
}
