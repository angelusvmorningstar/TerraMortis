/**
 * Downtime dice roller — ES module version.
 * VtR 2e dice pool roller with modal UI and rote support.
 *
 * Converted from downtime_helper/js/roller.js (Peter's original).
 */

// ── Core roller ─────────────────────────────────────────────────────────────

export function rollPool(size, again = 10, success = 8, exc = 5, rote = false) {
  const d10  = () => Math.floor(Math.random() * 10); // 0 = face-10
  const face = v  => (v === 0 ? 10 : v);

  function rollChain() {
    const chain = [];
    let v = d10();
    chain.push(v);
    while (face(v) >= again) { v = d10(); chain.push(v); }
    return chain;
  }

  function rollOnce() {
    const chains = Array.from({ length: size }, rollChain);
    let successes = 0;
    for (const chain of chains)
      for (const v of chain)
        if (face(v) >= success) successes++;
    const dice_string = '[' + chains.map(c => c.join('>')).join(',') + ']';
    return { dice_string, successes };
  }

  if (rote) {
    const r1 = rollOnce(), r2 = rollOnce();
    const [winner, loser] = r1.successes >= r2.successes ? [r1, r2] : [r2, r1];
    return {
      dice_string: winner.dice_string, successes: winner.successes,
      exceptional: winner.successes >= exc, rolled_at: new Date().toISOString(),
      params: { size, again, success, exc, rote: true },
      rote_other: { dice_string: loser.dice_string, successes: loser.successes },
    };
  }

  const { dice_string, successes } = rollOnce();
  return {
    dice_string, successes, exceptional: successes >= exc,
    rolled_at: new Date().toISOString(),
    params: { size, again, success, exc, rote: false },
  };
}

// ── Dice string parser ──────────────────────────────────────────────────────

export function parseDiceString(diceString) {
  const inner = diceString.replace(/^\[|\]$/g, '');
  if (!inner) return [];
  return inner.split(',').map(part => part.split('>').map(Number));
}

// ── Dice block builder ──────────────────────────────────────────────────────

export function buildDiceBlock(diceString, params, label, dimmed) {
  const wrap = document.createElement('div');
  wrap.className = 'roll-dice-block' + (dimmed ? ' dimmed' : '');

  if (label) {
    const lbl = document.createElement('div');
    lbl.className = 'roll-dice-label' + (dimmed ? '' : ' winner');
    lbl.textContent = label;
    wrap.appendChild(lbl);
  }

  const chainsEl = document.createElement('div');
  chainsEl.className = 'roll-dice-wrap';
  const chains = parseDiceString(diceString);

  for (const chain of chains) {
    const chainEl = document.createElement('div');
    chainEl.className = 'roll-chain';
    for (let i = 0; i < chain.length; i++) {
      const v = chain[i], fv = v === 0 ? 10 : v;
      const die = document.createElement('div');
      die.className = 'roll-die' + (fv >= params.success ? ' succ' : ' fail') + (i < chain.length - 1 ? ' again' : '');
      die.textContent = v === 0 ? '10' : String(v);
      chainEl.appendChild(die);
      if (i < chain.length - 1) {
        const arrow = document.createElement('span');
        arrow.className = 'roll-arrow';
        arrow.textContent = '\u2192';
        chainEl.appendChild(arrow);
      }
    }
    chainsEl.appendChild(chainEl);
  }

  wrap.appendChild(chainsEl);
  return wrap;
}

// ── Roll modal ──────────────────────────────────────────────────────────────

export function showRollModal(pool, onSave) {
  const params = {
    again: pool.again ?? 10,
    success: pool.success ?? 8,
    exc: pool.exc ?? 5,
  };

  let overlay = document.getElementById('roll-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'roll-modal-overlay';
    overlay.className = 'roll-overlay';
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });
    document.body.appendChild(overlay);
  }

  function render(result) {
    const isRote = !!result.rote_other;
    overlay.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'roll-panel';

    panel.innerHTML = `
      <div class="roll-header">
        <div>
          <div class="roll-title">Dice Roller${isRote ? ' <span class="rote-tag">Rote</span>' : ''}</div>
          <div class="roll-subtitle">${pool.expression || pool.size + ' dice'}</div>
        </div>
        <button class="roll-close-btn" id="roll-close-btn">\u2715</button>
      </div>`;

    const pRow = document.createElement('div');
    pRow.className = 'roll-params';
    pRow.innerHTML = `
      <span class="roll-param">${pool.size} dice</span>
      <span class="roll-param">${params.again}-again</span>
      <span class="roll-param">success \u2265 ${params.success}</span>
      <span class="roll-param">exceptional \u2265 ${params.exc}</span>
      <label class="roll-param roll-rote-toggle">
        <input type="checkbox" id="rote-toggle" ${isRote ? 'checked' : ''} style="accent-color:var(--accent);margin-right:0.3rem">Rote
      </label>`;
    panel.appendChild(pRow);

    if (isRote) {
      const pair = document.createElement('div');
      pair.className = 'roll-rote-pair';
      pair.appendChild(buildDiceBlock(result.dice_string, params, '\u25B2 Winner', false));
      pair.appendChild(buildDiceBlock(result.rote_other.dice_string, params, 'Discarded', true));
      panel.appendChild(pair);
    } else {
      panel.appendChild(buildDiceBlock(result.dice_string, params, null, false));
    }

    const rc = result.exceptional ? 'exceptional' : result.successes === 0 ? 'failure' : 'normal';
    const rl = result.exceptional ? 'Exceptional Success' : result.successes === 0 ? 'Failure' : result.successes === 1 ? 'Success' : 'Successes';
    const summary = document.createElement('div');
    summary.className = 'roll-summary';
    summary.innerHTML = `<div class="roll-count ${rc}">${result.successes}</div><div class="roll-count-label ${rc}">${rl}</div>`;
    panel.appendChild(summary);

    const btnRow = document.createElement('div');
    btnRow.className = 'roll-btn-row';
    btnRow.innerHTML = `
      <button class="btn" id="roll-reroll-btn">Re-roll</button>
      ${onSave ? '<button class="btn" id="roll-save-btn" style="border-color:#7fbf8f;color:#7fbf8f">Save Roll</button>' : ''}
      <button class="btn" id="roll-done-btn" style="border-color:var(--muted);color:var(--muted)">Close</button>`;
    panel.appendChild(btnRow);

    overlay.appendChild(panel);
    overlay.style.display = 'flex';

    document.getElementById('roll-close-btn').onclick = () => overlay.style.display = 'none';
    document.getElementById('roll-done-btn').onclick = () => overlay.style.display = 'none';
    document.getElementById('roll-reroll-btn').onclick = () => {
      const rote = document.getElementById('rote-toggle').checked;
      render(rollPool(pool.size, params.again, params.success, params.exc, rote));
    };

    if (onSave) {
      document.getElementById('roll-save-btn').onclick = () => {
        onSave(result);
        overlay.style.display = 'none';
      };
    }
  }

  const initialRote = pool.existingRoll?.params?.rote ?? pool.initialRote ?? false;
  const initial = pool.existingRoll
    ? { ...pool.existingRoll, exceptional: pool.existingRoll.successes >= params.exc }
    : rollPool(pool.size, params.again, params.success, params.exc, initialRote);
  render(initial);
}
