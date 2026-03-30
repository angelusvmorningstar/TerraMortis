/**
 * territory.js — Territory Bids tab (React component).
 *
 * Manages territory bidding, influence allocation, and resolution
 * for the five city territories. Uses React 18 via CDN (window.React/ReactDOM).
 */

const { createElement: h, useState, useEffect, useRef, Component } = window.React;

const TERRS = [
  { id: 'academy', name: 'The Academy', defaultRegent: 'Jack Fallow', ambience: 'Curated', ambienceMod: +3 },
  { id: 'dockyards', name: 'The Dockyards', defaultRegent: 'René St. Dominique', ambience: 'Settled', ambienceMod: 0 },
  { id: 'harbour', name: 'The Harbour', defaultRegent: 'Reed Justice', ambience: 'Untended', ambienceMod: -2 },
  { id: 'northshore', name: 'The North Shore', defaultRegent: 'Alice Vunder', ambience: 'Tended', ambienceMod: +2 },
  { id: 'secondcity', name: 'The Second City', defaultRegent: 'René Meyer', ambience: 'Tended', ambienceMod: +2 },
];

const KEY = 'tm_bids_v2';
let _id = Date.now();
const uid = () => String(++_id);

function dflt() {
  return {
    phase: 'open',
    peek: false,
    territories: TERRS.map(t => ({ ...t, regent: '', regentInput: '', bids: [], resolved: false, winnerId: null })),
  };
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && s.territories) return s;
  } catch (e) { /* ignore */ }
  return dflt();
}

const _fuzz = {};
function peekInfo(n, bidId) {
  if (n <= 0) return { approx: 0 };
  if (!_fuzz[bidId]) _fuzz[bidId] = (Math.random() * 0.3) - 0.15; // +/-15%
  const approx = Math.max(0, Math.round(n * (1 + _fuzz[bidId])));
  return { approx };
}

function total(bid) {
  return bid.backing.reduce((s, b) => s + b.amount, 0) + bid.rulerAdjust;
}

// ══════════════════════════════════════════════
//  APP COMPONENT
// ══════════════════════════════════════════════

class App extends Component {
  constructor(p) {
    super(p);
    this.state = { ...load(), modal: null, saving: false };
    this._t = null;
  }

  _save(ns) {
    clearTimeout(this._t);
    this.setState({ saving: true });
    this._t = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify({ phase: ns.phase, peek: ns.peek, territories: ns.territories }));
      } catch (e) { /* ignore */ }
      this.setState({ saving: false });
    }, 500);
  }

  set(fn) {
    this.setState(s => {
      const ns = fn(s);
      this._save(ns);
      return ns;
    });
  }

  ut(id, fn) {
    this.set(s => ({ ...s, territories: s.territories.map(t => t.id === id ? fn(t) : t) }));
  }

  addBid(tid, cl, sc) {
    this.ut(tid, t => {
      const newBid = { id: uid(), claimant: cl, seconder: sc, backing: [], rulerAdjust: 0 };
      const bids = [...t.bids, newBid];
      // Auto-add regent defensive bid if regent exists and not already bidding
      if (t.regent && !t.bids.some(b => b.claimant.trim().toLowerCase() === t.regent.trim().toLowerCase()) && cl.trim().toLowerCase() !== t.regent.trim().toLowerCase()) {
        const regBid = { id: uid(), claimant: t.regent, seconder: '(Regent — automatic)', backing: [], rulerAdjust: 0 };
        return { ...t, bids: [...bids, regBid] };
      }
      return { ...t, bids };
    });
  }

  rmBid(tid, bid) {
    this.ut(tid, t => ({ ...t, bids: t.bids.filter(b => b.id !== bid), resolved: false, winnerId: null }));
  }

  addBack(tid, bid, pl, amt) {
    this.ut(tid, t => ({ ...t, bids: t.bids.map(b => b.id === bid ? { ...b, backing: [...b.backing, { id: uid(), player: pl, amount: amt }] } : b) }));
  }

  rmBack(tid, bid, bk) {
    this.ut(tid, t => ({ ...t, bids: t.bids.map(b => b.id === bid ? { ...b, backing: b.backing.filter(x => x.id !== bk) } : b) }));
  }

  adj(tid, bid, d) {
    this.ut(tid, t => ({ ...t, bids: t.bids.map(b => b.id === bid ? { ...b, rulerAdjust: b.rulerAdjust + d } : b) }));
  }

  resolve(tid) {
    this.ut(tid, t => {
      if (!t.bids.length) return t;
      let best = null, bs = -Infinity, bestName = null;
      t.bids.forEach(b => {
        const def = t.regent && b.claimant.trim().toLowerCase() === t.regent.trim().toLowerCase();
        const sc = total(b) + (def ? 3 : 0);
        if (sc > bs) { bs = sc; best = b.id; bestName = b.claimant.trim(); }
      });
      return { ...t, resolved: true, winnerId: best, regent: bestName || t.regent, regentInput: bestName || t.regentInput };
    });
  }

  unres(tid) {
    this.ut(tid, t => ({ ...t, resolved: false, winnerId: null }));
  }

  reset() {
    const cur = this.state.territories;
    const ns = dflt();
    ns.territories = ns.territories.map(t => {
      const existing = cur.find(c => c.id === t.id);
      return existing ? { ...t, regent: existing.regent, regentInput: existing.regentInput } : t;
    });
    this.setState({ ...ns, modal: null, saving: false });
    try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch (e) { /* ignore */ }
  }

  render() {
    const { phase, peek, territories, modal, saving } = this.state;
    const totBids = territories.reduce((s, t) => s + t.bids.length, 0);
    const totInf = territories.reduce((s, t) => s + t.bids.reduce((s2, b) => s2 + b.backing.reduce((s3, bk) => s3 + bk.amount, 0), 0), 0);
    const res = territories.filter(t => t.resolved).length;
    const nextPhase = { open: 'Call Final Commitments', final: 'Reveal Tallies' };
    const prevPhase = { final: 'Re-open Bidding', reveal: 'Back to Final Commitments' };
    return h(window.React.Fragment, null,

      h('div', null,
        h('div', { className: 'toolbar' },
          h('div', { className: 'toolbar-l' },
            h('div', { className: 'phase-pill phase-' + phase }, h('span', { className: 'phase-dot' }), phase === 'open' ? 'Bidding Open' : phase === 'final' ? 'Final Commitments' : 'Tallies Revealed'),
            h('span', { className: 'save-dot ' + (saving ? 'save-busy' : 'save-ok') }, saving ? 'Saving\u2026' : 'Saved')
          ),
          h('div', { className: 'toolbar-r' },
            phase !== 'reveal' && h('button', { className: 'btn-primary btn-sm', onClick: () => this.set(s => ({ ...s, phase: phase === 'open' ? 'final' : 'reveal' })) }, nextPhase[phase]),
            phase === 'reveal' && h('button', { className: 'btn-sm', onClick: () => this.set(s => ({ ...s, phase: 'final' })) }, prevPhase.reveal),
            phase === 'final' && h('button', { className: 'btn-sm', onClick: () => this.set(s => ({ ...s, phase: 'open' })) }, prevPhase.final),
            h('button', { className: 'btn-danger btn-sm', onClick: () => this.reset() }, 'Reset All')
          )
        ),
        h('div', { className: 'summary' },
          h('div', { className: 'sum-item' }, h('div', { className: 'sum-val' }, totBids), h('div', { className: 'sum-lbl' }, 'Open Bids')),
          h('div', { className: 'sum-item' }, h('div', { className: 'sum-val' }, totInf), h('div', { className: 'sum-lbl' }, 'Influence In')),
          h('div', { className: 'sum-item' }, h('div', { className: 'sum-val' }, res + '/5'), h('div', { className: 'sum-lbl' }, 'Resolved'))
        ),
        h('div', { className: 'peek-strip' },
          h('div', { className: 'peek-info' }, h('strong', null, "Prince's Peek"), ' \u2014 show approximate tallies without revealing exact numbers'),
          h('label', { className: 'peek-toggle-label' },
            h('input', { type: 'checkbox', checked: peek, onChange: () => this.set(s => ({ ...s, peek: !s.peek })) }),
            peek ? 'Peek on (approximate)' : 'Peek off (exact)'
          )
        ),
        h('div', { className: 'terr-grid' },
          territories.map(t => h(TCard, {
            key: t.id, t, peek,
            onBid: () => this.setState({ modal: { type: 'bid', tid: t.id, tname: t.name } }),
            onBack: bid => this.setState({ modal: { type: 'back', tid: t.id, bid } }),
            onRmBack: (bid, bk) => this.rmBack(t.id, bid, bk),
            onAdj: (bid, d) => this.adj(t.id, bid, d),
            onRmBid: bid => { if (confirm('Remove this bid?')) this.rmBid(t.id, bid); },
            onResolve: () => this.resolve(t.id),
            onUnres: () => this.unres(t.id),
            onRegIn: v => this.ut(t.id, x => ({ ...x, regentInput: v })),
            onRegSet: v => this.ut(t.id, x => ({ ...x, regent: v, regentInput: v })),
          }))
        )
      ),
      modal && h(Modal, {
        modal, territories, onClose: () => this.setState({ modal: null }),
        onAddBid: (tid, cl, sc) => { this.addBid(tid, cl, sc); this.setState({ modal: null }); },
        onAddBack: (tid, bid, pl, am) => { this.addBack(tid, bid, pl, am); this.setState({ modal: null }); },
      })
    );
  }
}

// ══════════════════════════════════════════════
//  TERRITORY CARD
// ══════════════════════════════════════════════

function TCard({ t, peek, onBid, onBack, onRmBack, onAdj, onRmBid, onResolve, onUnres, onRegIn, onRegSet }) {
  const scores = t.bids.map(b => {
    const def = t.regent && b.claimant.trim().toLowerCase() === t.regent.trim().toLowerCase();
    return total(b) + (def ? 3 : 0);
  });
  const maxScore = Math.max(0, ...scores);
  const winner = t.resolved ? t.bids.find(b => b.id === t.winnerId) : null;
  return h('div', { className: 'tc' + (t.resolved ? ' tc-resolved' : '') },
    h('div', { className: 'tc-head' },
      h('span', { className: 'tc-name' }, t.name),
      t.regent && h('span', { className: 'regent-tag' }, 'Regent: ' + t.regent)
    ),
    h('div', { className: 'ambience-strip' },
      h('span', { className: 'amb-label' }, 'Ambience'),
      h('span', { className: 'amb-name' }, t.ambience || '\u2014'),
      h('span', { className: 'amb-mod ' + (t.ambienceMod > 0 ? 'amb-pos' : t.ambienceMod < 0 ? 'amb-neg' : 'amb-zero') },
        t.ambienceMod > 0 ? '+' + t.ambienceMod : String(t.ambienceMod)
      ),
      h('span', { className: 'amb-hint' }, 'vitae feeding')
    ),
    h('div', { className: 'regent-row' },
      h('span', { className: 'regent-lbl' }, 'Regent:'),
      h('select', { className: 'regent-sel', value: t.regent || '',
        onChange: ev => onRegSet(ev.target.value) },
        h('option', { value: '' }, '\u2014 none \u2014'),
        (window._charNames || []).map(n => h('option', { key: n, value: n }, n))
      )
    ),
    h('div', { className: 'tc-body' },
      t.bids.length === 0 ? h('div', { className: 'no-bids-msg' }, 'No bids declared yet.') :
      t.bids.map((bid, i) => {
        const def = t.regent && bid.claimant.trim().toLowerCase() === t.regent.trim().toLowerCase();
        const sc = scores[i];
        const isMax = sc === maxScore && sc > 0;
        const isWin = t.resolved && bid.id === t.winnerId;
        const isLose = t.resolved && bid.id !== t.winnerId;
        const { approx } = peekInfo(sc, bid.id);
        return h('div', { key: bid.id, className: 'bid' + (isWin ? ' bid-win' : isLose ? ' bid-lose' : '') },
          h('div', { className: 'bid-head' },
            h('div', null,
              h('div', { className: 'bid-claimant' }, bid.claimant),
              h('div', { className: 'bid-seconder' }, h('em', null, 'sec. '), bid.seconder),
              def && h('div', { className: 'defend-note' }, '+3 regent defence')
            ),
            h('div', { className: 'bid-score-block' },
              h('div', { className: 'bid-score ' + (isWin ? 's-win' : isMax ? 's-lead' : '') }, peek ? '~' + approx : sc),
              h('div', { className: 'bid-score-sub' }, peek ? 'approx.' : 'influence'),
              isWin && h('div', { className: 'win-badge' }, 'Winner')
            )
          ),
          bid.backing.length > 0 && h('div', { className: 'back-list' },
            bid.backing.map(bk => h('div', { key: bk.id, className: 'back-row' },
              h('span', { className: 'back-name' }, bk.player),
              h('div', { className: 'back-right' },
                h('span', { className: 'back-amt' }, '+' + bk.amount),
                !t.resolved && h('button', { className: 'back-del', onClick: () => onRmBack(bid.id, bk.id), title: 'Remove' }, '\u00d7')
              )
            ))
          ),
          !t.resolved && h('div', { className: 'ruler-row' },
            h('span', { className: 'ruler-lbl' }, "Ruler's adj."),
            h('button', { className: 'adj', onClick: () => onAdj(bid.id, -1) }, '\u2212'),
            !peek && h('span', { className: 'adj-val ' + (bid.rulerAdjust > 0 ? 'av-pos' : bid.rulerAdjust < 0 ? 'av-neg' : 'av-zero') }, (bid.rulerAdjust >= 0 ? '+' : '') + bid.rulerAdjust),
            peek && h('span', { className: 'adj-val av-zero' }, '\u00b7'),
            h('button', { className: 'adj', onClick: () => onAdj(bid.id, +1) }, '+'),
            !peek && bid.rulerAdjust !== 0 && h('button', { className: 'btn-sm', style: { padding: '3px 8px', marginLeft: 4 }, onClick: () => onAdj(bid.id, -bid.rulerAdjust) }, 'Reset')
          ),
          !t.resolved && h('div', { className: 'bid-acts' },
            h('button', { className: 'btn-primary btn-sm', onClick: () => onBack(bid.id) }, '+ Influence'),
            h('button', { className: 'btn-danger btn-sm', onClick: () => onRmBid(bid.id) }, 'Remove')
          )
        );
      })
    ),
    !t.resolved && h('div', { className: 'tc-foot' },
      h('button', { style: { flex: 1 }, onClick: onBid }, '+ Open Bid'),
      t.bids.length >= 1 && h('button', { className: 'btn-primary', style: { flex: 1 }, onClick: onResolve }, t.bids.length === 1 ? 'Resolve (uncontested)' : 'Resolve')
    ),
    t.resolved && h('div', { className: 'res-bar' },
      h('span', null, winner ? winner.claimant + ' seizes the territory' : 'No winner'),
      h('button', { className: 'btn-sm', style: { color: 'var(--text3)', borderColor: 'var(--text3)' }, onClick: onUnres }, 'Reopen')
    )
  );
}

// ══════════════════════════════════════════════
//  MODAL
// ══════════════════════════════════════════════

function Modal({ modal, territories, onClose, onAddBid, onAddBack }) {
  const [vals, setV] = useState({});
  const [err, setE] = useState('');
  const set = k => ev => setV(p => ({ ...p, [k]: ev.target.value }));
  const terr = territories.find(t => t.id === modal.tid);
  const bid = modal.type === 'back' ? terr?.bids.find(b => b.id === modal.bid) : null;
  const names = window._charNames || [];
  const selStyle = { width: '100%', background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: '4px', color: 'var(--txt2)', fontFamily: 'var(--fh)', fontSize: '12px', padding: '6px 8px', outline: 'none' };
  const charSel = (k, lbl) => h('div', { className: 'field' },
    h('label', null, lbl),
    h('select', { value: vals[k] || '', onChange: set(k), style: selStyle },
      h('option', { value: '' }, '\u2014 select \u2014'),
      names.map(n => h('option', { key: n, value: n }, n))
    )
  );
  const submit = () => {
    if (modal.type === 'bid') {
      if (!vals.cl) return setE('Claimant required.');
      if (!vals.sc) return setE('Seconder required.');
      onAddBid(modal.tid, vals.cl, vals.sc);
    } else {
      if (!vals.pl) return setE('Player name required.');
      const a = parseInt(vals.am); if (!a || a < 1) return setE('Enter a positive amount.');
      onAddBack(modal.tid, modal.bid, vals.pl, a);
    }
  };
  return h('div', { className: 'overlay', onClick: ev => ev.target === ev.currentTarget && onClose() },
    h('div', { className: 'modal' },
      h('div', { className: 'modal-title' }, modal.type === 'bid' ? 'New Bid \u2014 ' + modal.tname : 'Add Influence \u2014 ' + (bid?.claimant || '')),
      h('div', { className: 'modal-sub' }, modal.type === 'bid' ? 'Claimant and seconder must hold City Status 2 or higher.' : 'Enter the player committing influence to this bid.'),
      modal.type === 'bid' ? h(window.React.Fragment, null,
        charSel('cl', 'Claimant'),
        charSel('sc', 'Seconder')
      ) : h(window.React.Fragment, null,
        charSel('pl', 'Player / Character'),
        h('div', { className: 'field' }, h('label', null, 'Influence Amount'), h('input', { type: 'number', min: 1, placeholder: '0', value: vals.am || '', onChange: set('am'), style: { ...selStyle, boxSizing: 'border-box' } }))
      ),
      err && h('div', { className: 'modal-err' }, err),
      h('div', { className: 'modal-btns' },
        h('button', { onClick: onClose }, 'Cancel'),
        h('button', { className: 'btn-primary btn-sm', onClick: submit }, modal.type === 'bid' ? 'Open Bid' : 'Add Influence')
      )
    )
  );
}

// ══════════════════════════════════════════════
//  MOUNT
// ══════════════════════════════════════════════

let _terrMounted = false;

export function mountTerr() {
  if (_terrMounted) return;
  _terrMounted = true;
  const el = document.getElementById('terr-root');
  if (el && window.ReactDOM) window.ReactDOM.createRoot(el).render(window.React.createElement(App));
}
