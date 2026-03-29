/**
 * roller.js
 * VtR 2e dice pool roller and result display.
 *
 * roll_pool(size, again, success, exc, rote)
 *   size    -- number of d10s in the initial pool
 *   again   -- face value >= this triggers a re-roll (10-again by default); 0 = face-10
 *   success -- face value >= this counts as a success (default 8)
 *   exc     -- successes >= this = exceptional success (default 5)
 *   rote    -- if true, roll the pool twice and keep the better result (default false)
 *
 * Dice string format: "[8,3,0>3,0>8,1,4]"
 *   - Comma-separated die values; 0 represents face-10
 *   - A>B means die A triggered a re-roll showing B (both evaluated for success)
 *
 * Rote result shape:
 *   { dice_string, successes, exceptional, rolled_at, params, rote_other: { dice_string, successes } }
 *   rote_other holds the discarded roll; winner fields are at the top level.
 */

// ── Core roller ───────────────────────────────────────────────────────────────

function roll_pool(size, again = 10, success = 8, exc = 5, rote = false) {
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
    const r1 = rollOnce();
    const r2 = rollOnce();
    // Winner = most successes; tie goes to r1
    const [winner, loser] = r1.successes >= r2.successes ? [r1, r2] : [r2, r1];
    return {
      dice_string: winner.dice_string,
      successes:   winner.successes,
      exceptional: winner.successes >= exc,
      rolled_at:   new Date().toISOString(),
      params:      { size, again, success, exc, rote: true },
      rote_other:  { dice_string: loser.dice_string, successes: loser.successes },
    };
  }

  const { dice_string, successes } = rollOnce();
  return {
    dice_string,
    successes,
    exceptional: successes >= exc,
    rolled_at:   new Date().toISOString(),
    params:      { size, again, success, exc, rote: false },
  };
}

// ── Dice string parser ────────────────────────────────────────────────────────

// "[8,3,0>3,0>8,1,4]" → [[8],[3],[0,3],[0,8],[1],[4]]
function parseDiceString(diceString) {
  const inner = diceString.replace(/^\[|\]$/g, '');
  if (!inner) return [];
  return inner.split(',').map(part => part.split('>').map(Number));
}

// ── Dice block builder (shared by single and rote views) ──────────────────────

function buildDiceBlock(diceString, params, label, dimmed) {
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
      const v   = chain[i];
      const fv  = v === 0 ? 10 : v;
      const isS = fv >= params.success;
      const isA = i < chain.length - 1;
      const die = document.createElement('div');
      die.className = 'roll-die' + (isS ? ' succ' : ' fail') + (isA ? ' again' : '');
      die.textContent = v === 0 ? '10' : String(v);
      chainEl.appendChild(die);
      if (isA) {
        const arrow = document.createElement('span');
        arrow.className = 'roll-arrow';
        arrow.textContent = '→';
        chainEl.appendChild(arrow);
      }
    }
    chainsEl.appendChild(chainEl);
  }

  wrap.appendChild(chainsEl);
  return wrap;
}

// ── Roll modal ────────────────────────────────────────────────────────────────

/**
 * pool: {
 *   size, expression,
 *   again?, success?, exc?,
 *   rollContext?: { char, source, index }
 *   existingRoll?: DicePoolResult
 * }
 */
function showRollModal(pool) {
  const params = {
    again:   pool.again   ?? 10,
    success: pool.success ?? 8,
    exc:     pool.exc     ?? 5,
  };

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
    const isRote = !!result.rote_other;
    overlay.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'roll-panel';

    // ── Header ──
    const hdr = document.createElement('div');
    hdr.className = 'roll-header';
    hdr.innerHTML = `
      <div>
        <div class="roll-title">Dice Roller${isRote ? ' <span class="rote-tag">Rote</span>' : ''}</div>
        <div class="roll-subtitle">${pool.expression || pool.size + ' dice'}</div>
      </div>
      <button class="roll-close-btn" id="roll-close-btn">✕</button>`;
    panel.appendChild(hdr);

    // ── Params + rote toggle ──
    const againLabel = params.again <= 10 ? params.again + '-again' : params.again + '-again';
    const pRow = document.createElement('div');
    pRow.className = 'roll-params';
    pRow.innerHTML = `
      <span class="roll-param">${pool.size} dice</span>
      <span class="roll-param">${againLabel}</span>
      <span class="roll-param">success ≥ ${params.success}</span>
      <span class="roll-param">exceptional ≥ ${params.exc}</span>
      <label class="roll-param roll-rote-toggle" title="Roll twice, keep best">
        <input type="checkbox" id="rote-toggle" ${isRote ? 'checked' : ''}
          style="accent-color:var(--gold2);margin-right:0.3rem">Rote
      </label>`;
    panel.appendChild(pRow);

    // ── Dice display ──
    if (isRote) {
      // Two-column: winner on left, discarded on right
      const pair = document.createElement('div');
      pair.className = 'roll-rote-pair';
      pair.appendChild(buildDiceBlock(result.dice_string,        params, '▲ Winner',   false));
      pair.appendChild(buildDiceBlock(result.rote_other.dice_string, params, 'Discarded', true));
      panel.appendChild(pair);
    } else {
      panel.appendChild(buildDiceBlock(result.dice_string, params, null, false));
    }

    // ── Result summary ──
    const resultClass = result.exceptional     ? 'exceptional'
                      : result.successes === 0  ? 'failure'
                      : 'normal';
    const resultLabel = result.exceptional     ? 'Exceptional Success'
                      : result.successes === 0  ? 'Failure'
                      : result.successes === 1  ? 'Success'
                      : 'Successes';
    const summary = document.createElement('div');
    summary.className = 'roll-summary';
    summary.innerHTML = `
      <div class="roll-count ${resultClass}">${result.successes}</div>
      <div class="roll-count-label ${resultClass}">${resultLabel}
        ${isRote ? `<span style="color:var(--muted);font-size:0.65rem;display:block;margin-top:0.2rem">
          Discarded: ${result.rote_other.successes} succ</span>` : ''}
      </div>`;
    panel.appendChild(summary);

    // ── Encoded string ──
    const encoded = document.createElement('div');
    encoded.className = 'roll-encoded';
    encoded.textContent = isRote
      ? `Winner: ${result.dice_string}   Discarded: ${result.rote_other.dice_string}`
      : result.dice_string;
    panel.appendChild(encoded);

    // ── Buttons ──
    const saveBtn = pool.rollContext
      ? `<button class="btn" id="roll-save-btn"
           style="border-color:#7fbf8f;color:#7fbf8f">Save Roll</button>`
      : '';
    const btnRow = document.createElement('div');
    btnRow.className = 'roll-btn-row';
    btnRow.innerHTML = `
      <button class="btn" id="roll-reroll-btn">Re-roll</button>
      ${saveBtn}
      <button class="btn" id="roll-done-btn"
        style="border-color:var(--muted);color:var(--muted)">Close</button>`;
    panel.appendChild(btnRow);

    overlay.appendChild(panel);
    overlay.style.display = 'flex';

    document.getElementById('roll-close-btn').onclick = () => overlay.style.display = 'none';
    document.getElementById('roll-done-btn').onclick  = () => overlay.style.display = 'none';
    document.getElementById('roll-reroll-btn').onclick = () => {
      const rote = document.getElementById('rote-toggle').checked;
      render(roll_pool(pool.size, params.again, params.success, params.exc, rote));
    };

    if (pool.rollContext) {
      document.getElementById('roll-save-btn').onclick = async () => {
        const { char, source, index, rollField } = pool.rollContext;
        const rollData = {
          dice_string: result.dice_string,
          successes:   result.successes,
          rolled_at:   result.rolled_at,
          ...(result.rote_other ? { rote_other: result.rote_other } : {}),
        };
        try {
          const active      = await db.getActiveCycle();
          const updatedRaw  = await db.saveRoll(active.id, char, source, index,
                                                { [rollField]: rollData });
          const subIdx      = window._submissions.findIndex(
            s => s.submission.character_name === char
          );
          if (subIdx !== -1) window._submissions[subIdx] = updatedRaw;
          if (typeof window._refreshActiveDetail === 'function') {
            window._refreshActiveDetail(char);
          }
          overlay.style.display = 'none';
        } catch (err) {
          console.error('Save roll failed:', err);
          document.getElementById('roll-save-btn').textContent = 'Save failed';
        }
      };
    }
  }

  const initialRote = pool.existingRoll?.params?.rote ?? false;
  const initial = pool.existingRoll
    ? { ...pool.existingRoll, exceptional: pool.existingRoll.successes >= params.exc }
    : roll_pool(pool.size, params.again, params.success, params.exc, initialRote);
  render(initial);
}

// ── Global click delegation for dice badges ───────────────────────────────────

document.addEventListener('click', e => {
  const badge = e.target.closest('.dice-size-badge');
  if (!badge) return;
  const size = parseInt(badge.dataset.poolSize, 10);
  if (isNaN(size) || size < 1) return;

  const rollContext = badge.dataset.rollChar
    ? { char:      badge.dataset.rollChar,
        source:    badge.dataset.rollSource,
        index:     parseInt(badge.dataset.rollIndex, 10),
        rollField: badge.dataset.rollField || 'roll' }
    : null;

  let existingRoll = null;
  if (badge.dataset.existingRoll) {
    try { existingRoll = JSON.parse(badge.dataset.existingRoll); } catch (_) {}
  }

  showRollModal({ size, expression: badge.dataset.poolExpr || null, rollContext, existingRoll });
});
