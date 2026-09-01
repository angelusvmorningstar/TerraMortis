(function () {
  'use strict';

  // ── theme toggle (mockup-only convenience — the real app has no in-app toggle) ──
  var THEME_KEY = 'roller-live-theme';
  var root = document.documentElement;
  var themeToggle = document.getElementById('themeToggle');
  var themeToggleLabel = document.getElementById('themeToggleLabel');

  function applyTheme(theme) {
    if (theme === 'light') root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');
    themeToggleLabel.textContent = theme === 'light' ? 'Light' : 'Dark';
  }
  var savedTheme = null;
  try { savedTheme = localStorage.getItem(THEME_KEY); } catch (e) { /* ignore */ }
  applyTheme(savedTheme || 'dark');
  themeToggle.addEventListener('click', function () {
    var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
  });

  // ── viewer-role toggle — simulates "ST or Rules-ordeal-approved" gating, since this mockup
  // has no real login/role session. A character's OWN rules-ordeal completion (real fixture
  // data) can independently unlock the gate regardless of this toggle. ──
  var roleToggle = document.getElementById('roleToggle');
  var roleToggleLabel = document.getElementById('roleToggleLabel');
  var viewerRole = 'player';
  function setRole(role) {
    viewerRole = role;
    roleToggleLabel.textContent = role === 'st' ? 'Viewing as ST' : 'Viewing as Player';
    render();
  }
  roleToggle.addEventListener('click', function () {
    setRole(viewerRole === 'st' ? 'player' : 'st');
  });

  // ── real dice engine, ported faithfully from public/js/shared/dice.js and the resolution
  // branches in public/js/suite/roll-v2.js's doRoll() — same math, same thresholds, same
  // exceptional/dramatic-failure rules. Kept as pure functions, no shared-state coupling. ──
  function d10() { return Math.floor(Math.random() * 10) + 1; }
  function mkDie(v, again, na) { return { v: v, s: v >= 8, x: !na && v >= again }; }
  function mkChain(rv, again, na) {
    var r = mkDie(rv, again, na);
    var ch = [];
    if (!na) {
      var l = r;
      while (l.x) { var c = mkDie(d10(), again, na); ch.push(c); l = c; }
    }
    return { r: r, ch: ch };
  }
  function rollPool(n, again, na) {
    var c = [];
    for (var i = 0; i < n; i++) c.push(mkChain(d10(), again, na));
    return c;
  }
  function cntSuc(cols) {
    var s = 0;
    cols.forEach(function (col) {
      if (col.r.s) s++;
      col.ch.forEach(function (d) { if (d.s) s++; });
    });
    return s;
  }

  // Renders one column per die rolled, with any "again"-triggered rerolls chained beneath the
  // die that spawned them — the real app's own dice-result display, not just a success count.
  function renderDiceTiles(cols) {
    if (!cols || !cols.length) return '';
    return '<div class="dice-cols">' + cols.map(function (col) {
      var rCls = col.r.dram ? ' die-tile--dram' : col.r.s ? ' die-tile--success' : '';
      var chainHtml = col.ch.map(function (d) {
        return '<div class="die-connector"></div>' +
          '<div class="die-tile die-tile--chained' + (d.s ? ' die-tile--success' : '') + '">' + d.v + '</div>';
      }).join('');
      return '<div class="die-col">' +
        '<div class="die-tile' + rCls + '">' + col.r.v + '</div>' +
        chainHtml +
        '</div>';
    }).join('') + '</div>';
  }

  // ── Lashing Out with the Beast — Vampire the Requiem 2e core rulebook p.91-92. Pool is
  // Blood Potency + a Power Attribute, which one set by which of the three Beast aspects the
  // player picks (the "which beast" #1039 named — not "which discipline", that summary was
  // wrong). Real universal Hungry/Starving Vitae thresholds are p.~124's frenzy-adjacent
  // Conditions table, referenced by the Predatory Aura modifier table on p.91: Hungry (≤4
  // Vitae) +1, Starving (≤2 Vitae) +2 to the aggressor's own predatory-aura roll (a bonus here,
  // not the frenzy-resistance penalty the same states apply elsewhere).
  // Specific exception (per the ST): this Attribute component pools off INHERENT dots, not
  // effective — see attrInherentDots(). Every other pool in this app uses effective dots; do
  // not "fix" this to match without re-confirming the rule.
  var LASHING_OUT_ASPECTS = [
    { key: 'monstrous', label: 'Monstrous', attrName: 'Strength', desc: 'Beast-As-Destroyer. Growls, threatens, gnashes teeth. Causes the Bestial Condition.' },
    { key: 'seductive', label: 'Seductive', attrName: 'Presence', desc: 'Beast-As-Tempter. Sidles up to prey, whispers beautiful lies. Causes the Wanton Condition.' },
    { key: 'competitive', label: 'Competitive', attrName: 'Intelligence', desc: 'Beast-As-Alpha. Draws a line in the sand, announces terms. Causes the Competitive Condition.' },
  ];
  var HUNGRY_VITAE = 4, STARVING_VITAE = 2;

  // ── Detecting Blood Sympathy — Vampire the Requiem 2e core rulebook p.98-99. Pool is
  // Wits + Blood Potency; the four relation "steps removed" (p.98-99) each add their own flat
  // die bonus, chosen once when the roll is built (a real branching choice, not a continuous
  // modifier) — same pattern as Lashing Out's aspect pick. Detecting cannot dramatically fail
  // (p.99, explicit rule) regardless of pool size.
  var BLOOD_SYMPATHY_TIERS = [
    { key: 'once', label: 'Once Removed', sub: 'Sire or childe', mod: 3 },
    { key: 'twice', label: 'Twice Removed', sub: 'Sibling, grandsire, or grandchilde', mod: 2 },
    { key: 'thrice', label: 'Thrice Removed', sub: "Cousin, sire's sibling, or great-grandsire/childe", mod: 1 },
    { key: 'four', label: 'Four Times Removed', sub: 'Clanmate', mod: 0 },
  ];

  // ── Resist Blood Bond — Vampire the Requiem 2e core rulebook p.99-100. Pool is Blood Potency
  // minus the number of Vitae ingested — TWO distinct factors are in play, and they are NOT the
  // same thing:
  //   (1) how much Vitae was drunk in THIS single drinking experience — a real, one-time choice
  //       (the rule's actual roll penalty: "minus the number of Vitae ingested"), so it belongs
  //       in a pop-up like Lashing Out's aspect or Blood Sympathy's relation tier;
  //   (2) how many times they've fed from this SAME source before — a running count across a
  //       scene/story, driving the cumulative -1 for repeated resistance attempts against the
  //       same vampire. That's the separate "Prior resistance (this regnant)" inline stepper
  //       below — not a one-time pick, so it stays live on the built card.
  // Earlier version of this wrongly conflated the two, labelling the Vitae-amount picker
  // "First/Second/Third drink" as if the amount always matched which numbered feeding this was.
  // The rulebook never says that — the two are independent.
  var RESIST_BOND_VITAE_OPTIONS = [
    { key: '1', label: '1 Vitae', vitae: 1 },
    { key: '2', label: '2 Vitae', vitae: 2 },
    { key: '3', label: '3 Vitae', vitae: 3 },
  ];

  // ── Humanity Check (resisting detachment at a Breaking Point) — core rulebook p.107-108,
  // dice pool overridden by Terra Mortis' own errata (Terra Mortis - Errata Master.md,
  // "DETACHMENT"): "4 dice − (Current Humanity − Breaking Point Level) + Touchstone modifiers",
  // replacing the core book's old flat table (Five Dice at Humanity 10, down to Zero at
  // Humanity 1) entirely. A breaking point only applies "at her Humanity level, or lower"
  // (p.107) — levels above the character's own current Humanity aren't valid triggers, so the
  // picker below disables them rather than pretending they're selectable.
  //
  // Touchstones (p.87-88, modifiers p.107-108): a Touchstone is ATTACHED only when the
  // character's current Humanity is at or above the dot it's written next to — drop below that
  // dot and the same Touchstone is DETACHED and grants nothing until Humanity is regained.
  // Suggested modifiers: one attached Touchstone +2, multiple attached +3, NO Touchstones at
  // all -2. Having Touchstones that are all currently detached is its own real case the
  // suggested-modifiers table doesn't name outright — it's neither "no Touchstones" (there
  // are some) nor "an attached Touchstone" (none currently are), so it nets +0 here rather than
  // guessing it into one of the other two rows.
  var HUMANITY_CHECK_LEVELS = [
    { level: 10, examples: ['One night without human contact', 'Lying in defense of the Masquerade', 'Spending more than one Vitae in a night'] },
    { level: 9, examples: ['Watching humans eat a meal', 'Committing a superhuman feat of physical prowess', 'Feeding from the unwilling or unknowing', "Urging another's behavior with a Discipline", 'Spending an hour in the sun'] },
    { level: 8, examples: ['Creating a ghoul', 'Rejected by a human', 'Riding the wave of frenzy', 'Depriving another of consent with a Discipline', 'Spending most of a day in the sun'] },
    { level: 7, examples: ['One week active without human contact', 'Surviving something that would hospitalize a human', 'Injuring someone over blood'] },
    { level: 6, examples: ['Falling into torpor', 'Feeding from a child', 'Reading your own obituary', 'Experiencing a car crash or other immense physical trauma'] },
    { level: 5, examples: ['Two weeks active without human contact', 'Reaching Blood Potency 3', 'Death of a mortal family member', 'Joining a covenant to the point of gaining Status for it'] },
    { level: 4, examples: ['Learning a dot of Cruac', 'Impassioned violence', 'Spending a year or more in torpor', 'Surviving a century', 'Accidentally killing'] },
    { level: 3, examples: ['One month active without human contact', 'Reaching Blood Potency 6', 'Death of a mortal spouse or child', 'Impassioned killing'] },
    { level: 2, examples: ['One year active without human contact', 'Premeditated killing', "Seeing a culture that didn't exist when you were alive", 'Surviving 500 years', 'Creating a revenant'] },
    { level: 1, examples: ['One decade active without human contact', 'Heinous, spree, or mass murder', 'Killing your Touchstone'] },
  ];

  // ── Clash of Wills — Vampire the Requiem 2e core rulebook p.125-126, no house errata for it
  // (checked). When two Disciplines directly oppose each other (e.g. Auspex vs Obfuscate) and
  // neither Discipline's own system resolves it, all sides enter a contested roll-off: each
  // pools Blood Potency + dots in the Discipline fueling their side (Devotions use Blood
  // Potency + the highest-rated prerequisite Discipline; blood sorcery uses Blood Potency +
  // Cruac/Theban dots — Yusuf has neither, so this mockup only offers his three real
  // Disciplines). Ties reroll until someone pulls ahead of everyone else. This app already has
  // a generic Contested Roll toggle + resistance-pool stepper on every item, and a clash IS
  // just a contested roll, so this special only needs to build the correct base pool — the
  // existing Contested Roll control handles the actual roll-off, same as any other roll.
  // Effective dots (not inherent) — no exception was called out for this one, unlike Lashing
  // Out's Attribute component.
  var CLASH_DURATION_OPTIONS = [
    { key: 'instant', label: 'Instant or scene-long', bonus: 0 },
    { key: 'night', label: 'Night-long', bonus: 1 },
    { key: 'week', label: 'Week-long', bonus: 2 },
    { key: 'month', label: 'Month-long', bonus: 3 },
    { key: 'year', label: 'Year or longer', bonus: 4 },
  ];

  // ── Resisting Frenzy — Vampire the Requiem 2e core rulebook p.103-104, no house errata
  // override for the base formula (checked — only scattered specific triggers like stun guns
  // and pepper spray, not a replacement pool). Pool is Resolve + Composure, reflexive. The full
  // real Suggested Modifiers table (p.104) is below, as toggleable chips — Hungry/Starving are
  // deliberately left OUT of this list and applied automatically from live Vitae instead (see
  // frenzyHungerPenalty()), matching how Lashing Out already auto-derives its own Hungry/
  // Starving bonus rather than making the player toggle something the character sheet already
  // answers. Note this is the OTHER context CLAUDE.md's Lashing Out comment references: same
  // Hungry/Starving states, a bonus there (+1/+2), a penalty here (-2/-4) — not the same number
  // reused, a genuinely different mechanical effect per rule.
  var FRENZY_MODIFIERS = [
    { key: 'dead-friend', label: 'Dead friend', value: -2 },
    { key: 'dead-lover', label: 'Dead lover', value: -4 },
    { key: 'destroyed-important-property', label: 'Destruction of important property', value: -1 },
    { key: 'destroyed-minor-property', label: 'Destruction of minor property', value: 1 },
    { key: 'expecting-provocation', label: 'Expecting provocation', value: 1 },
    { key: 'hurt-friend', label: 'Hurt friend', value: -1 },
    { key: 'hurt-lover', label: 'Hurt lover', value: -2 },
    { key: 'burning-building', label: 'Inside burning building', value: -4 },
    { key: 'insulted-superior', label: 'Insulted by a superior', value: -1 },
    { key: 'insulted-inferior', label: 'Insulted by an inferior', value: -2 },
    { key: 'elysium-grounds', label: 'On Elysium grounds', value: 2 },
    { key: 'provocation-touchstone', label: 'Provocation was Touchstone', value: 2 },
    { key: 'publicly-ostracized', label: 'Publicly ostracized', value: -2 },
    { key: 'trivial-wound-seen', label: 'Seeing a trivial open wound', value: 1 },
    { key: 'massive-wound-seen', label: 'Seeing a massive open wound', value: -1 },
    { key: 'small-fire', label: 'Small fire (torch)', value: -2 },
    { key: 'sunlight-aggravated', label: 'Sunlight (causing aggravated damage)', value: -3 },
    { key: 'sunlight-lethal', label: 'Sunlight (causing lethal damage)', value: -1 },
    { key: 'surprised', label: 'Surprised by provocation', value: -1 },
    { key: 'wounded', label: 'Wounded (at all)', value: -1 },
    { key: 'wounded-last-three', label: 'Wounded in last three Health boxes', value: -3 },
  ];

  // ── Defensive Reaction (generic contested-defence pool, CRD mockup, 2026-08-22) — the
  // Mental/Social/Physical choice loads Resolve/Composure/Stamina respectively, which is the
  // Resistance Attribute for that category (Vampire the Requiem 2e Rulebook, "Attributes":
  // "Mental, Physical, and Social" × Power/Finesse/Resistance). It's a LIVE, re-pickable choice
  // (a defender might face a Mental contest one moment and a Physical one the next), not a
  // one-time setup — so per this session's established rule, it's an inline segmented control
  // on a single always-present item, not a launcher+modal producing separate persistent cards.
  var DEFENSE_ASPECTS = {
    mental:   { label: 'Mental',   attrName: 'Resolve',   rowIdx: 0 },
    physical: { label: 'Physical', attrName: 'Stamina',   rowIdx: 1 },
    social:   { label: 'Social',   attrName: 'Composure', rowIdx: 2 },
  };

  // ── data + render ──
  var appEl = document.getElementById('app');
  var state = {
    data: null,
    selectedId: null,
    meritOn: {},
    specOn: {},
    rulesOpen: {},
    breakdownOpen: {},
    sectionOpen: { secQueue: true, secSkills: false, secDisc: false, secSpecial: false },
    // ── CRD mockup: contested-roll queue + challenge panel (party-mode scoping, 2026-08-22) ──
    // Demonstrates the routing mechanism from specs/epic-crd-contested-roll-defence.md against
    // two real, independent "devices" (duo.html's two iframes, or two tabs on ?as=<name>).
    // Not a production implementation — see that epic's crd.1/crd.2.
    queue: [],              // this device's pending/recently-resolved incoming challenges, polled
    roster: [],             // other real fixture characters, for the "Challenge a player" picker
    challengeTarget: null,  // currently-picked target name in the Challenge panel's select
    challengeSentLabel: null, // transient confirmation text after sending a challenge
    freeBuildItem: null,   // the synthetic item built by the Free Build flow, once completed
    fb: { open: false, step: 1, attr: null, skill: null, disc: null },
    lo: { open: false, step: 'aspect', aspectKey: null },  // Lashing Out aspect + target picker popup
    lashingOutItems: {},  // built Lashing Out items, keyed by aspect — 'lashout-monstrous' etc.
    territoryDots: {},    // per-item Feeding Ground dots (Lashing Out "on your territory" bonus)
    repeatTarget: {},     // per-item "targeted this victim already this scene" count (−1 each)
    targetKindred: {},    // per-item: true = target is Kindred (costs 1 WP), false = mortal (free)
    bs: { open: false, step: 'tier', tierKey: null },  // Detecting Blood Sympathy relation + force picker popup
    bloodSympathyItems: {},  // built Blood Sympathy items, keyed by relation tier — 'bloodsym-once' etc.
    bsForced: {},         // per-item: true = forced detection targeting a specific relative (costs 1 WP)
    rb: { open: false },  // Resist Blood Bond Vitae-amount picker pop-up
    resistBondItems: {},  // built Resist Blood Bond items, keyed by Vitae amount — 'resistbond-1' etc.
    bondResistCount: {},  // per-item prior resistance attempts vs the same regnant (cumulative -1 each)
    hc: { open: false, step: 'grid', level: null },  // Humanity Breaking Point level picker pop-up
    humanityCheckItems: {},  // built Humanity Check items, keyed by level — 'humanitycheck-7' etc.
    banesTaken: {},        // per-item banes already taken (cumulative -1 each, max 3)
    situational: {},       // per-item: 'none' | 'masquerade' (-1) | 'requiem' (+1)
    cw: { open: false, step: 'power', discName: null },  // Clash of Wills power + duration picker pop-up
    clashOfWillsItems: {},  // built Clash of Wills items, keyed by discipline + duration
    presentAware: {},       // per-item: physically present & aware of the clash (gates WP+3), default true
    frenzyModOn: {},         // per-item: which Suggested Modifier chips (p.104) are toggled on, keyed by 'itemId::modKey'
    frenzyTurnsHeld: {},     // per-item: Willpower points already spent holding off the Beast (+1 die each, p.104)
    defenseAspect: 'mental', // 'mental' | 'social' | 'physical' — which Resistance Attribute currently feeds Defensive Reaction
    indomitableOn: {},       // per-item: Indomitable merit toggle (+2 dice, p.211 — only offered if the character actually has the merit)
    closedBookOn: {},        // per-item: Closed Book merit toggle (+dots, docs/merits/CoD Core Merits.md — only offered if the character actually has it)
    base: {},        // per-item BASE override (defaults to item.base)
    mod: {},         // per-item MOD stepper (defaults to 0)
    again: {},       // per-item Again threshold: 10 | 9 | 8 | 'none'
    rote: {},        // per-item Rote toggle
    wp: {},           // per-item WP(+3) toggle
    contested: {},   // per-item contested-mode toggle
    resistPool: {},  // per-item resistance pool size, when contested
    willpowerCurrent: null,
    vitaeCurrent: null,
    lastResult: null,
    history: [],
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function initials(name) {
    return String(name).split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
  }

  // A pool of 0 or lower is just a chance die (one die, only a 10 succeeds) — "0" reads as
  // "zero dice," not "chance die," so any headline/preview pool number shows "Chance" instead.
  function poolDisplay(n) {
    return n <= 0 ? 'Chance' : String(n);
  }

  // "Cost: 1 V  •  Pool: 12  v highest Composure + BP  •  Contested  •  Scene" -> parts array
  function parseStats(stats) {
    if (!stats) return { costText: null, vitaeCost: 0, meta: [] };
    var parts = stats.split('•').map(function (s) { return s.trim(); }).filter(Boolean);
    var costPart = parts.find(function (p) { return /^Cost:/i.test(p); }) || null;
    var meta = parts.filter(function (p) { return p !== costPart && !/^Pool:/i.test(p); });
    var vitaeCost = 0;
    if (costPart) {
      var m = costPart.match(/(\d+)\s*V\b/);
      if (m) vitaeCost = parseInt(m[1], 10);
    }
    return { costText: costPart ? costPart.replace(/^Cost:\s*/i, '') : null, vitaeCost: vitaeCost, meta: meta };
  }

  function specKey(itemId, specName) { return itemId + '::' + specName; }

  function canSeeAdvanced() {
    return viewerRole === 'st' || (state.data && state.data.character.rulesOrdealComplete);
  }

  function getBase(item) { return state.base[item.id] != null ? state.base[item.id] : item.base; }
  function getMod(item) { return state.mod[item.id] || 0; }
  function getAgain(item) {
    if (state.again[item.id] != null) return state.again[item.id];
    return item.nineAgain ? 9 : 10;
  }

  function chipBonus(item) {
    var bonus = item.merit && state.meritOn[item.id] ? item.merit.bonus : 0;
    if (item.specs) {
      item.specs.forEach(function (s) {
        if (state.specOn[specKey(item.id, s)]) bonus += 1;
      });
    }
    return bonus;
  }

  // Hungry/Starving is derived from real live Vitae — not a toggle, the player can't choose it.
  function hungerBonus() {
    if (state.vitaeCurrent <= STARVING_VITAE) return 2;
    if (state.vitaeCurrent <= HUNGRY_VITAE) return 1;
    return 0;
  }

  function lashingOutBonus(item) {
    if (item.rulesKind !== 'lashout') return 0;
    var territory = state.territoryDots[item.id] || 0;
    var repeats = state.repeatTarget[item.id] || 0;
    return hungerBonus() + territory - repeats;
  }

  // Resist Blood Bond (p.99-100): the Vitae-ingested penalty is chosen once, in the pop-up, and
  // folded straight into the built item's base (same pattern as Lashing Out's BP+Attribute).
  // Only the running "prior resistance vs this regnant" count applies live, here.
  function resistBondBonus(item) {
    if (item.rulesKind !== 'resistbond') return 0;
    return -(state.bondResistCount[item.id] || 0);
  }

  // Touchstone modifier for Humanity Checks (p.87-88, p.107-108) — attached vs detached, per
  // the character's REAL current Humanity against each real Touchstone's written dot slot.
  // Baked into a built item's base at pick time (same pattern as Lashing Out's Attribute), since
  // it's derived from static sheet data, not something that changes mid-session here.
  function touchstoneModifier() {
    var touchstones = (state.data.character.touchstones || []);
    if (touchstones.length === 0) return -2;
    var attached = touchstones.filter(function (t) { return t.humanity <= state.data.character.humanityCurrent; }).length;
    if (attached >= 2) return 3;
    if (attached === 1) return 2;
    return 0; // has Touchstones, but none are currently attached — not the same as "no Touchstones"
  }

  // Humanity Check (p.107-108): banes taken and the Masquerade/Requiem situational modifier are
  // both live, per-roll factors — not one-time picks — so they stay inline on the built card,
  // same shape as Resist Blood Bond's "prior resistance" stepper.
  function humanityCheckBonus(item) {
    if (item.rulesKind !== 'humanitycheck') return 0;
    var banes = state.banesTaken[item.id] || 0;
    var sit = state.situational[item.id] || 'none';
    var sitMod = sit === 'masquerade' ? -1 : sit === 'requiem' ? 1 : 0;
    return -banes + sitMod;
  }

  // Frenzy's own Hungry (-2) / Starving (-4) penalty (p.104) — a different mechanical effect
  // from Lashing Out's Predatory Aura bonus (+1/+2) for the exact same live-Vitae states, so
  // it's a separate function, not a reuse of hungerBonus().
  function frenzyHungerPenalty() {
    if (state.vitaeCurrent <= STARVING_VITAE) return -4;
    if (state.vitaeCurrent <= HUNGRY_VITAE) return -2;
    return 0;
  }

  function frenzyModBonus(item) {
    if (item.rulesKind !== 'resistfrenzy') return 0;
    var sum = frenzyHungerPenalty();
    FRENZY_MODIFIERS.forEach(function (m) {
      if (state.frenzyModOn[item.id + '::' + m.key]) sum += m.value;
    });
    sum += state.frenzyTurnsHeld[item.id] || 0;
    return sum;
  }

  // Indomitable (••, p.211, Resolve ••• prereq): "Any time a supernatural creature uses a power
  // to influence your character's thoughts or emotions, add a +2 die bonus to the dice pool to
  // contest it." Only offered on Defensive Reaction, and only if the character actually has the
  // merit — checked server-side (character.hasIndomitable), never assumed.
  function indomitableBonus(item) {
    if (item.rulesKind !== 'defensivereact') return 0;
    if (!state.data || !state.data.character.hasIndomitable) return 0;
    return state.indomitableOn[item.id] ? 2 : 0;
  }

  // Closed Book (docs/merits/CoD Core Merits.md, not a core-rulebook merit): "add her dots in
  // this Merit... to any contested rolls" resisting attempts to uncover her true feelings,
  // motives, or position — scales with dots, unlike Indomitable's flat +2. The merit's own text
  // is explicitly conditional for supernatural effects ("At the Storyteller's discretion... it
  // wouldn't affect someone looking at her aura, since she cannot manipulate her spiritual
  // resonance") — this toggle doesn't know WHICH power triggered the contest, so it's offered
  // whenever the character has the merit and left to the same human judgement call every other
  // situational chip in this mockup already trusts the player/ST to make.
  function closedBookBonus(item) {
    if (item.rulesKind !== 'defensivereact') return 0;
    if (!state.data || !state.data.character.closedBookDots) return 0;
    return state.closedBookOn[item.id] ? state.data.character.closedBookDots : 0;
  }

  // The real general Willpower rule (Rulebook, "Willpower"): "Spending a point of Willpower adds
  // a +3 die bonus to most dice pools, or +2 to a Resistance trait." Defensive Reaction's base IS
  // a bare Resistance Attribute (Resolve/Stamina/Composure), so it gets the +2 case, not +3.
  // Every other item on this mockup uses a Discipline pool, an Attribute Task, or a Discipline+
  // Blood Potency pool — none of those are "a Resistance trait" alone — so they keep +3.
  function wpBonusFor(item) {
    return item.rulesKind === 'defensivereact' ? 2 : 3;
  }

  function currentEffective(item) {
    if (!item) return 0;
    var eff = getBase(item) + getMod(item) + chipBonus(item) + lashingOutBonus(item) + resistBondBonus(item) + humanityCheckBonus(item) + frenzyModBonus(item) + indomitableBonus(item) + closedBookBonus(item);
    // Willpower may not be spent to improve a Humanity Check's pool (p.108, explicit rule), nor
    // a Resisting Frenzy roll (p.104) — Willpower has a different effect there instead
    // (frenzyModBonus() already folds in +1 per turn held off).
    if (state.wp[item.id] && item.rulesKind !== 'humanitycheck' && item.rulesKind !== 'resistfrenzy') eff += wpBonusFor(item);
    return eff;
  }

  function abbr3(name) { return name.slice(0, 3); }

  // Builds the synthetic pool item once all three Free Build steps are resolved (discipline is
  // optional — a plain Attribute+Skill pool is a completely valid roll on its own).
  function finishFreeBuild() {
    var attr = state.fb.attr, skill = state.fb.skill, disc = state.fb.disc;
    var base = attr.value + skill.value + (disc ? disc.value : 0);
    var nameParts = [attr.name, skill.name];
    if (disc) nameParts.push(disc.name);
    var formulaParts = [abbr3(attr.name), abbr3(skill.name)];
    if (disc) formulaParts.push(abbr3(disc.name));
    state.freeBuildItem = {
      id: 'freebuild',
      kind: 'skill',
      name: nameParts.join(' + '),
      formula: formulaParts.join('+'),
      fullFormula: nameParts.join(' + '),
      base: base,
      specs: skill.specs || [],
      nineAgain: !!skill.nineAgain,
      merit: null,
    };
    state.selectedId = 'freebuild';
    state.fb = { open: false, step: 1, attr: null, skill: null, disc: null };
    render();
  }

  function renderFreeBuildModal() {
    if (!state.fb.open || !state.data) return '';
    var fb = state.data.freeBuild;
    var step = state.fb.step;
    var title = step === 1 ? 'Attribute' : step === 2 ? 'Skill' : 'Discipline';
    var gridHtml;

    if (step === 1) {
      gridHtml = '<div class="fb-grid fb-grid--3">' + fb.attributeGrid.map(function (row) {
        return row.map(function (a) {
          return '<button class="fb-cell" data-fb-pick="attr" data-fb-name="' + esc(a.name) + '" type="button">' +
            '<span class="fb-cell-name">' + esc(abbr3(a.name).toUpperCase()) + '</span>' +
            '<span class="fb-cell-val">' + a.value + '</span>' +
            '</button>';
        }).join('');
      }).join('') + '</div>';
    } else if (step === 2) {
      gridHtml =
        '<div class="fb-grid fb-grid--3">' + fb.skillGrid.map(function (s) {
          return '<button class="fb-cell" data-fb-pick="skill" data-fb-name="' + esc(s.name) + '" type="button">' +
            '<span class="fb-cell-name">' + esc(s.name) + '</span>' +
            '<span class="fb-cell-val">' + s.value + '</span>' +
            '</button>';
        }).join('') + '</div>' +
        // Real VtR 2e rule: an unskilled roll (0 dots) takes a penalty — Mental skills are
        // steeper (-3) than Physical/Social (-1), same split dice-engine.js's own auto-penalty
        // logic already uses. Two fixed buttons rather than 15 near-duplicate 0-dot skill
        // cells for every skill this character has no dots in.
        '<div class="fb-grid fb-grid--2">' +
        '<button class="fb-cell fb-cell--unskilled" data-fb-pick="skill-unskilled" data-fb-penalty="-3" data-fb-unskilled-name="Unskilled (Mental)" type="button">' +
        '<span class="fb-cell-name">Unskilled (Mental)</span><span class="fb-cell-val">&minus;3</span>' +
        '</button>' +
        '<button class="fb-cell fb-cell--unskilled" data-fb-pick="skill-unskilled" data-fb-penalty="-1" data-fb-unskilled-name="Unskilled" type="button">' +
        '<span class="fb-cell-name">Unskilled (Other)</span><span class="fb-cell-val">&minus;1</span>' +
        '</button>' +
        '</div>';
    } else {
      gridHtml = '<div class="fb-grid fb-grid--flex">' +
        fb.disciplineGrid.map(function (dd) {
          return '<button class="fb-cell" data-fb-pick="disc" data-fb-name="' + esc(dd.name) + '" type="button">' +
            '<span class="fb-cell-name">' + esc(dd.name) + '</span>' +
            '<span class="fb-cell-val">' + dd.value + '</span>' +
            '</button>';
        }).join('') +
        '<button class="fb-cell fb-cell--skip" data-fb-pick="disc-skip" type="button">' +
        '<span class="fb-cell-name">No Discipline</span>' +
        '</button>' +
        '</div>';
    }

    var running = [];
    if (state.fb.attr) running.push(state.fb.attr.name + ' ' + state.fb.attr.value);
    if (state.fb.skill) running.push(state.fb.skill.name + ' ' + state.fb.skill.value);
    if (state.fb.disc) running.push(state.fb.disc.name + ' ' + state.fb.disc.value);

    return (
      '<div class="fb-overlay">' +
      '<div class="fb-modal">' +
      '<div class="fb-modal-head">' +
      '<div>' +
      '<span class="fb-modal-step">Step ' + step + ' of 3</span>' +
      '<h2 class="fb-modal-title">' + title + '</h2>' +
      '</div>' +
      '<button class="fb-close" id="fbClose" type="button" aria-label="Close">&times;</button>' +
      '</div>' +
      (running.length ? '<div class="fb-running">' + running.map(function (r) { return '<span>' + esc(r) + '</span>'; }).join('') + '</div>' : '') +
      '<div class="fb-body">' + gridHtml + '</div>' +
      '<div class="fb-footer">' +
      (step > 1 ? '<button class="fb-back" id="fbBack" type="button">Back</button>' : '<span></span>') +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  function attrValue(name) {
    var flat = state.data.freeBuild.attributeGrid[0].concat(state.data.freeBuild.attributeGrid[1], state.data.freeBuild.attributeGrid[2]);
    var a = flat.find(function (x) { return x.name === name; });
    return a ? a.value : 0;
  }

  // Inherent dots only (bonus stripped) — Lashing Out with the Beast is a specific rules
  // exception that pools off inherent Attribute dots, not effective. Every other pool in this
  // mockup (Free Build included) should keep using attrValue()'s effective dots — do not reuse
  // this for anything else without re-confirming the rule.
  function attrInherentDots(name) {
    var flat = state.data.freeBuild.attributeGrid[0].concat(state.data.freeBuild.attributeGrid[1], state.data.freeBuild.attributeGrid[2]);
    var a = flat.find(function (x) { return x.name === name; });
    return a ? a.inherentDots : 0;
  }

  // Two real choices — which Beast aspect, then who it's aimed at — so a two-step popup like
  // Free Build's wizard, not a single-step picker. Every choice-shaped decision for a special
  // roll lives in this modal; only continuously-adjustable modifiers (territory dots,
  // repeat-target count) stay inline with the roller controls once the card is built, same
  // pattern as Contested Roll's resistance stepper.
  function pickLashingOutAspect(aspectKey) {
    state.lo.aspectKey = aspectKey;
    state.lo.step = 'target';
    render();
  }

  function finishLashingOut(isKindred) {
    var aspect = LASHING_OUT_ASPECTS.find(function (a) { return a.key === state.lo.aspectKey; });
    var id = 'lashout-' + aspect.key;
    // Inherent dots only, not effective — see attrInherentDots() for why.
    var base = state.data.character.bloodPotency + attrInherentDots(aspect.attrName);
    state.lashingOutItems[id] = {
      id: id,
      kind: 'special',
      rulesKind: 'lashout',
      name: 'Lashing Out — ' + aspect.label,
      formula: 'BP+' + abbr3(aspect.attrName),
      fullFormula: 'Blood Potency + ' + aspect.attrName,
      base: base,
      aspectDesc: aspect.desc,
      specs: [],
      nineAgain: false,
      merit: null,
    };
    state.targetKindred[id] = isKindred;
    state.selectedId = id;
    state.lo = { open: false, step: 'aspect', aspectKey: null };
    render();
  }

  function renderLashingOutModal() {
    if (!state.lo.open || !state.data) return '';
    var onAspectStep = state.lo.step !== 'target';
    var title, bodyHtml;

    if (onAspectStep) {
      var cells = LASHING_OUT_ASPECTS.map(function (a) {
        var val = state.data.character.bloodPotency + attrInherentDots(a.attrName);
        return '<button class="fb-cell fb-cell--tall" data-lo-pick="' + esc(a.key) + '" type="button">' +
          '<span class="fb-cell-name">' + esc(a.label) + '</span>' +
          '<span class="fb-cell-sub">BP + ' + esc(a.attrName) + '</span>' +
          '<span class="fb-cell-val' + (val <= 0 ? ' is-text' : '') + '">' + poolDisplay(val) + '</span>' +
          '</button>';
      }).join('');
      title = 'Which aspect?';
      bodyHtml = '<div class="fb-grid fb-grid--3">' + cells + '</div>';
    } else {
      var aspect = LASHING_OUT_ASPECTS.find(function (a) { return a.key === state.lo.aspectKey; });
      title = esc(aspect.label) + ' — target?';
      bodyHtml =
        '<div class="fb-grid fb-grid--2">' +
        '<button class="fb-cell fb-cell--tall" data-lo-target-pick="kindred" type="button">' +
        '<span class="fb-cell-name">Vs. Kindred</span>' +
        '<span class="fb-cell-sub">Costs 1 Willpower</span>' +
        '</button>' +
        '<button class="fb-cell fb-cell--tall" data-lo-target-pick="mortal" type="button">' +
        '<span class="fb-cell-name">Vs. Mortal</span>' +
        '<span class="fb-cell-sub">Free</span>' +
        '</button>' +
        '</div>';
    }

    return (
      '<div class="fb-overlay">' +
      '<div class="fb-modal">' +
      '<div class="fb-modal-head">' +
      '<div>' +
      '<span class="fb-modal-step">Lashing Out with the Beast</span>' +
      '<h2 class="fb-modal-title">' + title + '</h2>' +
      '</div>' +
      '<button class="fb-close" id="loClose" type="button" aria-label="Close">&times;</button>' +
      '</div>' +
      '<div class="fb-body">' + bodyHtml + '</div>' +
      '<div class="fb-footer">' +
      (!onAspectStep ? '<button class="fb-back" id="loBack" type="button">Back</button>' : '<span></span>') +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  // Two real choices — which relation tier, then passive or forced detection — so a two-step
  // popup, same shape as Lashing Out's own wizard.
  function pickBloodSympathyTier(tierKey) {
    state.bs.tierKey = tierKey;
    state.bs.step = 'force';
    render();
  }

  function finishBloodSympathy(forced) {
    var tier = BLOOD_SYMPATHY_TIERS.find(function (t) { return t.key === state.bs.tierKey; });
    var id = 'bloodsym-' + tier.key;
    var wits = attrValue('Wits');
    var bp = state.data.character.bloodPotency;
    var base = wits + bp + tier.mod;
    state.bloodSympathyItems[id] = {
      id: id,
      kind: 'special',
      rulesKind: 'bloodsym',
      name: 'Detecting Blood Sympathy — ' + tier.label,
      formula: 'Wit+BP' + (tier.mod ? (tier.mod > 0 ? '+' + tier.mod : tier.mod) : ''),
      fullFormula: 'Wits + Blood Potency' + (tier.mod ? ' + ' + tier.mod + ' (' + tier.label + ')' : ''),
      base: base,
      tierLabel: tier.label,
      tierSub: tier.sub,
      noDramaticFailure: true,
      specs: [],
      nineAgain: false,
      merit: null,
    };
    state.bsForced[id] = forced;
    state.selectedId = id;
    state.bs = { open: false, step: 'tier', tierKey: null };
    render();
  }

  function renderBloodSympathyModal() {
    if (!state.bs.open || !state.data) return '';
    var onTierStep = state.bs.step !== 'force';
    var title, bodyHtml;

    if (onTierStep) {
      var wits = attrValue('Wits');
      var bp = state.data.character.bloodPotency;
      var cells = BLOOD_SYMPATHY_TIERS.map(function (t) {
        var val = wits + bp + t.mod;
        return '<button class="fb-cell fb-cell--tall" data-bs-pick="' + esc(t.key) + '" type="button">' +
          '<span class="fb-cell-name">' + esc(t.label) + '</span>' +
          '<span class="fb-cell-sub">' + esc(t.sub) + '</span>' +
          '<span class="fb-cell-val' + (val <= 0 ? ' is-text' : '') + '">' + poolDisplay(val) + '</span>' +
          '</button>';
      }).join('');
      title = 'Which relation?';
      bodyHtml = '<div class="fb-grid fb-grid--2">' + cells + '</div>';
    } else {
      var tier = BLOOD_SYMPATHY_TIERS.find(function (t) { return t.key === state.bs.tierKey; });
      title = esc(tier.label) + ' — passive or forced?';
      bodyHtml =
        '<div class="fb-grid fb-grid--2">' +
        '<button class="fb-cell fb-cell--tall" data-bs-force-pick="passive" type="button">' +
        '<span class="fb-cell-name">Passive</span>' +
        '<span class="fb-cell-sub">Free — ambient detection only</span>' +
        '</button>' +
        '<button class="fb-cell fb-cell--tall" data-bs-force-pick="forced" type="button">' +
        '<span class="fb-cell-name">Force &amp; target</span>' +
        '<span class="fb-cell-sub">Costs 1 Willpower</span>' +
        '</button>' +
        '</div>';
    }

    return (
      '<div class="fb-overlay">' +
      '<div class="fb-modal">' +
      '<div class="fb-modal-head">' +
      '<div>' +
      '<span class="fb-modal-step">Detecting Blood Sympathy</span>' +
      '<h2 class="fb-modal-title">' + title + '</h2>' +
      '</div>' +
      '<button class="fb-close" id="bsClose" type="button" aria-label="Close">&times;</button>' +
      '</div>' +
      '<div class="fb-body">' + bodyHtml + '</div>' +
      '<div class="fb-footer">' +
      (!onTierStep ? '<button class="fb-back" id="bsBack" type="button">Back</button>' : '<span></span>') +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  // One choice only — how much Vitae was ingested in this single drinking experience — so a
  // single-step popup, same shape as the original Lashing Out aspect-only picker. This is NOT
  // "which numbered drink" — that's the separate, running prior-resistance count below.
  function finishResistBond(vitaeKey) {
    var opt = RESIST_BOND_VITAE_OPTIONS.find(function (o) { return o.key === vitaeKey; });
    var id = 'resistbond-' + opt.key;
    var base = state.data.character.bloodPotency - opt.vitae;
    state.resistBondItems[id] = {
      id: id,
      kind: 'special',
      rulesKind: 'resistbond',
      name: 'Resist Blood Bond — ' + opt.label,
      formula: 'BP-' + opt.vitae,
      fullFormula: 'Blood Potency - ' + opt.vitae + ' Vitae ingested',
      base: base,
      vitaeLabel: opt.label + ' ingested this drinking experience',
      specs: [],
      nineAgain: false,
      merit: null,
    };
    state.selectedId = id;
    state.rb = { open: false };
    render();
  }

  function renderResistBondModal() {
    if (!state.rb.open || !state.data) return '';
    var bp = state.data.character.bloodPotency;
    var cells = RESIST_BOND_VITAE_OPTIONS.map(function (o) {
      var val = bp - o.vitae;
      return '<button class="fb-cell fb-cell--tall" data-rb-pick="' + esc(o.key) + '" type="button">' +
        '<span class="fb-cell-name">' + esc(o.label) + '</span>' +
        '<span class="fb-cell-val' + (val <= 0 ? ' is-text' : '') + '">' + poolDisplay(val) + '</span>' +
        '</button>';
    }).join('');
    return (
      '<div class="fb-overlay">' +
      '<div class="fb-modal">' +
      '<div class="fb-modal-head">' +
      '<div>' +
      '<span class="fb-modal-step">Resist Blood Bond</span>' +
      '<h2 class="fb-modal-title">How much Vitae, this drinking experience?</h2>' +
      '</div>' +
      '<button class="fb-close" id="rbClose" type="button" aria-label="Close">&times;</button>' +
      '</div>' +
      '<div class="fb-body"><div class="fb-grid fb-grid--3">' + cells + '</div></div>' +
      '</div>' +
      '</div>'
    );
  }

  // Two steps: pick a level off the grid, then a detail screen showing that level's full
  // example list (not just the one-line preview the grid tile has room for) with Back/Confirm
  // and Higher/Lower to walk between levels without returning to the grid each time. Banes
  // taken and the Masquerade/Requiem situational modifier are live per-roll factors, not picked
  // here; they stay as inline controls on the built card (see humanityCheckBonus()).
  function pickHumanityLevel(level) {
    state.hc.level = level;
    state.hc.step = 'detail';
    render();
  }

  function stepHumanityLevel(delta) {
    var humanityCur = state.data.character.humanityCurrent;
    var maxLevel = Math.min(10, humanityCur);
    state.hc.level = Math.max(1, Math.min(maxLevel, state.hc.level + delta));
    render();
  }

  function finishHumanityCheck() {
    var lvl = HUMANITY_CHECK_LEVELS.find(function (l) { return l.level === state.hc.level; });
    var id = 'humanitycheck-' + lvl.level;
    var humanityCur = state.data.character.humanityCurrent;
    var tsMod = touchstoneModifier();
    var base = 4 - (humanityCur - lvl.level) + tsMod;
    state.humanityCheckItems[id] = {
      id: id,
      kind: 'special',
      rulesKind: 'humanitycheck',
      name: 'Humanity Breaking Point ' + lvl.level,
      formula: '4-(H-BP)+TS',
      fullFormula: '4 - (Humanity ' + humanityCur + ' - Breaking Point ' + lvl.level + ') + Touchstone ' + (tsMod >= 0 ? '+' : '') + tsMod,
      base: base,
      levelLabel: 'Breaking Point ' + lvl.level,
      levelExamples: lvl.examples,
      touchstoneMod: tsMod,
      specs: [],
      nineAgain: false,
      merit: null,
    };
    state.selectedId = id;
    state.hc = { open: false, step: 'grid', level: null };
    render();
  }

  function renderHumanityCheckModal() {
    if (!state.hc.open || !state.data) return '';
    var humanityCur = state.data.character.humanityCurrent;
    var tsMod = touchstoneModifier();
    var onGrid = state.hc.step !== 'detail';
    var title, bodyHtml, footerHtml;

    if (onGrid) {
      var cells = HUMANITY_CHECK_LEVELS.map(function (l) {
        var applicable = l.level <= humanityCur;
        if (!applicable) {
          return '<div class="fb-cell fb-cell--tall fb-cell--disabled">' +
            '<span class="fb-cell-name">Breaking Point ' + l.level + '</span>' +
            '<span class="fb-cell-sub">Above your Humanity ' + humanityCur + ' — not applicable</span>' +
            '</div>';
        }
        var val = 4 - (humanityCur - l.level) + tsMod;
        return '<button class="fb-cell fb-cell--tall" data-hc-pick="' + l.level + '" type="button">' +
          '<span class="fb-cell-name">Breaking Point ' + l.level + '</span>' +
          '<span class="fb-cell-val' + (val <= 0 ? ' is-text' : '') + '">' + poolDisplay(val) + '</span>' +
          '</button>';
      }).join('');
      title = 'Which Breaking Point?';
      bodyHtml = '<div class="fb-grid fb-grid--2">' + cells + '</div>';
      footerHtml = '';
    } else {
      var lvl = HUMANITY_CHECK_LEVELS.find(function (l) { return l.level === state.hc.level; });
      var val = 4 - (humanityCur - lvl.level) + tsMod;
      var maxLevel = Math.min(10, humanityCur);
      var canLower = lvl.level > 1;
      var canHigher = lvl.level < maxLevel;
      title = 'Breaking Point ' + lvl.level;
      // Chevrons, not +/- — this walks between Breaking Point levels, it doesn't add or
      // subtract dice directly, and +/- reads as the latter everywhere else in this app
      // (Base, Mod, Territory, Banes...). The pool number gets its own "dice pool" caption so
      // it can't be mistaken for the level indicator either.
      bodyHtml =
        '<ul class="hc-examples">' +
        lvl.examples.map(function (ex) { return '<li>' + esc(ex) + '</li>'; }).join('') +
        '</ul>' +
        '<div class="hc-level-nav">' +
        '<button class="hc-nav-btn" id="hcLower" type="button" aria-label="Lower Breaking Point level"' + (canLower ? '' : ' disabled') + '>&lsaquo;</button>' +
        '<div class="hc-level-display">' +
        '<span class="hc-level-pool' + (val <= 0 ? ' is-text' : '') + '">' + poolDisplay(val) + '</span>' +
        '<span class="hc-level-pool-label">dice pool</span>' +
        '</div>' +
        '<button class="hc-nav-btn" id="hcHigher" type="button" aria-label="Higher Breaking Point level"' + (canHigher ? '' : ' disabled') + '>&rsaquo;</button>' +
        '</div>';
      footerHtml =
        '<button class="fb-back" id="hcBack" type="button">Back</button>' +
        '<button class="freebuild-btn hc-confirm" id="hcConfirm" type="button">Confirm</button>';
    }

    return (
      '<div class="fb-overlay">' +
      '<div class="fb-modal">' +
      '<div class="fb-modal-head">' +
      '<div>' +
      '<span class="fb-modal-step">Humanity Breaking Point</span>' +
      '<h2 class="fb-modal-title">' + title + '</h2>' +
      '</div>' +
      '<button class="fb-close" id="hcClose" type="button" aria-label="Close">&times;</button>' +
      '</div>' +
      '<div class="fb-running"><span>Humanity ' + humanityCur + '</span><span>Touchstone ' + (tsMod >= 0 ? '+' : '') + tsMod + '</span></div>' +
      '<div class="fb-body">' + bodyHtml + '</div>' +
      (footerHtml ? '<div class="fb-footer hc-footer">' + footerHtml + '</div>' : '') +
      '</div>' +
      '</div>'
    );
  }

  // Two real choices — which Discipline is fueling this side of the clash, then how long the
  // invoked power lasts (the duration bonus, p.126) — so a two-step popup, same shape as
  // Lashing Out. "Present & Aware" (gates the WP+3 boost) is situational per-roll, not a
  // one-time pick, so it stays an inline toggle on the built card, not part of this wizard.
  function pickClashPower(discName) {
    state.cw.discName = discName;
    state.cw.step = 'duration';
    render();
  }

  function finishClashOfWills(durationKey) {
    var dur = CLASH_DURATION_OPTIONS.find(function (d) { return d.key === durationKey; });
    var disc = state.data.freeBuild.disciplineGrid.find(function (d) { return d.name === state.cw.discName; });
    var id = 'clashofwills-' + disc.name.toLowerCase() + '-' + dur.key;
    var bp = state.data.character.bloodPotency;
    var base = bp + disc.value + dur.bonus;
    state.clashOfWillsItems[id] = {
      id: id,
      kind: 'special',
      rulesKind: 'clashofwills',
      name: 'Clash of Wills — ' + disc.name + (dur.bonus ? ' (' + dur.label + ')' : ''),
      formula: 'BP+' + abbr3(disc.name) + (dur.bonus ? '+' + dur.bonus : ''),
      fullFormula: 'Blood Potency + ' + disc.name + (dur.bonus ? ' + ' + dur.bonus + ' (' + dur.label + ')' : ''),
      base: base,
      discName: disc.name,
      durationLabel: dur.label,
      durationBonus: dur.bonus,
      specs: [],
      nineAgain: false,
      merit: null,
    };
    state.selectedId = id;
    state.cw = { open: false, step: 'power', discName: null };
    render();
  }

  function renderClashOfWillsModal() {
    if (!state.cw.open || !state.data) return '';
    var bp = state.data.character.bloodPotency;
    var onPowerStep = state.cw.step !== 'duration';
    var title, bodyHtml;

    if (onPowerStep) {
      var cells = state.data.freeBuild.disciplineGrid.map(function (d) {
        var val = bp + d.value;
        return '<button class="fb-cell" data-cw-pick="' + esc(d.name) + '" type="button">' +
          '<span class="fb-cell-name">' + esc(d.name) + '</span>' +
          '<span class="fb-cell-val' + (val <= 0 ? ' is-text' : '') + '">' + poolDisplay(val) + '</span>' +
          '</button>';
      }).join('');
      title = 'Which power?';
      bodyHtml = '<div class="fb-grid fb-grid--flex">' + cells + '</div>';
    } else {
      var disc = state.data.freeBuild.disciplineGrid.find(function (d) { return d.name === state.cw.discName; });
      var cells2 = CLASH_DURATION_OPTIONS.map(function (dur) {
        var val = bp + disc.value + dur.bonus;
        return '<button class="fb-cell fb-cell--tall" data-cw-duration="' + dur.key + '" type="button">' +
          '<span class="fb-cell-name">' + esc(dur.label) + '</span>' +
          '<span class="fb-cell-sub">' + (dur.bonus ? '+' + dur.bonus + ' ' + (dur.bonus === 1 ? 'die' : 'dice') : 'no bonus') + '</span>' +
          '<span class="fb-cell-val' + (val <= 0 ? ' is-text' : '') + '">' + poolDisplay(val) + '</span>' +
          '</button>';
      }).join('');
      title = esc(disc.name) + ' — how long does it last?';
      bodyHtml = '<div class="fb-grid fb-grid--2">' + cells2 + '</div>';
    }

    return (
      '<div class="fb-overlay">' +
      '<div class="fb-modal">' +
      '<div class="fb-modal-head">' +
      '<div>' +
      '<span class="fb-modal-step">Clash of Wills</span>' +
      '<h2 class="fb-modal-title">' + title + '</h2>' +
      '</div>' +
      '<button class="fb-close" id="cwClose" type="button" aria-label="Close">&times;</button>' +
      '</div>' +
      '<div class="fb-body">' + bodyHtml + '</div>' +
      '<div class="fb-footer">' +
      (!onPowerStep ? '<button class="fb-back" id="cwBack" type="button">Back</button>' : '<span></span>') +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  // Defensive Reaction (CRD mockup) — recomputed fresh from the live M/S/P toggle + live
  // attribute dots every time it's needed, same as every other synthetic item here. Shared
  // between render() and findItem() (rather than stashed on state like the built-once specials)
  // because its base is meant to change reactively when the toggle changes, not freeze at
  // creation time.
  function defensiveReactionItem() {
    if (!state.data || !state.data.freeBuild) return null;
    var aspect = DEFENSE_ASPECTS[state.defenseAspect] || DEFENSE_ASPECTS.mental;
    var attrEntry = state.data.freeBuild.attributeGrid[aspect.rowIdx][2]; // Resistance column is always index 2
    return {
      id: 'defensivereact',
      kind: 'special',
      rulesKind: 'defensivereact',
      name: 'Defensive Reaction (' + aspect.label + ')',
      formula: abbr3(attrEntry.name),
      fullFormula: attrEntry.name,
      base: attrEntry.value,
      specs: [],
      nineAgain: false,
      merit: null,
    };
  }

  function findItem(id) {
    if (id === 'freebuild' && state.freeBuildItem) return state.freeBuildItem;
    if (id === 'defensivereact') return defensiveReactionItem();
    if (state.lashingOutItems[id]) return state.lashingOutItems[id];
    if (state.bloodSympathyItems[id]) return state.bloodSympathyItems[id];
    if (state.resistBondItems[id]) return state.resistBondItems[id];
    if (state.humanityCheckItems[id]) return state.humanityCheckItems[id];
    if (state.clashOfWillsItems[id]) return state.clashOfWillsItems[id];
    var all = state.data.skills.concat(state.data.powers).concat(state.data.special || []);
    return all.find(function (i) { return i.id === id; });
  }

  // ── roll execution — mirrors doRoll()'s three branches exactly ──
  function executeRoll(item) {
    var eff = currentEffective(item);
    var again = getAgain(item) === 'none' ? 10 : getAgain(item);
    var na = getAgain(item) === 'none';
    var wpOn = !!state.wp[item.id];

    // WP(+3) spends 1 Willpower AT ROLL TIME, not on toggle — matches the real app's
    // pay-to-activate-on-roll pattern (gdx-7). Guarded so it can never go negative.
    if (wpOn && state.willpowerCurrent > 0) state.willpowerCurrent -= 1;

    // A discipline power with a real Vitae cost pays it the same way — paid up front to
    // activate, once, regardless of which result branch fires below (same doRoll() rule).
    if (item.kind === 'power') {
      var vCost = parseStats(item.stats).vitaeCost;
      if (vCost > 0) state.vitaeCurrent = Math.max(0, state.vitaeCurrent - vCost);
    }

    // Lashing Out costs 1 Willpower against Kindred, free against a mortal (p.91) — a real
    // activation cost, distinct from the optional WP(+3) boost toggle above.
    if (item.kind === 'special' && state.targetKindred[item.id]) {
      state.willpowerCurrent = Math.max(0, state.willpowerCurrent - 1);
    }

    // Forcing Blood Sympathy to target a specific relative costs 1 Willpower (p.99); passive
    // (ambient) detection is free.
    if (item.kind === 'special' && state.bsForced[item.id]) {
      state.willpowerCurrent = Math.max(0, state.willpowerCurrent - 1);
    }

    // Resisting a blood bond always costs 1 Willpower to attempt (p.100) — unconditional, unlike
    // Lashing Out/Blood Sympathy's target-dependent costs. That Willpower point does not add to
    // the roll itself (explicit rule), so it's separate from the optional WP(+3) boost above.
    if (item.rulesKind === 'resistbond') {
      state.willpowerCurrent = Math.max(0, state.willpowerCurrent - 1);
    }

    var result;
    if (eff <= 0) {
      var v = d10();
      var suc = v === 10;
      // Detecting Blood Sympathy explicitly cannot dramatically fail (p.99), regardless of pool.
      var dram = !item.noDramaticFailure && v === 1;
      result = {
        kind: 'chance',
        label: dram ? 'Dramatic Failure' : suc ? 'Success (Chance)' : 'Failure (Chance)',
        cls: dram ? 'f' : suc ? 'e' : 'f',
        count: dram ? '—' : suc ? '1' : '0',
        detail: 'Chance die: ' + v,
        dice: [{ r: { v: v, s: suc, dram: dram }, ch: [] }],
      };
    } else if (state.contested[item.id]) {
      var resistVal = state.resistPool[item.id] || 0;
      var cA = rollPool(eff, again, na);
      var sA = cntSuc(cA);
      var cR = rollPool(resistVal, again, na);
      var sR = cntSuc(cR);
      var net = sA - sR;
      var won = net > 0;
      var draw = net === 0;
      result = {
        kind: 'contested',
        label: won ? (net >= 5 ? 'Exceptional Success' : 'Success') : draw ? 'Draw (Failure)' : 'Failure',
        cls: won ? (net >= 5 ? 'e' : 's') : 'f',
        count: won ? net : sA,
        detail: sA + ' vs ' + sR + ' (resistance pool ' + resistVal + ')',
        diceA: cA,
        diceR: cR,
      };
    } else {
      var rote = !!state.rote[item.id];
      var c1 = rollPool(eff, again, na);
      var s1 = cntSuc(c1);
      var c2 = rote ? rollPool(eff, again, na) : null;
      var s2 = rote ? cntSuc(c2) : null;
      var wS = rote ? Math.max(s1, s2) : s1;
      var exc = wS >= 5;
      result = {
        kind: 'standard',
        label: wS === 0 ? 'Failure' : exc ? 'Exceptional Success' : 'Success',
        cls: wS === 0 ? 'f' : exc ? 'e' : 's',
        count: wS,
        detail: eff + 'd10 · ' + (na ? 'no again' : again + '-again') + (rote ? ' · rote (best of ' + s1 + '/' + s2 + ')' : ''),
        dice: c1,
        dice2: c2,
        roteKept: rote ? (s2 > s1 ? 2 : 1) : null,
      };
    }

    state.lastResult = { item: item.name, result: result, at: new Date() };
    state.history.unshift(state.lastResult);
    if (state.history.length > 10) state.history.length = 10;
    render();
  }

  function render() {
    var d = state.data;
    if (!d) return;

    var selected = state.selectedId ? findItem(state.selectedId) : d.skills[0];
    if (selected && state.selectedId == null) state.selectedId = selected.id;

    // ── CRD mockup: queue rows ──
    var pendingQueue = state.queue.filter(function (q) { return q.status === 'pending'; });
    var queueRowsHtml = state.queue.length
      ? state.queue.map(function (q) {
          var resolved = q.status === 'resolved';
          return '<div class="queue-row' + (resolved ? ' is-resolved' : '') + '">' +
            '<div class="queue-row-text">' +
            '<span class="queue-row-who">&#9876; <b>' + esc(q.sourceName) + '</b> contests you</span>' +
            '<span class="queue-row-what">' + esc(q.rollLabel) + (q.rollFormula ? ' &middot; ' + esc(q.rollFormula) : '') + '</span>' +
            '</div>' +
            (resolved
              ? '<span class="queue-resolved-badge">Resolved</span>'
              : '<button class="queue-resolve-btn" type="button" data-resolve-challenge="' + esc(q.id) + '">Resolve</button>') +
            '</div>';
        }).join('')
      : '<div class="picker-empty">No pending contests</div>';

    function poolBtn(item) {
      var isSel = item.id === state.selectedId;
      var badges = '';
      if (item.merit) {
        badges = '<span class="pool-badges"><span class="mini-badge mini-badge--merit" title="' + esc(item.merit.name) + '">M</span></span>';
      }
      return (
        '<button class="pool-btn' + (isSel ? ' selected' : '') + '" data-id="' + esc(item.id) + '">' +
        '<span class="pool-btn-left">' +
        '<span class="pool-name">' + esc(item.name) + '</span>' +
        '<span class="pool-formula">' + esc(item.formula) + '</span>' +
        '</span>' +
        '<span class="pool-btn-right">' + badges +
        '<span class="pool-num' + (item.base <= 0 ? ' is-text' : '') + '">' + poolDisplay(item.base) + '</span>' +
        '</span>' +
        '</button>'
      );
    }

    var skillsHtml = d.skills.map(poolBtn).join('');
    var powersHtml = d.powers.map(poolBtn).join('');
    // Special rolls (initiative / frenzy / lashing-out / ...) — built one at a time, per #1039's
    // own scope. Lashing Out is the first one wired; each already-configured aspect shows as a
    // normal pool card (re-selectable, keeps its own territory/repeat-target/target-type state),
    // plus a permanent launcher to configure a new one.
    // Humanity Check goes first — the player asked for it at the top of the Special list,
    // ahead of the other three (which stay in their existing build order after it).
    var builtHumanityCheck = HUMANITY_CHECK_LEVELS
      .map(function (l) { return state.humanityCheckItems['humanitycheck-' + l.level]; })
      .filter(Boolean);
    var builtLashingOut = LASHING_OUT_ASPECTS
      .map(function (a) { return state.lashingOutItems['lashout-' + a.key]; })
      .filter(Boolean);
    var builtBloodSympathy = BLOOD_SYMPATHY_TIERS
      .map(function (t) { return state.bloodSympathyItems['bloodsym-' + t.key]; })
      .filter(Boolean);
    var builtResistBond = RESIST_BOND_VITAE_OPTIONS
      .map(function (o) { return state.resistBondItems['resistbond-' + o.key]; })
      .filter(Boolean);
    // Clash of Wills items are keyed by discipline+duration combo, not a fixed enumerable list
    // like the other three — this character's own discipline list decides what's possible.
    var builtClashOfWills = Object.keys(state.clashOfWillsItems).map(function (k) { return state.clashOfWillsItems[k]; });
    // Defensive Reaction (CRD mockup) — the generic contested-defence pool a queue-routed
    // contest falls back to when the attacker's roll doesn't match a named item on this
    // character's own sheet. defensiveReactionItem() is shared with findItem() (defined above
    // render()) so selecting it by id resolves to the same live-recomputed object either way.
    var defReactItem = defensiveReactionItem();
    var specialItems = builtHumanityCheck.concat(builtLashingOut).concat(builtBloodSympathy).concat(builtResistBond).concat(builtClashOfWills).concat(d.special || []).concat(defReactItem ? [defReactItem] : []);
    var specialHtml =
      (specialItems.length ? specialItems.map(poolBtn).join('') : '') +
      '<button class="pool-btn special-launcher" id="humanityCheckBtn" type="button">' +
      '<span class="special-launcher-label">Humanity Breaking Point</span>' +
      '</button>' +
      '<button class="pool-btn special-launcher" id="lashingOutBtn" type="button">' +
      '<span class="special-launcher-label">Lashing Out with the Beast</span>' +
      '</button>' +
      '<button class="pool-btn special-launcher" id="bloodSymBtn" type="button">' +
      '<span class="special-launcher-label">Detecting Blood Sympathy</span>' +
      '</button>' +
      '<button class="pool-btn special-launcher" id="resistBondBtn" type="button">' +
      '<span class="special-launcher-label">Resist Blood Bond</span>' +
      '</button>' +
      '<button class="pool-btn special-launcher" id="clashOfWillsBtn" type="button">' +
      '<span class="special-launcher-label">Clash of Wills</span>' +
      '</button>';

    var rulesHtml = '';
    var modsHtml = '';
    var controlsHtml = '';
    var breakdownHtml = '';
    var resultHtml = '';
    var eff = 0;
    var rollLabel = 'Roll';
    var vitaeCost = 0;

    if (selected) {
      eff = currentEffective(selected);
      var advanced = canSeeAdvanced();
      var again = getAgain(selected);
      var base = getBase(selected);
      var mod = getMod(selected);
      var bonus = chipBonus(selected);

      // ── rules-summary accordion (unchanged from the previous pass) ──
      var isOpen = !!state.rulesOpen[selected.id];
      var bodyHtml;
      if (selected.kind === 'power') {
        var parsed = parseStats(selected.stats);
        vitaeCost = parsed.vitaeCost;
        bodyHtml =
          '<div class="power-meta">' + parsed.meta.map(function (m) { return '<span>' + esc(m) + '</span>'; }).join('') + '</div>' +
          (selected.effect ? '<p class="power-desc">' + esc(selected.effect) + '</p>' : '');
        rulesHtml =
          '<details class="rules-summary" data-rules-toggle="' + esc(selected.id) + '"' + (isOpen ? ' open' : '') + '>' +
          '<summary class="rules-summary-head">' +
          '<span class="power-name">Rules explanation</span>' +
          (parsed.costText ? '<span class="power-cost">' + esc(parsed.costText) + '</span>' : '') +
          '<span class="chevron"></span>' +
          '</summary>' +
          '<div class="rules-summary-body">' + bodyHtml + '</div>' +
          '</details>';
      } else if (selected.rulesKind === 'lashout') {
        bodyHtml =
          '<div class="power-meta"><span>Pool: ' + esc(selected.fullFormula) + '</span><span>Instant action</span></div>' +
          '<p class="power-desc">' + esc(selected.aspectDesc) + '</p>' +
          '<p class="power-desc">Costs 1 Willpower against Kindred; free against a mortal. If the target fights back, they roll their own Power Attribute + Blood Potency — more successes flips who gains the Condition.</p>';
        rulesHtml =
          '<details class="rules-summary" data-rules-toggle="' + esc(selected.id) + '"' + (isOpen ? ' open' : '') + '>' +
          '<summary class="rules-summary-head">' +
          '<span class="power-name">Rules explanation</span>' +
          '<span class="chevron"></span>' +
          '</summary>' +
          '<div class="rules-summary-body">' + bodyHtml + '</div>' +
          '</details>';
      } else if (selected.rulesKind === 'bloodsym') {
        bodyHtml =
          '<div class="power-meta"><span>Pool: ' + esc(selected.fullFormula) + '</span><span>Instant action</span></div>' +
          '<p class="power-desc">' + esc(selected.tierLabel) + ' (' + esc(selected.tierSub) + '). Cannot dramatically fail.</p>' +
          '<p class="power-desc">Success: a vague impression of the relative’s mental state and general direction. Exceptional Success: also their rough distance, whether they’ve reached torpor or Final Death, and a single short sentence through the blood tie. Force &amp; target costs 1 Willpower; passive detection is free.</p>';
        rulesHtml =
          '<details class="rules-summary" data-rules-toggle="' + esc(selected.id) + '"' + (isOpen ? ' open' : '') + '>' +
          '<summary class="rules-summary-head">' +
          '<span class="power-name">Rules explanation</span>' +
          '<span class="chevron"></span>' +
          '</summary>' +
          '<div class="rules-summary-body">' + bodyHtml + '</div>' +
          '</details>';
      } else if (selected.rulesKind === 'resistbond') {
        bodyHtml =
          '<div class="power-meta"><span>Pool: ' + esc(selected.fullFormula) + '</span><span>Instant · reactive</span></div>' +
          '<p class="power-desc">' + esc(selected.vitaeLabel) + '. Any time a point or more of Vitae is imbibed, it creates or reinforces a blood bond. Spend 1 Willpower and roll Blood Potency minus the Vitae ingested (the Willpower does not add dice). Success: that drink does not add to the bond — Vitae addiction still applies normally. Mortals have no such defense.</p>' +
          '<p class="power-desc">Separately: further attempts to resist a bond from the same vampire — across repeated feedings — take a cumulative -1 die penalty each time, tracked below. Even ancient Kindred cannot resist forever.</p>';
        rulesHtml =
          '<details class="rules-summary" data-rules-toggle="' + esc(selected.id) + '"' + (isOpen ? ' open' : '') + '>' +
          '<summary class="rules-summary-head">' +
          '<span class="power-name">Rules explanation</span>' +
          '<span class="chevron"></span>' +
          '</summary>' +
          '<div class="rules-summary-body">' + bodyHtml + '</div>' +
          '</details>';
      } else if (selected.rulesKind === 'humanitycheck') {
        var tsList = state.data.character.touchstones || [];
        var tsAttached = tsList.filter(function (t) { return t.humanity <= state.data.character.humanityCurrent; });
        var tsSummary = tsList.length === 0
          ? 'No Touchstones (-2).'
          : tsAttached.length === 0
            ? tsList.length + ' Touchstone' + (tsList.length > 1 ? 's' : '') + ', none currently attached (Humanity ' + state.data.character.humanityCurrent + ' is below every written dot) — no modifier.'
            : tsAttached.length + ' of ' + tsList.length + ' Touchstone' + (tsList.length > 1 ? 's' : '') + ' attached (' + tsAttached.map(function (t) { return esc(t.name) + ' @ Humanity ' + t.humanity; }).join(', ') + ') — ' + (tsAttached.length >= 2 ? '+3 (multiple attached)' : '+2 (one attached)') + '.';
        bodyHtml =
          '<div class="power-meta"><span>Pool: ' + esc(selected.fullFormula) + '</span><span>Instant · reactive</span></div>' +
          '<p class="power-desc">' + esc(selected.levelLabel) + '. Examples: ' + esc(selected.levelExamples.join('; ')) + '.</p>' +
          '<p class="power-desc">Terra Mortis errata pool: 4 - (Current Humanity - Breaking Point level) + Touchstone modifier. ' + tsSummary + ' Willpower cannot improve this roll.</p>' +
          '<p class="power-desc">Dramatic Failure: lose a Humanity dot, gain Jaded. Failure: lose a Humanity dot, gain Bestial/Competitive/Wanton. Success: no loss, gain Bestial/Competitive/Wanton anyway. Exceptional Success: no loss, gain Inspired. Take a Beat whenever a breaking point is faced. A character may take a bane (-1 permanent, cumulative, max 3) to become immune to losing Humanity from that specific breaking point again.</p>';
        rulesHtml =
          '<details class="rules-summary" data-rules-toggle="' + esc(selected.id) + '"' + (isOpen ? ' open' : '') + '>' +
          '<summary class="rules-summary-head">' +
          '<span class="power-name">Rules explanation</span>' +
          '<span class="chevron"></span>' +
          '</summary>' +
          '<div class="rules-summary-body">' + bodyHtml + '</div>' +
          '</details>';
      } else if (selected.rulesKind === 'clashofwills') {
        bodyHtml =
          '<div class="power-meta"><span>Pool: ' + esc(selected.fullFormula) + '</span><span>Instant · contested</span></div>' +
          '<p class="power-desc">When two Disciplines directly oppose each other (e.g. Auspex vs Obfuscate) and neither power\'s own system resolves it, all sides enter a contested roll-off, each pooling Blood Potency + dots in the Discipline fueling their side. The side with more successes wins outright; the others fail. Ties reroll until someone pulls ahead. Toggle Contested Roll below and set the opposing pool to run the roll-off.</p>' +
          '<p class="power-desc">' + esc(selected.durationLabel) + ' effects add ' + (selected.durationBonus ? selected.durationBonus + ' ' + (selected.durationBonus === 1 ? 'die' : 'dice') : 'no dice') + ' to the clash — already folded into this card\'s base. Willpower may only bolster this roll if your character is physically present and aware powers are clashing (p.126) — toggle that below.</p>';
        rulesHtml =
          '<details class="rules-summary" data-rules-toggle="' + esc(selected.id) + '"' + (isOpen ? ' open' : '') + '>' +
          '<summary class="rules-summary-head">' +
          '<span class="power-name">Rules explanation</span>' +
          '<span class="chevron"></span>' +
          '</summary>' +
          '<div class="rules-summary-body">' + bodyHtml + '</div>' +
          '</details>';
      } else if (selected.rulesKind === 'surpriseperception') {
        bodyHtml =
          '<div class="power-meta"><span>Pool: ' + esc(selected.fullFormula) + '</span><span>Instant · contested</span></div>' +
          '<p class="power-desc">A character who doesn\'t realize she\'s about to be on the receiving end of violence rolls Wits + Composure to notice the ambush, contested by the attacker\'s Dexterity + Stealth. Toggle Contested Roll below and set the attacker\'s pool to run it.</p>' +
          '<p class="power-desc">Failure: your character can\'t take an action in the first turn of combat, and can\'t apply Defense that turn. Initiative for the second turn is determined as normal.</p>';
        rulesHtml =
          '<details class="rules-summary" data-rules-toggle="' + esc(selected.id) + '"' + (isOpen ? ' open' : '') + '>' +
          '<summary class="rules-summary-head">' +
          '<span class="power-name">Rules explanation</span>' +
          '<span class="chevron"></span>' +
          '</summary>' +
          '<div class="rules-summary-body">' + bodyHtml + '</div>' +
          '</details>';
      } else if (selected.rulesKind === 'resistfrenzy') {
        bodyHtml =
          '<div class="power-meta"><span>Pool: ' + esc(selected.fullFormula) + '</span><span>Reflexive</span></div>' +
          '<p class="power-desc">To resist the Beast, roll Resolve + Composure. Apply any Suggested Modifiers that fit the scene below — Hungry/Starving apply automatically from live Vitae. Willpower cannot add +3 here; instead, a point of Willpower holds off the Beast for one turn. Once the character stops stalling, roll as normal with +1 die per turn held off — the stepper below tracks that and spends the Willpower live.</p>' +
          '<p class="power-desc">Dramatic Failure: frenzy, and the character can\'t end it until a breaking point is reached — take a Beat (or a second Beat, if you choose to escalate a Failure into this). Failure: succumbs to frenzy, take a Beat. Success: resists, but gains the Tempted Condition. Exceptional Success: resists and regains all Willpower spent fighting the Beast this scene.</p>';
        rulesHtml =
          '<details class="rules-summary" data-rules-toggle="' + esc(selected.id) + '"' + (isOpen ? ' open' : '') + '>' +
          '<summary class="rules-summary-head">' +
          '<span class="power-name">Rules explanation</span>' +
          '<span class="chevron"></span>' +
          '</summary>' +
          '<div class="rules-summary-body">' + bodyHtml + '</div>' +
          '</details>';
      } else if (selected.rulesKind === 'defensivereact') {
        bodyHtml =
          '<div class="power-meta"><span>Pool: ' + esc(selected.fullFormula) + '</span><span>Reflexive · contested</span></div>' +
          '<p class="power-desc">The generic pool for defending against a contested action that doesn\'t already have its own fixed formula. Pick which kind of contest this is below — Mental, Physical, or Social — to load the matching Resistance Attribute (Resolve, Stamina, or Composure).</p>' +
          '<p class="power-desc">Willpower is +2 here, not the usual +3 — the Rulebook\'s general Willpower rule gives +3 "to most dice pools, or +2 to a Resistance trait," and this pool IS a bare Resistance Attribute. If your character has Indomitable (p.211) and this is resisting a supernatural power trying to influence thoughts or emotions, toggle it below for +2 more.</p>' +
          '<p class="power-desc">Closed Book, if your character has it, adds its dots to contested rolls resisting an attempt to uncover her true feelings, motives, or position. Its own text is explicit that supernatural effects are a Storyteller-discretion call, not automatic — it names forced truth-telling as a real example that WOULD apply, and aura-reading as one that would NOT (she can\'t manipulate her spiritual resonance). This toggle can\'t know which power triggered the contest, so it\'s offered whenever the merit is on the sheet — use it only when the specific power in play actually fits.</p>';
        rulesHtml =
          '<details class="rules-summary" data-rules-toggle="' + esc(selected.id) + '"' + (isOpen ? ' open' : '') + '>' +
          '<summary class="rules-summary-head">' +
          '<span class="power-name">Rules explanation</span>' +
          '<span class="chevron"></span>' +
          '</summary>' +
          '<div class="rules-summary-body">' + bodyHtml + '</div>' +
          '</details>';
      } else {
        bodyHtml = '<div class="power-meta"><span>Pool: ' + esc(selected.fullFormula || selected.formula) + '</span></div>';
        rulesHtml =
          '<details class="rules-summary" data-rules-toggle="' + esc(selected.id) + '"' + (isOpen ? ' open' : '') + '>' +
          '<summary class="rules-summary-head">' +
          '<span class="power-name">Rules explanation</span>' +
          '<span class="chevron"></span>' +
          '</summary>' +
          '<div class="rules-summary-body">' + bodyHtml + '</div>' +
          '</details>';
      }
      var specialWillpowerCost = selected.kind === 'special' &&
        (state.targetKindred[selected.id] || state.bsForced[selected.id] || selected.rulesKind === 'resistbond') ? 1 : 0;
      rollLabel = eff <= 0
        ? ('Roll Chance Die' + (vitaeCost > 0 ? ' &amp; Spend ' + vitaeCost + ' Vitae' : specialWillpowerCost > 0 ? ' &amp; Spend ' + specialWillpowerCost + ' Willpower' : ''))
        : (vitaeCost > 0 ? ('Roll &amp; Spend ' + vitaeCost + ' Vitae')
          : specialWillpowerCost > 0 ? ('Roll &amp; Spend ' + specialWillpowerCost + ' Willpower')
          : 'Roll ' + eff + ' Dice');

      // ── modifier chips (merit + specs) ──
      var chips = [];
      if (selected.merit) {
        var meritOn = !!state.meritOn[selected.id];
        chips.push(
          '<button class="mod-chip' + (meritOn ? ' active' : '') + '" data-merit-toggle="' + esc(selected.id) + '" type="button" aria-pressed="' + meritOn + '">' +
          esc(selected.merit.name) + ' +' + selected.merit.bonus + '</button>'
        );
      }
      if (selected.specs && selected.specs.length) {
        selected.specs.forEach(function (specName) {
          var key = specKey(selected.id, specName);
          var specOn = !!state.specOn[key];
          chips.push(
            '<button class="mod-chip' + (specOn ? ' active' : '') + '" data-spec-toggle="' + esc(key) + '" type="button" aria-pressed="' + specOn + '">' +
            esc(specName) + ' +1</button>'
          );
        });
      }
      if (chips.length) {
        modsHtml =
          '<div class="mods">' +
          '<span class="mods-label">Modifiers for ' + esc(selected.name) + '</span>' +
          '<div class="mods-row">' + chips.join('') + '</div>' +
          '</div>';
      }

      // ── Resisting Frenzy's own Suggested Modifiers (p.104, the full real table) — Hungry/
      // Starving deliberately excluded here since they're auto-applied from live Vitae, not a
      // toggle (see frenzyHungerPenalty()). ──
      if (selected.rulesKind === 'resistfrenzy') {
        var frenzyChips = FRENZY_MODIFIERS.map(function (m) {
          var chipKey = selected.id + '::' + m.key;
          var chipOn = !!state.frenzyModOn[chipKey];
          return '<button class="mod-chip' + (chipOn ? ' active' : '') + '" data-frenzy-mod-toggle="' + esc(chipKey) + '" type="button" aria-pressed="' + chipOn + '">' +
            esc(m.label) + ' ' + (m.value >= 0 ? '+' : '') + m.value + '</button>';
        }).join('');
        var frenzyHunger = frenzyHungerPenalty();
        modsHtml +=
          '<div class="mods">' +
          '<span class="mods-label">Suggested Modifiers for Resisting Frenzy</span>' +
          '<div class="mods-row">' + frenzyChips + '</div>' +
          (frenzyHunger ? '<div class="field-note">' + (state.vitaeCurrent <= STARVING_VITAE ? 'Starving' : 'Hungry') + ': <b>' + frenzyHunger + '</b> <span class="lock-note">(from live Vitae, applied automatically)</span></div>' : '') +
          '</div>';
      }

      // ── BASE / MOD steppers ──
      var stepperHtml =
        '<div class="steppers">' +
        '<div class="stepper">' +
        '<span class="stepper-label">Base</span>' +
        '<div class="stepper-row">' +
        '<button class="stepper-btn" data-step="base" data-delta="-1" type="button" aria-label="Decrease base">−</button>' +
        '<span class="stepper-val">' + base + '</span>' +
        '<button class="stepper-btn" data-step="base" data-delta="1" type="button" aria-label="Increase base">+</button>' +
        '</div></div>' +
        '<div class="stepper">' +
        '<span class="stepper-label">Mod</span>' +
        '<div class="stepper-row">' +
        '<button class="stepper-btn" data-step="mod" data-delta="-1" type="button" aria-label="Decrease modifier">−</button>' +
        '<span class="stepper-val">' + mod + '</span>' +
        '<button class="stepper-btn" data-step="mod" data-delta="1" type="button" aria-label="Increase modifier">+</button>' +
        '</div></div>' +
        '</div>';

      // ── Again rule — gated: ST or this character's own completed Rules ordeal ──
      var againHtml;
      if (advanced) {
        againHtml =
          '<div class="field">' +
          '<span class="field-label">Again rule</span>' +
          '<div class="seg" role="group" aria-label="Again threshold">' +
          [10, 9, 8, 'none'].map(function (v) {
            var isActive = String(again) === String(v);
            return '<button class="seg-btn' + (isActive ? ' active' : '') + '" data-again="' + v + '" type="button" aria-pressed="' + isActive + '">' + (v === 'none' ? 'None' : v) + '</button>';
          }).join('') +
          '</div></div>';
      } else {
        againHtml =
          '<div class="field-note">' +
          'Again rule: <b>' + (again === 'none' ? 'no again' : again + '-again') + '</b> ' +
          '<span class="lock-note">(locked — ST or a completed Rules ordeal can choose freely)</span>' +
          '</div>';
      }

      // ── Rote — same gate, plus an eligibility note (Professional Training dots) ──
      var roteHtml = '';
      if (advanced) {
        var roteOn = !!state.rote[selected.id];
        var roteEligible = (d.character.professionalTrainingDots || 0) >= 5;
        roteHtml =
          '<button class="wide-toggle' + (roteOn ? ' active' : '') + '" data-rote-toggle="' + esc(selected.id) + '" type="button" aria-pressed="' + roteOn + '"' +
          (selected.kind === 'power' || selected.kind === 'special' ? ' disabled title="Rote applies to skill rolls in this mockup"' : '') + '>' +
          'Rote' + (roteEligible ? '' : ' <span class="wide-toggle-note">(PT ' + (d.character.professionalTrainingDots || 0) + '/5)</span>') +
          '</button>';
      }

      // ── WP (+3) — always visible to anyone, spends at roll time, disabled at 0. Except
      // Humanity Checks and Resisting Frenzy: both explicitly forbid spending Willpower for the
      // usual +3 (p.108, p.104) — so the toggle is hidden outright rather than merely disabled,
      // with a note explaining why (Frenzy's note points at its own turns-held stepper instead,
      // which is where Willpower actually does something on that roll). Clash of Wills is
      // conditional, not absolute: WP only bolsters the roll if physically present and aware
      // (p.126) — the "Present & Aware" toggle below decides which state applies. ──
      var wpBlockedByPresence = selected.rulesKind === 'clashofwills' && state.presentAware[selected.id] === false;
      var wpAllowed = selected.rulesKind !== 'humanitycheck' && selected.rulesKind !== 'resistfrenzy' && !wpBlockedByPresence;
      var wpOn = !!state.wp[selected.id];
      var wpDisabled = state.willpowerCurrent <= 0 && !wpOn;
      var wpHtml = wpAllowed
        ? '<button class="wide-toggle' + (wpOn ? ' active' : '') + '" data-wp-toggle="' + esc(selected.id) + '" type="button" aria-pressed="' + wpOn + '"' +
          (wpDisabled ? ' disabled' : '') + '>' +
          'WP (+' + wpBonusFor(selected) + ') <span class="wide-toggle-note">' + state.willpowerCurrent + '/' + d.character.willpowerMax + '</span>' +
          '</button>'
        : '<div class="field-note">' + (wpBlockedByPresence
            ? 'Willpower needs your character physically present and aware of the clash (p.126).'
            : selected.rulesKind === 'resistfrenzy'
              ? 'Willpower can\'t add +3 here — instead, spend it to hold off the Beast a turn at a time, below (p.104).'
              : 'Willpower cannot improve a Humanity Breaking Point roll (p.108).') + '</div>';

      controlsHtml =
        stepperHtml +
        '<div class="field-group">' + againHtml +
        (advanced ? '<div class="toggle-row">' + roteHtml + (wpAllowed ? wpHtml : '') + '</div>' + (wpAllowed ? '' : wpHtml)
          : '<div class="toggle-row">' + (wpAllowed ? wpHtml : '') + '</div>' + (wpAllowed ? '' : wpHtml)) +
        '</div>';

      // ── Lashing Out with the Beast — territory dots, repeat-target penalty, Kindred/Mortal
      // target toggle (p.91-92). Hunger's +1/+2 is automatic (hungerBonus()) and not shown as a
      // control here — it's read straight off the live Vitae card above. ──
      if (selected.rulesKind === 'lashout') {
        var territoryVal = state.territoryDots[selected.id] || 0;
        var repeatVal = state.repeatTarget[selected.id] || 0;
        var isKindred = state.targetKindred[selected.id] !== false;
        controlsHtml +=
          '<div class="steppers">' +
          '<div class="stepper">' +
          '<span class="stepper-label">Territory (Feeding Ground)</span>' +
          '<div class="stepper-row">' +
          '<button class="stepper-btn" data-lo-step="territory" data-delta="-1" type="button" aria-label="Decrease territory dots">−</button>' +
          '<span class="stepper-val">' + territoryVal + '</span>' +
          '<button class="stepper-btn" data-lo-step="territory" data-delta="1" type="button" aria-label="Increase territory dots">+</button>' +
          '</div></div>' +
          '<div class="stepper">' +
          '<span class="stepper-label">Repeat use (this target)</span>' +
          '<div class="stepper-row">' +
          '<button class="stepper-btn" data-lo-step="repeat" data-delta="-1" type="button" aria-label="Decrease repeat count">−</button>' +
          '<span class="stepper-val">' + repeatVal + '</span>' +
          '<button class="stepper-btn" data-lo-step="repeat" data-delta="1" type="button" aria-label="Increase repeat count">+</button>' +
          '</div></div>' +
          '</div>' +
          '<div class="field-note">' +
          'Target: <b>' + (isKindred ? 'Kindred (1 WP)' : 'Mortal (free)') + '</b> ' +
          '<span class="lock-note">(chosen when built — relaunch Lashing Out to pick again)</span>' +
          '</div>';
      }

      // ── Detecting Blood Sympathy — relation tier and passive/forced detection were both
      // chosen in the pop-up when built (p.98-99); shown here read-only, same pattern as
      // Lashing Out's target note. No continuous modifier applies to this roll. ──
      if (selected.rulesKind === 'bloodsym') {
        var forced = !!state.bsForced[selected.id];
        controlsHtml +=
          '<div class="field-note">' +
          'Relation: <b>' + esc(selected.tierLabel) + '</b> ' +
          '<span class="lock-note">(' + esc(selected.tierSub) + ')</span>' +
          '</div>' +
          '<div class="field-note">' +
          'Detection: <b>' + (forced ? 'Forced (1 WP)' : 'Passive (free)') + '</b> ' +
          '<span class="lock-note">(chosen when built — relaunch Detecting Blood Sympathy to pick again)</span>' +
          '</div>';
      }

      // ── Resist Blood Bond — Vitae ingested this drink was picked in the pop-up when built,
      // and is folded into the base above. Only the prior-resistance count against the same
      // regnant is a live per-roll modifier — a running tally across a scene, not a one-time
      // pick, so it stays an inline stepper (same shape as Lashing Out's repeat-target). ──
      if (selected.rulesKind === 'resistbond') {
        var priorVal = state.bondResistCount[selected.id] || 0;
        controlsHtml +=
          '<div class="steppers">' +
          '<div class="stepper">' +
          '<span class="stepper-label">Prior resistance (this regnant)</span>' +
          '<div class="stepper-row">' +
          '<button class="stepper-btn" data-rb-step="resist" data-delta="-1" type="button" aria-label="Decrease prior resistance count">−</button>' +
          '<span class="stepper-val">' + priorVal + '</span>' +
          '<button class="stepper-btn" data-rb-step="resist" data-delta="1" type="button" aria-label="Increase prior resistance count">+</button>' +
          '</div></div>' +
          '</div>' +
          '<div class="field-note">' +
          'Vitae ingested: <b>' + esc(selected.vitaeLabel) + '</b> ' +
          '<span class="lock-note">(chosen when built — relaunch Resist Blood Bond to pick again)</span>' +
          '</div>';
      }

      // ── Humanity Check — banes taken and the Masquerade/Requiem situational modifier are
      // both live, per-roll factors (p.107-108), so they stay inline; the Breaking Point level
      // and Touchstone modifier were both resolved when the card was built. ──
      if (selected.rulesKind === 'humanitycheck') {
        var banesVal = state.banesTaken[selected.id] || 0;
        var sitVal = state.situational[selected.id] || 'none';
        controlsHtml +=
          '<div class="stepper">' +
          '<span class="stepper-label">Banes taken (-1 each, max 3)</span>' +
          '<div class="stepper-row">' +
          '<button class="stepper-btn" data-hc-step="banes" data-delta="-1" type="button" aria-label="Decrease banes taken">−</button>' +
          '<span class="stepper-val">' + banesVal + '</span>' +
          '<button class="stepper-btn" data-hc-step="banes" data-delta="1" type="button" aria-label="Increase banes taken">+</button>' +
          '</div></div>' +
          '<div class="field">' +
          '<span class="field-label">Situational</span>' +
          '<div class="seg" role="group" aria-label="Situational modifier">' +
          [['none', 'None'], ['masquerade', 'Masquerade -1'], ['requiem', 'Requiem +1']].map(function (s) {
            var isActive = sitVal === s[0];
            return '<button class="seg-btn' + (isActive ? ' active' : '') + '" data-hc-sit="' + s[0] + '" type="button" aria-pressed="' + isActive + '">' + s[1] + '</button>';
          }).join('') +
          '</div></div>' +
          '<div class="field-note">' +
          'Touchstone: <b>' + (selected.touchstoneMod >= 0 ? '+' : '') + selected.touchstoneMod + '</b> ' +
          '<span class="lock-note">(from the character sheet — attached vs detached, resolved when built)</span>' +
          '</div>';
      }

      // ── Clash of Wills — "Present & Aware" gates the WP(+3) boost above (p.126); a real
      // per-roll situation, not a one-time pick, so it stays inline like Humanity Check's
      // Masquerade/Requiem toggle. Discipline and duration were both resolved when built. ──
      if (selected.rulesKind === 'clashofwills') {
        var awareOn = state.presentAware[selected.id] !== false;
        controlsHtml +=
          '<div class="field">' +
          '<span class="field-label">Present &amp; aware of the clash?</span>' +
          '<div class="seg" role="group" aria-label="Present and aware">' +
          '<button class="seg-btn' + (awareOn ? ' active' : '') + '" data-cw-aware="yes" type="button" aria-pressed="' + awareOn + '">Yes</button>' +
          '<button class="seg-btn' + (!awareOn ? ' active' : '') + '" data-cw-aware="no" type="button" aria-pressed="' + !awareOn + '">No</button>' +
          '</div></div>';
      }

      // ── Resisting Frenzy — "a point of Willpower holds off the Beast for one turn... take a
      // bonus die for each Willpower point spent" (p.104). This stepper both spends/refunds
      // real Willpower live and adds the matching +1-per-turn die, rather than the generic
      // WP(+3) toggle this roll explicitly can't use. ──
      if (selected.rulesKind === 'resistfrenzy') {
        var turnsHeld = state.frenzyTurnsHeld[selected.id] || 0;
        controlsHtml +=
          '<div class="stepper">' +
          '<span class="stepper-label">Turns held off (Willpower spent, +1 die each)</span>' +
          '<div class="stepper-row">' +
          '<button class="stepper-btn" data-frenzy-hold="-1" type="button" aria-label="Refund a turn held off"' + (turnsHeld <= 0 ? ' disabled' : '') + '>−</button>' +
          '<span class="stepper-val">' + turnsHeld + '</span>' +
          '<button class="stepper-btn" data-frenzy-hold="1" type="button" aria-label="Hold off the Beast another turn"' + (state.willpowerCurrent <= 0 ? ' disabled' : '') + '>+</button>' +
          '</div></div>';
      }

      // ── Defensive Reaction — Mental/Social/Physical loads the matching Resistance Attribute
      // (live, re-pickable per contest, not a one-time setup). Indomitable only offered if the
      // character's own sheet actually carries the merit (p.211) — never assumed. ──
      if (selected.rulesKind === 'defensivereact') {
        var aspectHtml =
          '<div class="seg" role="group" aria-label="Defensive Reaction aspect">' +
          Object.keys(DEFENSE_ASPECTS).map(function (key) {
            var isActive = state.defenseAspect === key;
            return '<button class="seg-btn' + (isActive ? ' active' : '') + '" data-defense-aspect="' + key + '" type="button" aria-pressed="' + isActive + '">' + DEFENSE_ASPECTS[key].label + '</button>';
          }).join('') +
          '</div>';
        controlsHtml += '<div class="field-group">' + aspectHtml + '</div>';

        if (d.character.hasIndomitable || d.character.closedBookDots) {
          var merits = '';
          if (d.character.hasIndomitable) {
            var indomOn = !!state.indomitableOn[selected.id];
            merits += '<button class="mod-chip' + (indomOn ? ' active' : '') + '" data-indomitable-toggle="' + esc(selected.id) + '" type="button" aria-pressed="' + indomOn + '">' +
              'Indomitable (p.211) +2' +
              '</button>';
          }
          if (d.character.closedBookDots) {
            var cbOn = !!state.closedBookOn[selected.id];
            merits += '<button class="mod-chip' + (cbOn ? ' active' : '') + '" data-closedbook-toggle="' + esc(selected.id) + '" type="button" aria-pressed="' + cbOn + '">' +
              'Closed Book (&bull;' + d.character.closedBookDots + ') +' + d.character.closedBookDots +
              '</button>';
          }
          controlsHtml += '<div class="mods-row">' + merits + '</div>';
        }
      }

      // ── Contested roll ──
      var contestedOn = !!state.contested[selected.id];
      var resistVal = state.resistPool[selected.id] || 0;
      controlsHtml +=
        '<button class="contested-btn' + (contestedOn ? ' active' : '') + '" data-contested-toggle="' + esc(selected.id) + '" type="button" aria-pressed="' + contestedOn + '">' +
        'Contested Roll' +
        '</button>' +
        (contestedOn
          ? '<div class="stepper stepper--resist">' +
            '<span class="stepper-label">Resistance pool</span>' +
            '<div class="stepper-row">' +
            '<button class="stepper-btn" data-step="resist" data-delta="-1" type="button" aria-label="Decrease resistance pool">−</button>' +
            '<span class="stepper-val">' + resistVal + '</span>' +
            '<button class="stepper-btn" data-step="resist" data-delta="1" type="button" aria-label="Increase resistance pool">+</button>' +
            '</div></div>'
          : '');

      // ── CRD mockup: "Challenge a player" — fires a real contest at another real fixture
      // character's own queue (poll target), instead of rolling both sides on this device.
      // Only useful once the roster's loaded and there's someone else to target. ──
      if (state.roster.length && selected) {
        var rosterOptionsHtml = state.roster.map(function (p) {
          return '<option value="' + esc(p.name) + '"' + (p.name === state.challengeTarget ? ' selected' : '') + '>' + esc(p.name) + '</option>';
        }).join('');
        controlsHtml +=
          '<div class="challenge-panel">' +
          '<span class="stepper-label">Challenge a player</span>' +
          '<div class="challenge-row">' +
          '<select class="challenge-select" id="challengeTargetSelect">' + rosterOptionsHtml + '</select>' +
          '<button class="challenge-send-btn" type="button" data-send-challenge="' + esc(selected.id) + '">Send Contest</button>' +
          '</div>' +
          (state.challengeSentLabel ? '<div class="field-note">' + esc(state.challengeSentLabel) + '</div>' : '') +
          '</div>';
      }

      // ── Pool breakdown disclosure ──
      var bOpen = !!state.breakdownOpen[selected.id];
      var rows = [];
      rows.push(['Base', base]);
      if (bonus) rows.push(['Modifier chips', (bonus >= 0 ? '+' : '') + bonus]);
      if (mod) rows.push(['Mod stepper', (mod >= 0 ? '+' : '') + mod]);
      if (selected.rulesKind === 'lashout') {
        var hb = hungerBonus();
        if (hb) rows.push([state.vitaeCurrent <= STARVING_VITAE ? 'Starving' : 'Hungry', '+' + hb]);
        var terr = state.territoryDots[selected.id] || 0;
        if (terr) rows.push(['Territory (Feeding Ground)', '+' + terr]);
        var rep = state.repeatTarget[selected.id] || 0;
        if (rep) rows.push(['Repeat use on this target', '-' + rep]);
      }
      if (selected.rulesKind === 'resistbond') {
        var priorRow = state.bondResistCount[selected.id] || 0;
        if (priorRow) rows.push(['Prior resistance (this regnant)', '-' + priorRow]);
      }
      if (selected.rulesKind === 'humanitycheck') {
        var banesRow = state.banesTaken[selected.id] || 0;
        if (banesRow) rows.push(['Banes taken', '-' + banesRow]);
        var sitRow = state.situational[selected.id] || 'none';
        if (sitRow === 'masquerade') rows.push(['Protecting the Masquerade', '-1']);
        if (sitRow === 'requiem') rows.push(['Protecting the Requiem', '+1']);
      }
      if (selected.rulesKind === 'resistfrenzy') {
        var fh = frenzyHungerPenalty();
        if (fh) rows.push([state.vitaeCurrent <= STARVING_VITAE ? 'Starving' : 'Hungry', fh]);
        FRENZY_MODIFIERS.forEach(function (m) {
          if (state.frenzyModOn[selected.id + '::' + m.key]) rows.push([m.label, (m.value >= 0 ? '+' : '') + m.value]);
        });
        var turnsRow = state.frenzyTurnsHeld[selected.id] || 0;
        if (turnsRow) rows.push(['Turns held off', '+' + turnsRow]);
      }
      if (selected.rulesKind === 'defensivereact') {
        if (indomitableBonus(selected)) rows.push(['Indomitable (p.211)', '+2']);
        var cbBonus = closedBookBonus(selected);
        if (cbBonus) rows.push(['Closed Book', '+' + cbBonus]);
      }
      if (state.wp[selected.id]) rows.push(['Willpower boost', '+' + wpBonusFor(selected)]);
      rows.push(['Again', again === 'none' ? 'no again' : again + '-again']);
      breakdownHtml =
        '<details class="breakdown-details" data-breakdown-toggle="' + esc(selected.id) + '"' + (bOpen ? ' open' : '') + '>' +
        '<summary class="breakdown-summary"><span class="chevron"></span>Pool breakdown</summary>' +
        '<div class="breakdown">' +
        rows.map(function (r) { return '<div class="breakdown-row"><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>'; }).join('') +
        '</div></details>';

      // ── result panel ──
      if (state.lastResult && state.lastResult.item === selected.name) {
        var res = state.lastResult.result;
        var diceHtml = '';
        if (res.kind === 'contested') {
          diceHtml =
            '<div class="dice-group"><span class="dice-group-label">You</span>' + renderDiceTiles(res.diceA) + '</div>' +
            '<div class="dice-group"><span class="dice-group-label">Resistance</span>' + renderDiceTiles(res.diceR) + '</div>';
        } else if (res.dice2) {
          diceHtml =
            '<div class="dice-group"><span class="dice-group-label">Attempt 1' + (res.roteKept === 1 ? ' — kept' : '') + '</span>' + renderDiceTiles(res.dice) + '</div>' +
            '<div class="dice-group"><span class="dice-group-label">Attempt 2 (rote)' + (res.roteKept === 2 ? ' — kept' : '') + '</span>' + renderDiceTiles(res.dice2) + '</div>';
        } else if (res.dice) {
          diceHtml = renderDiceTiles(res.dice);
        }
        resultHtml =
          '<div class="result result--' + res.cls + '">' +
          '<div class="result-top"><span class="result-count">' + res.count + '</span><span class="result-label">' + esc(res.label) + '</span></div>' +
          '<div class="result-detail">' + esc(res.detail) + '</div>' +
          diceHtml +
          '</div>';
      } else {
        resultHtml = '<div class="result result--empty">No rolls yet</div>';
      }
    }

    var historyHtml = state.history.length
      ? state.history.map(function (h) {
          return '<div class="hist-row"><span>' + esc(h.item) + '</span><span class="hist-row-r hist-row--' + h.result.cls + '">' + esc(h.result.label) + ' (' + h.result.count + ')</span></div>';
        }).join('')
      : '<div class="hist-empty">No rolls yet</div>';

    appEl.innerHTML =
      '<div class="topbar">' +
      '<div class="char-chip">' +
      '<div class="char-avatar">' + esc(initials(d.character.name)) + '</div>' +
      '<div>' +
      '<div class="char-name">' + esc(d.character.name) + '</div>' +
      '<div class="char-sub">' + esc(d.character.clan) + ' · ' + esc(d.character.covenant) + ' · BP ' + esc(d.character.bloodPotency) + '</div>' +
      '</div></div></div>' +

      '<div class="pill-row">' +
      '<span class="pill pill--build"><span class="pill-dot"></span>Roller v2</span>' +
      (d.character.rulesOrdealComplete ? '<span class="pill pill--ordeal">Rules ordeal complete</span>' : '') +
      '</div>' +

      '<div class="vitals-row">' +
      '<div class="vital-card vital-card--vitae">' +
      '<span class="vital-label">Vitae</span>' +
      '<span class="vital-value">' + state.vitaeCurrent + '<span class="vital-max">/' + d.character.vitaeMax + '</span></span>' +
      '</div>' +
      '<div class="vital-card vital-card--wp">' +
      '<span class="vital-label">Willpower</span>' +
      '<span class="vital-value">' + state.willpowerCurrent + '<span class="vital-max">/' + d.character.willpowerMax + '</span></span>' +
      '</div>' +
      '</div>' +

      '<div class="picker">' +
      '<div class="picker-section" data-open="' + state.sectionOpen.secQueue + '" id="secQueue">' +
      '<button class="picker-head" data-toggle="secQueue" type="button" aria-expanded="' + state.sectionOpen.secQueue + '">' +
      '<span class="picker-head-label">Queue <span class="picker-count">' + pendingQueue.length + '</span></span>' +
      '<span class="chevron"></span></button>' +
      '<div class="picker-body-wrap"><div class="picker-body"><div class="picker-body-inner">' + queueRowsHtml + '</div></div></div>' +
      '</div>' +
      '<div class="picker-section" data-open="' + state.sectionOpen.secSkills + '" id="secSkills">' +
      '<button class="picker-head" data-toggle="secSkills" type="button" aria-expanded="' + state.sectionOpen.secSkills + '">' +
      '<span class="picker-head-label">Skills <span class="picker-count">' + d.skills.length + '</span></span>' +
      '<span class="chevron"></span></button>' +
      '<div class="picker-body-wrap"><div class="picker-body"><div class="picker-body-inner">' + skillsHtml + '</div></div></div>' +
      '</div>' +
      '<div class="picker-section" data-open="' + state.sectionOpen.secDisc + '" id="secDisc">' +
      '<button class="picker-head" data-toggle="secDisc" type="button" aria-expanded="' + state.sectionOpen.secDisc + '">' +
      '<span class="picker-head-label">Disciplines <span class="picker-count">' + d.powers.length + '</span></span>' +
      '<span class="chevron"></span></button>' +
      '<div class="picker-body-wrap"><div class="picker-body"><div class="picker-body-inner">' + powersHtml + '</div></div></div>' +
      '</div>' +
      '<div class="picker-section" data-open="' + state.sectionOpen.secSpecial + '" id="secSpecial">' +
      '<button class="picker-head" data-toggle="secSpecial" type="button" aria-expanded="' + state.sectionOpen.secSpecial + '">' +
      '<span class="picker-head-label">Special <span class="picker-count">' + specialItems.length + '</span></span>' +
      '<span class="chevron"></span></button>' +
      '<div class="picker-body-wrap"><div class="picker-body"><div class="picker-body-inner">' + specialHtml + '</div></div></div>' +
      '</div>' +
      '</div>' +

      '<button class="freebuild-btn" id="freeBuildBtn" type="button">Free Build</button>' +

      rulesHtml + modsHtml + controlsHtml +

      '<div class="anchor">' +
      '<div class="anchor-num' + (eff <= 0 ? ' is-text' : '') + '" id="anchorNum">' + poolDisplay(eff) + '</div>' +
      '</div>' +

      breakdownHtml +

      '<button class="roll-btn" type="button" data-roll="' + (selected ? esc(selected.id) : '') + '">' + rollLabel + '</button>' +

      resultHtml +

      '<div class="history">' +
      '<div class="history-head"><span>History</span><button class="clear-btn" type="button" id="clearHist">Clear</button></div>' +
      historyHtml +
      '</div>' +

      renderFreeBuildModal() +
      renderLashingOutModal() +
      renderBloodSympathyModal() +
      renderResistBondModal() +
      renderHumanityCheckModal() +
      renderClashOfWillsModal();

    wire();
  }

  function wire() {
    appEl.querySelectorAll('.pool-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.selectedId = btn.getAttribute('data-id');
        render();
      });
    });
    var freeBuildBtn = document.getElementById('freeBuildBtn');
    if (freeBuildBtn) {
      freeBuildBtn.addEventListener('click', function () {
        state.fb = { open: true, step: 1, attr: null, skill: null, disc: null };
        render();
      });
    }
    var fbClose = document.getElementById('fbClose');
    if (fbClose) {
      fbClose.addEventListener('click', function () {
        state.fb = { open: false, step: 1, attr: null, skill: null, disc: null };
        render();
      });
    }
    var fbBack = document.getElementById('fbBack');
    if (fbBack) {
      fbBack.addEventListener('click', function () {
        if (state.fb.step === 3) { state.fb.step = 2; state.fb.skill = null; }
        else if (state.fb.step === 2) { state.fb.step = 1; state.fb.attr = null; }
        render();
      });
    }
    var lashingOutBtn = document.getElementById('lashingOutBtn');
    if (lashingOutBtn) {
      lashingOutBtn.addEventListener('click', function () {
        state.lo = { open: true, step: 'aspect', aspectKey: null };
        render();
      });
    }
    var loClose = document.getElementById('loClose');
    if (loClose) {
      loClose.addEventListener('click', function () {
        state.lo = { open: false, step: 'aspect', aspectKey: null };
        render();
      });
    }
    var loBack = document.getElementById('loBack');
    if (loBack) {
      loBack.addEventListener('click', function () {
        state.lo.step = 'aspect';
        state.lo.aspectKey = null;
        render();
      });
    }
    appEl.querySelectorAll('[data-lo-pick]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        pickLashingOutAspect(btn.getAttribute('data-lo-pick'));
      });
    });
    appEl.querySelectorAll('[data-lo-target-pick]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        finishLashingOut(btn.getAttribute('data-lo-target-pick') === 'kindred');
      });
    });
    var bloodSymBtn = document.getElementById('bloodSymBtn');
    if (bloodSymBtn) {
      bloodSymBtn.addEventListener('click', function () {
        state.bs = { open: true, step: 'tier', tierKey: null };
        render();
      });
    }
    var bsClose = document.getElementById('bsClose');
    if (bsClose) {
      bsClose.addEventListener('click', function () {
        state.bs = { open: false, step: 'tier', tierKey: null };
        render();
      });
    }
    var bsBack = document.getElementById('bsBack');
    if (bsBack) {
      bsBack.addEventListener('click', function () {
        state.bs.step = 'tier';
        state.bs.tierKey = null;
        render();
      });
    }
    appEl.querySelectorAll('[data-bs-pick]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        pickBloodSympathyTier(btn.getAttribute('data-bs-pick'));
      });
    });
    appEl.querySelectorAll('[data-bs-force-pick]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        finishBloodSympathy(btn.getAttribute('data-bs-force-pick') === 'forced');
      });
    });
    var resistBondBtn = document.getElementById('resistBondBtn');
    if (resistBondBtn) {
      resistBondBtn.addEventListener('click', function () {
        state.rb = { open: true };
        render();
      });
    }
    var rbClose = document.getElementById('rbClose');
    if (rbClose) {
      rbClose.addEventListener('click', function () {
        state.rb = { open: false };
        render();
      });
    }
    appEl.querySelectorAll('[data-rb-pick]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        finishResistBond(btn.getAttribute('data-rb-pick'));
      });
    });
    var humanityCheckBtn = document.getElementById('humanityCheckBtn');
    if (humanityCheckBtn) {
      humanityCheckBtn.addEventListener('click', function () {
        state.hc = { open: true, step: 'grid', level: null };
        render();
      });
    }
    var hcClose = document.getElementById('hcClose');
    if (hcClose) {
      hcClose.addEventListener('click', function () {
        state.hc = { open: false, step: 'grid', level: null };
        render();
      });
    }
    var hcBack = document.getElementById('hcBack');
    if (hcBack) {
      hcBack.addEventListener('click', function () {
        state.hc.step = 'grid';
        state.hc.level = null;
        render();
      });
    }
    var hcConfirm = document.getElementById('hcConfirm');
    if (hcConfirm) {
      hcConfirm.addEventListener('click', function () {
        finishHumanityCheck();
      });
    }
    var hcLower = document.getElementById('hcLower');
    if (hcLower) {
      hcLower.addEventListener('click', function () {
        stepHumanityLevel(-1);
      });
    }
    var hcHigher = document.getElementById('hcHigher');
    if (hcHigher) {
      hcHigher.addEventListener('click', function () {
        stepHumanityLevel(1);
      });
    }
    appEl.querySelectorAll('[data-hc-pick]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        pickHumanityLevel(parseInt(btn.getAttribute('data-hc-pick'), 10));
      });
    });
    appEl.querySelectorAll('[data-hc-sit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.situational[state.selectedId] = btn.getAttribute('data-hc-sit');
        render();
      });
    });
    var clashOfWillsBtn = document.getElementById('clashOfWillsBtn');
    if (clashOfWillsBtn) {
      clashOfWillsBtn.addEventListener('click', function () {
        state.cw = { open: true, step: 'power', discName: null };
        render();
      });
    }
    var cwClose = document.getElementById('cwClose');
    if (cwClose) {
      cwClose.addEventListener('click', function () {
        state.cw = { open: false, step: 'power', discName: null };
        render();
      });
    }
    var cwBack = document.getElementById('cwBack');
    if (cwBack) {
      cwBack.addEventListener('click', function () {
        state.cw.step = 'power';
        state.cw.discName = null;
        render();
      });
    }
    appEl.querySelectorAll('[data-cw-pick]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        pickClashPower(btn.getAttribute('data-cw-pick'));
      });
    });
    appEl.querySelectorAll('[data-cw-duration]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        finishClashOfWills(btn.getAttribute('data-cw-duration'));
      });
    });
    appEl.querySelectorAll('[data-cw-aware]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.presentAware[state.selectedId] = btn.getAttribute('data-cw-aware') === 'yes';
        render();
      });
    });
    appEl.querySelectorAll('[data-frenzy-mod-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-frenzy-mod-toggle');
        state.frenzyModOn[key] = !state.frenzyModOn[key];
        render();
      });
    });
    appEl.querySelectorAll('[data-frenzy-hold]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var delta = parseInt(btn.getAttribute('data-frenzy-hold'), 10);
        var id = state.selectedId;
        var cur = state.frenzyTurnsHeld[id] || 0;
        // Live-spends/refunds real Willpower as the stepper moves — this isn't a flat toggle,
        // it's "you're now choosing to stall one more turn," same honesty as every other real
        // Vitae/Willpower deduction in this mockup.
        if (delta > 0 && state.willpowerCurrent > 0) {
          state.frenzyTurnsHeld[id] = cur + 1;
          state.willpowerCurrent -= 1;
        } else if (delta < 0 && cur > 0) {
          state.frenzyTurnsHeld[id] = cur - 1;
          state.willpowerCurrent += 1;
        }
        render();
      });
    });
    appEl.querySelectorAll('[data-defense-aspect]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.defenseAspect = btn.getAttribute('data-defense-aspect');
        render();
      });
    });
    var indomBtn = appEl.querySelector('[data-indomitable-toggle]');
    if (indomBtn) {
      indomBtn.addEventListener('click', function () {
        var id = indomBtn.getAttribute('data-indomitable-toggle');
        state.indomitableOn[id] = !state.indomitableOn[id];
        render();
      });
    }
    var closedBookBtn = appEl.querySelector('[data-closedbook-toggle]');
    if (closedBookBtn) {
      closedBookBtn.addEventListener('click', function () {
        var id = closedBookBtn.getAttribute('data-closedbook-toggle');
        state.closedBookOn[id] = !state.closedBookOn[id];
        render();
      });
    }
    appEl.querySelectorAll('[data-fb-pick]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var kind = btn.getAttribute('data-fb-pick');
        var name = btn.getAttribute('data-fb-name');
        var fb = state.data.freeBuild;
        if (kind === 'attr') {
          var flat = fb.attributeGrid[0].concat(fb.attributeGrid[1], fb.attributeGrid[2]);
          state.fb.attr = flat.find(function (a) { return a.name === name; });
          state.fb.step = 2;
        } else if (kind === 'skill') {
          state.fb.skill = fb.skillGrid.find(function (s) { return s.name === name; });
          state.fb.step = 3;
        } else if (kind === 'skill-unskilled') {
          var penalty = parseInt(btn.getAttribute('data-fb-penalty'), 10);
          state.fb.skill = { name: btn.getAttribute('data-fb-unskilled-name'), value: penalty, specs: [], nineAgain: false };
          state.fb.step = 3;
        } else if (kind === 'disc') {
          state.fb.disc = fb.disciplineGrid.find(function (dd) { return dd.name === name; });
          finishFreeBuild();
          return;
        } else if (kind === 'disc-skip') {
          state.fb.disc = null;
          finishFreeBuild();
          return;
        }
        render();
      });
    });
    appEl.querySelectorAll('[data-toggle]').forEach(function (head) {
      head.addEventListener('click', function () {
        var id = head.getAttribute('data-toggle');
        state.sectionOpen[id] = !state.sectionOpen[id];
        render();
      });
    });
    var meritBtn = appEl.querySelector('[data-merit-toggle]');
    if (meritBtn) {
      meritBtn.addEventListener('click', function () {
        var id = meritBtn.getAttribute('data-merit-toggle');
        state.meritOn[id] = !state.meritOn[id];
        render();
      });
    }
    appEl.querySelectorAll('[data-spec-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-spec-toggle');
        state.specOn[key] = !state.specOn[key];
        render();
      });
    });
    var rulesDetails = appEl.querySelector('[data-rules-toggle]');
    if (rulesDetails) {
      rulesDetails.addEventListener('toggle', function () {
        state.rulesOpen[rulesDetails.getAttribute('data-rules-toggle')] = rulesDetails.open;
      });
    }
    var breakdownDetails = appEl.querySelector('[data-breakdown-toggle]');
    if (breakdownDetails) {
      breakdownDetails.addEventListener('toggle', function () {
        state.breakdownOpen[breakdownDetails.getAttribute('data-breakdown-toggle')] = breakdownDetails.open;
      });
    }
    appEl.querySelectorAll('[data-step]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var kind = btn.getAttribute('data-step');
        var delta = parseInt(btn.getAttribute('data-delta'), 10);
        var id = state.selectedId;
        if (kind === 'base') state.base[id] = Math.max(-5, Math.min(40, getBase(findItem(id)) + delta));
        else if (kind === 'mod') state.mod[id] = Math.max(-10, Math.min(10, getMod(findItem(id)) + delta));
        else if (kind === 'resist') state.resistPool[id] = Math.max(0, (state.resistPool[id] || 0) + delta);
        render();
      });
    });
    appEl.querySelectorAll('[data-lo-step]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var kind = btn.getAttribute('data-lo-step');
        var delta = parseInt(btn.getAttribute('data-delta'), 10);
        var id = state.selectedId;
        if (kind === 'territory') state.territoryDots[id] = Math.max(0, Math.min(5, (state.territoryDots[id] || 0) + delta));
        else if (kind === 'repeat') state.repeatTarget[id] = Math.max(0, (state.repeatTarget[id] || 0) + delta);
        render();
      });
    });
    appEl.querySelectorAll('[data-rb-step]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var kind = btn.getAttribute('data-rb-step');
        var delta = parseInt(btn.getAttribute('data-delta'), 10);
        var id = state.selectedId;
        if (kind === 'resist') state.bondResistCount[id] = Math.max(0, (state.bondResistCount[id] || 0) + delta);
        render();
      });
    });
    appEl.querySelectorAll('[data-hc-step]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var kind = btn.getAttribute('data-hc-step');
        var delta = parseInt(btn.getAttribute('data-delta'), 10);
        var id = state.selectedId;
        // A character may only have three banes (p.108).
        if (kind === 'banes') state.banesTaken[id] = Math.max(0, Math.min(3, (state.banesTaken[id] || 0) + delta));
        render();
      });
    });
    appEl.querySelectorAll('[data-again]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var v = btn.getAttribute('data-again');
        state.again[state.selectedId] = v === 'none' ? 'none' : parseInt(v, 10);
        render();
      });
    });
    var roteBtn = appEl.querySelector('[data-rote-toggle]');
    if (roteBtn) {
      roteBtn.addEventListener('click', function () {
        var id = roteBtn.getAttribute('data-rote-toggle');
        state.rote[id] = !state.rote[id];
        render();
      });
    }
    var wpBtn = appEl.querySelector('[data-wp-toggle]');
    if (wpBtn) {
      wpBtn.addEventListener('click', function () {
        var id = wpBtn.getAttribute('data-wp-toggle');
        state.wp[id] = !state.wp[id];
        render();
      });
    }
    var contestedBtn = appEl.querySelector('[data-contested-toggle]');
    if (contestedBtn) {
      contestedBtn.addEventListener('click', function () {
        var id = contestedBtn.getAttribute('data-contested-toggle');
        state.contested[id] = !state.contested[id];
        render();
      });
    }
    var rollBtn = appEl.querySelector('[data-roll]');
    if (rollBtn) {
      rollBtn.addEventListener('click', function () {
        var item = findItem(rollBtn.getAttribute('data-roll'));
        if (item) executeRoll(item);
      });
    }

    // ── CRD mockup: Challenge panel + Queue row handlers ──
    var challengeSelect = document.getElementById('challengeTargetSelect');
    if (challengeSelect) {
      challengeSelect.addEventListener('change', function () {
        state.challengeTarget = challengeSelect.value;
        // Deliberately no render() here — this is a plain uncontrolled <select> read at send
        // time; re-rendering on every keystroke/selection would fight the browser's own native
        // dropdown interaction for no benefit (nothing else on screen depends on this value).
      });
    }
    var sendChallengeBtn = appEl.querySelector('[data-send-challenge]');
    if (sendChallengeBtn) {
      sendChallengeBtn.addEventListener('click', function () {
        var item = findItem(sendChallengeBtn.getAttribute('data-send-challenge'));
        var target = (challengeSelect && challengeSelect.value) || state.challengeTarget;
        if (!item || !target || !state.data) return;
        fetch('/api/challenges', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sourceName: state.data.character.name,
            targetName: target,
            rollLabel: item.name,
            rollFormula: item.fullFormula || item.formula || '',
          }),
        })
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function () {
            state.challengeTarget = target;
            state.challengeSentLabel = 'Contest sent to ' + target + ' — check their Queue.';
            render();
            setTimeout(function () { state.challengeSentLabel = null; render(); }, 4000);
          })
          .catch(function (err) {
            state.challengeSentLabel = 'Could not send contest: ' + err.message;
            render();
          });
      });
    }
    appEl.querySelectorAll('[data-resolve-challenge]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-resolve-challenge');
        var challenge = state.queue.find(function (q) { return q.id === id; });
        fetch('/api/challenges/' + encodeURIComponent(id) + '/resolve', { method: 'PUT' })
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function (updated) {
            var row = state.queue.find(function (q) { return q.id === id; });
            if (row) { row.status = updated.status; row.resolvedAt = updated.resolvedAt; }
            // Route into the matching roll on THIS device, per Winston's "queue is a routing
            // layer, not a resolution layer" — try skills, powers, then special, by name. If
            // nothing matches (e.g. the attacker used a Discipline this character doesn't
            // have), fall back to Defensive Reaction — the generic contested-defence pool —
            // rather than leaving the defender with nothing to build.
            if (challenge && state.data) {
              var all = state.data.skills.concat(state.data.powers).concat(state.data.special || []);
              var match = all.find(function (it) { return it.name === challenge.rollLabel; });
              state.sectionOpen.secQueue = false;
              if (match) {
                state.selectedId = match.id;
                state.sectionOpen.secSkills = state.data.skills.indexOf(match) !== -1;
                state.sectionOpen.secDisc = state.data.powers.indexOf(match) !== -1;
                state.sectionOpen.secSpecial = (state.data.special || []).indexOf(match) !== -1;
              } else {
                state.selectedId = 'defensivereact';
                state.sectionOpen.secSkills = false;
                state.sectionOpen.secDisc = false;
                state.sectionOpen.secSpecial = true;
              }
            }
            render();
          })
          .catch(function () { /* transient — next poll tick reconciles the row's real state */ });
      });
    });
    var clearBtn = document.getElementById('clearHist');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        state.history = [];
        state.lastResult = null;
        render();
      });
    }
  }

  // ── CRD mockup: which character is "this device" ──
  // ?as=<name> lets duo.html's two iframes (or two plain browser tabs) load two different real
  // fixture characters as two independent devices. Omitted entirely, this is byte-identical to
  // the original single-character mockup (server.mjs falls back to CHARACTER_NAME).
  var CHAR_QUERY = new URLSearchParams(location.search).get('as');
  var CHAR_API_URL = '/api/character' + (CHAR_QUERY ? '?char=' + encodeURIComponent(CHAR_QUERY) : '');

  var queuePollTimer = null;
  function pollQueue() {
    if (!state.data || document.visibilityState !== 'visible') return;
    fetch('/api/challenges?target=' + encodeURIComponent(state.data.character.name))
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        state.queue = rows;
        render();
      })
      .catch(function () { /* one missed poll self-heals on the next tick — no retry/ack machinery,
        matching Winston's "shared clipboard with a timestamp" framing from the party-mode session */ });
  }
  function startQueuePoll() {
    pollQueue();
    if (queuePollTimer) clearInterval(queuePollTimer);
    queuePollTimer = setInterval(pollQueue, 3000);
  }

  function fetchRoster() {
    fetch('/api/roster')
      .then(function (r) { return r.json(); })
      .then(function (list) {
        var selfName = state.data && state.data.character.name;
        state.roster = list.filter(function (p) { return p.name !== selfName; });
        if (!state.challengeTarget && state.roster.length) state.challengeTarget = state.roster[0].name;
        render();
      })
      .catch(function () { /* the Challenge panel just stays hidden — roster is a demo convenience, not core to the mockup */ });
  }

  fetch(CHAR_API_URL)
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      state.data = data;
      state.willpowerCurrent = data.character.willpowerMax;
      state.vitaeCurrent = data.character.vitaeMax;
      // Air of Menace starts "remembered" (on) for its skill, matching the earlier static
      // mockup's framing of a pre-toggled remembered modifier. Only Yusuf carries this merit —
      // characters loaded via ?as= simply skip this if they don't have it.
      var withMerit = data.skills.find(function (s) { return s.merit; });
      if (withMerit) {
        state.meritOn[withMerit.id] = true;
        state.selectedId = withMerit.id;
      }
      render();
      fetchRoster();
      startQueuePoll();
    })
    .catch(function (err) {
      appEl.innerHTML = '<div class="error-box">Could not load character data: ' + esc(err.message) + '<br><br>Is the server running from the right directory? It reads <code>data/dev-fixtures/characters.json</code> from the real TM Game repo path.</div>';
    });
})();
