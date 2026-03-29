/**
 * roller.js
 * VtR 2e dice pool roller and result display.
 *
 * roll_pool(size, again, success, exc)
 *   size    -- number of d10s in the initial pool
 *   again   -- face value >= this triggers a re-roll (10-again by default); 0 = face-10
 *   success -- face value >= this counts as a success (default 8)
 *   exc     -- successes >= this = exceptional success (default 5)
 *
 * Dice string format: "[8,3,0>3,0>8,1,4]"
 *   - Comma-separated die values
 *   - 0 represents face-10
 *   - A>B means die A triggered a re-roll showing B (both evaluated for success)
 */

// ── Core roller ───────────────────────────────────────────────────────────────

function roll_pool(size, again = 10, success = 8, exc = 5) {
  const d10  = () => Math.floor(Math.random() * 10); // 0 = face-10
  const face = v  => (v === 0 ? 10 : v);

  // Roll one die; if it meets the again threshold keep rolling and chain results
  function rollChain() {
    const chain = [];
    let v = d10();
    chain.push(v);
    while (face(v) >= again) {
      v = d10();
      chain.push(v);
    }
    return chain;
  }

  const chains = Array.from({ length: size }, rollChain);

  let successes = 0;
  for (const chain of chains) {
    for (const v of chain) {
      if (face(v) >= success) successes++;
    }
  }

  // Encode as "[8,3,0>3,0>8,1,4]"
  const diceString = '[' + chains.map(c => c.join('>')).join(',') + ']';

  return {
    dice_string: diceString,
    successes,
    exceptional: successes >= exc,
    rolled_at:   new Date().toISOString(),
    params:      { size, again, success, exc },
  };
}

// ── Dice string parser ────────────────────────────────────────────────────────

// "[8,3,0>3,0>8,1,4]" → [[8],[3],[0,3],[0,8],[1],[4]]
function parseDiceString(diceString) {
  const inner = diceString.replace(/^\[|\]$/g, '');
  if (!inner) return [];
  return inner.split(',').map(part => part.split('>').map(Number));
}

// ── Roll modal ────────────────────────────────────────────────────────────────

function showRollModal(pool) {
  const params = {
    again:   pool.again   ?? 10,
    success: pool.success ?? 8,
    exc:     pool.exc     ?? 5,
  };

  // Build overlay once; reuse on subsequent calls
  let overlay = document.getElementById('roll-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'roll-modal-overlay';
    overlay.className = 'roll-overlay';
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.style.display = 'none';
    });
    document.body.appendChild(overlay);
  }

  function render(result) {
    overlay.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'roll-panel';

    // ── Header ──
    const hdr = document.createElement('div');
    hdr.className = 'roll-header';
    hdr.innerHTML = `
      <div>
        <div class="roll-title">Dice Roller</div>
        <div class="roll-subtitle">${pool.expression || pool.size + ' dice'}</div>
      </div>
      <button class="roll-close-btn" id="roll-close-btn">✕</button>`;
    panel.appendChild(hdr);

    // ── Params ──
    const p = document.createElement('div');
    p.className = 'roll-params';
    const againLabel = params.again === 10 ? '10-again'
                     : params.again === 9  ? '9-again'
                     : params.again === 8  ? '8-again'
                     : params.again + '-again';
    p.innerHTML = `
      <span class="roll-param">${pool.size} dice</span>
      <span class="roll-param">${againLabel}</span>
      <span class="roll-param">success ≥ ${params.success}</span>
      <span class="roll-param">exceptional ≥ ${params.exc}</span>`;
    panel.appendChild(p);

    // ── Dice display ──
    const diceWrap = document.createElement('div');
    diceWrap.className = 'roll-dice-wrap';
    const chains = parseDiceString(result.dice_string);

    for (const chain of chains) {
      const chainEl = document.createElement('div');
      chainEl.className = 'roll-chain';

      for (let i = 0; i < chain.length; i++) {
        const v   = chain[i];
        const fv  = v === 0 ? 10 : v;
        const isS = fv >= params.success;
        const isA = i < chain.length - 1; // triggered a re-roll

        const die = document.createElement('div');
        die.className = 'roll-die' +
          (isS ? ' succ' : ' fail') +
          (isA ? ' again' : '');
        die.textContent = v === 0 ? '10' : String(v);
        chainEl.appendChild(die);

        if (isA) {
          const arrow = document.createElement('span');
          arrow.className = 'roll-arrow';
          arrow.textContent = '→';
          chainEl.appendChild(arrow);
        }
      }
      diceWrap.appendChild(chainEl);
    }
    panel.appendChild(diceWrap);

    // ── Result summary ──
    const summary = document.createElement('div');
    summary.className = 'roll-summary';
    const resultClass = result.exceptional    ? 'exceptional'
                      : result.successes === 0 ? 'failure'
                      : 'normal';
    const resultLabel = result.exceptional    ? 'Exceptional Success'
                      : result.successes === 0 ? 'Failure'
                      : result.successes === 1 ? 'Success'
                      : 'Successes';
    summary.innerHTML = `
      <div class="roll-count ${resultClass}">${result.successes}</div>
      <div class="roll-count-label ${resultClass}">${resultLabel}</div>`;
    panel.appendChild(summary);

    // ── Encoded string (for storing in DicePoolResult) ──
    const encoded = document.createElement('div');
    encoded.className = 'roll-encoded';
    encoded.textContent = result.dice_string;
    panel.appendChild(encoded);

    // ── Buttons ──
    const btnRow = document.createElement('div');
    btnRow.className = 'roll-btn-row';
    btnRow.innerHTML = `
      <button class="btn" id="roll-reroll-btn">Re-roll</button>
      <button class="btn" id="roll-done-btn"
        style="border-color:var(--muted);color:var(--muted)">Close</button>`;
    panel.appendChild(btnRow);

    overlay.appendChild(panel);
    overlay.style.display = 'flex';

    document.getElementById('roll-close-btn').onclick  = () => overlay.style.display = 'none';
    document.getElementById('roll-done-btn').onclick   = () => overlay.style.display = 'none';
    document.getElementById('roll-reroll-btn').onclick = () => render(roll_pool(
      pool.size, params.again, params.success, params.exc));
  }

  render(roll_pool(pool.size, params.again, params.success, params.exc));
}

// ── Global click delegation for dice badges ───────────────────────────────────

document.addEventListener('click', e => {
  const badge = e.target.closest('.dice-size-badge');
  if (!badge) return;
  const size = parseInt(badge.dataset.poolSize, 10);
  if (isNaN(size) || size < 1) return;
  showRollModal({
    size,
    expression: badge.dataset.poolExpr || null,
  });
});
