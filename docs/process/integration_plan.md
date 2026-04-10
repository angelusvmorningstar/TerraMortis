# ST Suite + Editor Integration Plan

## Architecture: Shared Data Layer

The v2 schema is the single source of truth. Both the Suite and the Editor read and write v2 format. A shared accessor module sits between the data and the consumers.

```
┌─────────────────────────────────────────────────────┐
│                   localStorage                       │
│              tm_chars_db  (v2 JSON)                  │
└────────────────────┬────────────────────────────────┘
                     │
          ┌──────────┴──────────┐
          │   DATA ACCESSORS    │
          │   (shared module)   │
          └──────────┬──────────┘
          ┌──────────┴──────────┐
     ┌────┴────┐          ┌────┴────┐
     │  Suite  │          │ Editor  │
     │  Tabs   │          │  Tabs   │
     └─────────┘          └─────────┘
```

## Why a shared accessor layer

The Suite currently has ~90 direct data access points spread across:
- `getPool()` reads `char.attributes[name]` directly (expects int, gets v2 object)
- `getResistTokenVal()` reads `char.attributes?.[tok.key]` directly
- Sheet renderer reads `c.skills[s]` directly
- Influence rendering reads `c.influence[]` (no longer exists in v2)

Rather than refactoring every call site, we:
1. Provide accessor functions that read v2 format cleanly
2. Replace the 6 current accessor functions with v2-native versions
3. Fix the ~15 direct attribute/skill accesses in getPool and getResistTokenVal to use accessors
4. Add new accessors for the restructured data (merits by category, derived stats)

Total refactor scope in the Suite: ~25 code changes, all mechanical.

## Accessor Functions (shared)

```js
// ── Attributes ──
function attrDots(c, a)  { return c.attributes?.[a]?.dots || 0; }
function attrBonus(c, a) { return c.attributes?.[a]?.bonus || 0; }
function attrTotal(c, a) { return attrDots(c,a) + attrBonus(c,a); }

// ── Skills ──
function skillObj(c, s) {
  return c.skills?.[s] || { dots:0, bonus:0, specs:[], nine_again:false };
}
function skDots(c, s)     { return c.skills?.[s]?.dots || 0; }
function skBonus(c, s)    { return c.skills?.[s]?.bonus || 0; }
function skTotal(c, s)    { return skDots(c,s) + skBonus(c,s); }
function skSpecs(c, s)    { return c.skills?.[s]?.specs || []; }
function skSpecStr(c, s)  { return skSpecs(c,s).join(', '); }
function skNineAgain(c,s) { return c.skills?.[s]?.nine_again || false; }

// ── Merits by category ──
function meritsByCategory(c, cat) {
  return (c.merits || []).filter(m => m.category === cat);
}
function influenceMerits(c)  { return meritsByCategory(c, 'influence'); }
function domainMerits(c)     { return meritsByCategory(c, 'domain'); }
function standingMerits(c)   { return meritsByCategory(c, 'standing'); }
function generalMerits(c)    { return meritsByCategory(c, 'general'); }
function manoeuvres(c)       { return meritsByCategory(c, 'manoeuvre'); }

// ── Influence total ──
function influenceTotal(c) {
  return influenceMerits(c).reduce((s, m) => s + (m.rating || 0), 0);
}

// ── Domain shortcuts ──
function domainRating(c, name) {
  const m = domainMerits(c).find(m => m.name === name);
  return m ? m.rating : 0;
}

// ── Powers by category ──
function discPowers(c, discName) {
  return (c.powers || []).filter(p => p.category === 'discipline' && p.discipline === discName);
}
function devotions(c) {
  return (c.powers || []).filter(p => p.category === 'devotion');
}
function rites(c, tradition) {
  const all = (c.powers || []).filter(p => p.category === 'rite');
  return tradition ? all.filter(r => r.tradition === tradition) : all;
}
function pacts(c) {
  return (c.powers || []).filter(p => p.category === 'pact');
}

// ── Derived stats ──
function calcSize(c) {
  const giant = (c.merits || []).find(m => m.name === 'Giant');
  return 5 + (giant ? 1 : 0);
}
function calcSpeed(c) {
  const str = attrDots(c, 'Strength');
  const dex = attrDots(c, 'Dexterity');
  const sz  = calcSize(c);
  const fleet = (c.merits || []).find(m => m.name === 'Fleet of Foot');
  return str + dex + sz + (fleet ? fleet.rating : 0);
}
function calcDefence(c) {
  const dex = attrDots(c, 'Dexterity');
  const wits = attrDots(c, 'Wits');
  const base = Math.min(dex, wits);
  // Defensive Combat merit
  const dc = (c.merits || []).find(m => m.name === 'Defensive Combat');
  if (dc) {
    const skill = dc.qualifier; // "Brawl" or "Weaponry"
    return base + skDots(c, skill);
  }
  return base + skDots(c, 'Athletics');
}
function calcHealth(c)       { return attrDots(c, 'Stamina') + calcSize(c); }
function calcWillpowerMax(c) { return attrDots(c, 'Resolve') + attrDots(c, 'Composure'); }
function xpLeft(c)           { return (c.xp_total || 0) - (c.xp_spent || 0); }

// BP lookup table (VtR 2e core p.101)
const BP_TABLE = {
  0:{vitae:5,per_turn:1,surge:1,mend:1,feed:'animal'},
  1:{vitae:10,per_turn:1,surge:1,mend:1,feed:'animal'},
  2:{vitae:11,per_turn:2,surge:1,mend:1,feed:'animal'},
  3:{vitae:12,per_turn:3,surge:2,mend:1,feed:'human'},
  4:{vitae:13,per_turn:4,surge:2,mend:2,feed:'human'},
  5:{vitae:15,per_turn:5,surge:3,mend:2,feed:'kindred'},
  6:{vitae:20,per_turn:6,surge:3,mend:3,feed:'kindred'},
  7:{vitae:25,per_turn:7,surge:4,mend:3,feed:'kindred'},
  8:{vitae:30,per_turn:8,surge:5,mend:4,feed:'kindred'},
  9:{vitae:50,per_turn:10,surge:6,mend:5,feed:'kindred'},
  10:{vitae:75,per_turn:15,surge:7,mend:6,feed:'kindred'}
};
function calcVitaeMax(c) {
  return (BP_TABLE[c.blood_potency || 0] || BP_TABLE[1]).vitae;
}
```

## Integration Phases

### Phase 1: Editor on v2 (current)
- Editor reads/writes v2 natively
- CHARS_DATA baked in as v2 format
- Suite runs independently on old format
- "Sync to Suite" converts v2 → old format for tm_import_chars

### Phase 2: Suite reads v2
- Replace Suite's 6 accessor functions with v2 versions above
- Fix 8 direct attribute accesses in getPool/getResistTokenVal to use attrDots()
- Fix 6 direct skill accesses to use skDots()
- Replace 9 influence accesses to use influenceMerits()
- Replace 3 domain accesses to use domainMerits()
- Replace 3 standing accesses to use standingMerits()
- Replace 4 covenant_standings references for new object format
- Replace 6 willpower key references (mask_all_wp → mask_all)
- Replace 2 xp_left references with xpLeft()
- Replace 3 size/speed/defence with calc functions
- Suite's loadChars() reads v2 from tm_chars_db
- Total: ~44 line changes in Suite JS, plus replacing CHARS_DATA with v2 format

### Phase 3: Merge into single file
- Editor becomes a tab in the Suite
- CHARS_DATA is v2 format
- One shared accessor module
- One localStorage key (tm_chars_db)
- CSV export function maps v2 → 365-column schema
- Old tm_import_chars key deprecated

## Sync Bridge (Phase 1 only)

During Phase 1, "Sync to Suite" needs a v2 → old converter:

```js
function v2ToOld(c) {
  const old = { ...c };

  // Attributes: {dots,bonus} → int or {dots,bonus_dots}
  old.attributes = {};
  Object.entries(c.attributes).forEach(([a, v]) => {
    old.attributes[a] = v.bonus > 0 ? { dots: v.dots, bonus_dots: v.bonus } : v.dots;
  });

  // Skills: {dots,bonus,specs,nine_again} → int or {dots,spec,bonus_dots,nine_again}
  old.skills = {};
  Object.entries(c.skills || {}).forEach(([s, v]) => {
    if (v.dots === 0 && v.bonus === 0 && v.specs.length === 0 && !v.nine_again) return;
    if (!v.nine_again && v.bonus === 0 && v.specs.length === 0) {
      old.skills[s] = v.dots;
    } else {
      const o = { dots: v.dots };
      if (v.bonus) o.bonus_dots = v.bonus;
      if (v.specs.length) o.spec = v.specs.join(', ');
      if (v.nine_again) o.nine_again = true;
      old.skills[s] = o;
    }
  });

  // Merits: split back out
  old.merits = [];
  old.influence = [];
  old.domain = {};
  old.standing = {};

  (c.merits || []).forEach(m => {
    switch (m.category) {
      case 'influence':
        old.influence.push({ type: m.name, area: m.area || '', dots: m.rating });
        break;
      case 'domain': {
        const keyMap = { 'Safe Place':'safe_place', 'Haven':'haven', 'Feeding Grounds':'feeding_grounds', 'Herd':'herd' };
        old.domain[keyMap[m.name] || m.name] = m.rating;
        break;
      }
      case 'standing':
        if (m.name === 'Mystery Cult Initiation') {
          old.standing.mystery_cult = { dots: m.rating, name: m.cult_name || '' };
        } else if (m.name === 'Professional Training') {
          old.standing.prof_training = { dots: m.rating, role: m.role || '' };
        }
        break;
      case 'manoeuvre':
        old.merits.push(m.name + ' ' + '●'.repeat(m.rating) + ' | ' + m.rank_name);
        break;
      case 'general': {
        const qual = m.qualifier ? ` (${m.qualifier})` : '';
        old.merits.push(m.name + qual + (m.rating ? ' ' + '●'.repeat(m.rating) : ''));
        break;
      }
    }
  });

  // Influence total
  old.influence_total = old.influence.reduce((s, x) => s + (x.dots || 0), 0);

  // Powers: recombine
  old.powers = (c.powers || []).map(p => {
    switch (p.category) {
      case 'rite':
        return {
          name: p.tradition + ' ' + '●'.repeat(p.level) + ' | ' + p.name,
          stats: p.stats, pool_size: p.pool_size, effect: p.effect
        };
      case 'pact':
        return {
          name: p.name + (p.rank ? ' ' + '●'.repeat(p.rank) : ''),
          stats: p.stats, effect: p.effect
        };
      case 'devotion':
        return {
          name: 'Devotion  | ' + p.name,
          stats: p.stats, pool_size: p.pool_size, effect: p.effect
        };
      case 'discipline':
        return {
          name: p.discipline + ' ' + '●'.repeat(p.rank) + (p.name !== p.discipline + ' ' + p.rank ? ' | ' + p.name : ''),
          stats: p.stats, pool_size: p.pool_size, effect: p.effect
        };
      default: return p;
    }
  });

  // Covenant standings: object → array
  const covLabels = ['Carthian','Crone','Invictus','Lance'];
  const covShortMap = { 'Carthian Movement':'Carthian', 'Circle of the Crone':'Crone', 'Invictus':'Invictus', 'Lancea et Sanctum':'Lance' };
  const primaryLabel = covShortMap[c.covenant] || c.covenant;
  old.covenant_standings = covLabels.map(label => ({
    label,
    status: label === primaryLabel ? (c.status?.covenant || 0) : (c.covenant_standings?.[label] || 0)
  }));
  // Move primary to front
  const pidx = old.covenant_standings.findIndex(cs => cs.label === primaryLabel);
  if (pidx > 0) {
    const [primary] = old.covenant_standings.splice(pidx, 1);
    old.covenant_standings.unshift(primary);
  }

  // Willpower keys
  old.willpower = {
    mask_1wp: c.willpower?.mask_1wp || null,
    mask_all_wp: c.willpower?.mask_all || null,
    dirge_1wp: c.willpower?.dirge_1wp || null,
    dirge_all_wp: c.willpower?.dirge_all || null
  };

  // XP left
  old.xp_left = (c.xp_total || 0) - (c.xp_spent || 0);

  // Derived stats
  old.size = calcSize(c);
  old.speed = calcSpeed(c);
  old.defence = calcDefence(c);

  return old;
}
```

## What Stays the Same

- localStorage tracker keys (tm_tracker_<name>) are unchanged
- Discipline DB (DISC), MERITS_DB, MAN_DB are reference data, not character data
- Roll tab mechanics are unchanged; only the data access path changes
- Territory tab is independent
- Design tokens, CSS, fonts are identical
