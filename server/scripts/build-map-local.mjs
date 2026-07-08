// LOCAL build: same as build-map.js but reads scripts/_locations-local.json (NOT Mongo) -> tm-map.html.
// Use this for all local-only boundary work. Never writes to Mongo.
import { readFileSync, writeFileSync } from 'node:fs';

const all = JSON.parse(readFileSync('scripts/_locations-local.json','utf8'));
const locs = all.filter(l => l.polygon && l.polygon.length);
const havenDocs = all.filter(l => l.type==='haven' && l.geocoded);

// --- Build-time geometry optimisation (RENDERED artefact only; _locations-local.json is never modified) ---
// Source rings carry up to 14 dp (~nanometre) and ~655 vertices avg; neither is visible at city zoom.
// We round to 6 dp (~0.1 m) and Douglas-Peucker simplify the rendered copy. Endpoints are ALWAYS kept,
// so closed rings stay closed and locked landmark extremities survive. Tolerance is tunable below.
const COORD_DP = 6;
const SIMPLIFY_TOL = 0.00003;        // ~3 m in Sydney; raise to thin more, lower to keep more detail
let vBefore = 0, vAfter = 0;
const _f = 10 ** COORD_DP;
const round6 = n => Math.round(n * _f) / _f;
function _perpDist(p, a, b){
  const dx = b[0]-a[0], dy = b[1]-a[1];
  if(dx===0 && dy===0) return Math.hypot(p[0]-a[0], p[1]-a[1]);
  const t = ((p[0]-a[0])*dx + (p[1]-a[1])*dy) / (dx*dx + dy*dy);
  return Math.hypot(p[0]-(a[0]+t*dx), p[1]-(a[1]+t*dy));
}
function _dp(pts, tol){
  if(pts.length < 3) return pts;
  const a = pts[0], b = pts[pts.length-1];
  let maxD = 0, idx = 0;
  for(let i=1;i<pts.length-1;i++){ const d=_perpDist(pts[i],a,b); if(d>maxD){maxD=d;idx=i;} }
  if(maxD > tol){
    const left = _dp(pts.slice(0, idx+1), tol);
    const right = _dp(pts.slice(idx), tol);
    return left.slice(0,-1).concat(right);
  }
  return [a, b];
}
// Simplify then round; tally vertices so the build log reports the saving.
const optimiseGeom = pts => {
  const out = _dp(pts, SIMPLIFY_TOL).map(([a,b]) => [round6(a), round6(b)]);
  vBefore += pts.length; vAfter += out.length;
  return out;
};

const havens = havenDocs.map(h => ({
  name: h.name || '(haven)', residents: h.residents || [], address: h.address || '', lat: h.lat, lon: h.lon }));

const elysiums = all.filter(l => l.type==='elysium' && l.lat!=null).map(e => ({
  name: e.name || 'Elysium', address: e.address || '', note: e.note || '', lat: e.lat, lon: e.lon }));

const npcSites = all.filter(l => l.type==='npc_site' && l.lat!=null).map(e => ({
  name: e.name, npc: e.npc||'', tied: e.tied_to||'', desc: e.desc||'', suggest: e.suggested_address||'',
  confirmed: !!e.confirmed, source: e.source||'', category: e.category||'home', lat: e.lat, lon: e.lon }));

const loci = all.filter(l => l.type==='locus' && l.lat!=null).map(e => ({
  name: e.name, anchor: e.anchor||'', territory: e.territory||'', locus_type: e.locus_type||'locus',
  rating: e.rating||1, resonance: e.resonance||'', desc: e.desc||'', tier: e.tier||'', faction: e.faction||'',
  lat: e.lat, lon: e.lon }));

const leylines = all.filter(l => l.type==='leyline' && l.path).map(e => ({
  name: e.name, resonance: e.resonance||'', note: e.note||'', color: e.color||'#8b5cff', tier: e.tier||'major',
  path: optimiseGeom(e.path.map(([lon, lat]) => [lat, lon])) }));

const wyrmnests = all.filter(l => l.type==='wyrmnest' && l.lat!=null).map(e => ({
  name: e.name, nest_type: e.nest_type||"Wyrm's Nest", rating: e.rating||1, anchor: e.anchor||'',
  resonance: e.resonance||'', desc: e.desc||'', lat: e.lat, lon: e.lon }));

const cenotes = all.filter(l => l.type==='cenote' && l.lat!=null).map(e => ({
  name: e.name, site_type: e.site_type||'Cenote', tier: e.tier||'minor', rating: e.rating||1,
  anchor: e.anchor||'', resonance: e.resonance||'', desc: e.desc||'', lat: e.lat, lon: e.lon }));

const courts = all.filter(l => l.type==='court' && l.lat!=null).map(e => ({
  name: e.name, court: e.court||'', crown: e.crown||'', emotion: e.emotion||'', anchor: e.anchor||'',
  resonance: e.resonance||'', desc: e.desc||'', color: e.color||'#7cb342', lat: e.lat, lon: e.lon }));

const feats = locs.map(l => ({
  name: l.name, faction: l.faction, type: l.type, real_place: l.real_place || null,
  color: l.color || '#888', alpha: l.fill_alpha ?? 0.3, stroke: l.stroke || l.color || '#888',
  ring: optimiseGeom(l.polygon.map(([lon, lat]) => [lat, lon])),
}));

// Population key (top-right). Figures from the recorded supernatural-demographics model
// (Greater Sydney ~5.3M; entrenched splats at the dense end; Kindred sparse, just returned).
// [faction, label, count, note] — edit freely.
const POP = [
  ['vampire',    'Kindred',        '~177', '1:30k, dense draw-city ceiling (5.3M)'],
  ['werewolf',   'Uratha',         '~60',  '1:100k; ~12 packs (8 Forsaken / 4 Pure)'],
  ['mage',       'Awakened',       '~100', '1:50k; one mature Consilium'],
  ['changeling', 'the Lost',       '~45',  '1:150k; one freehold, 4 Courts'],
  ['geist',      'the Bound',      '~20',  'rarest splat; krewes on Rookwood Necropolis'],
  ['ghost',      'Restless Dead',  '—',    'site-driven, not population-based'],
];

// ST map: every layer defaults ON (third field).
const FACTIONS = [
  ['vampire',    'Vampire Territories', true],
  ['hq',         'Old Covenant Seats',  true],
  ['werewolf',   'Werewolf Territories',    true],
  ['mage',       'Mage Territories',        true],
  ['changeling', 'Changeling Territories',  true],
  ['geist',      'Sin-Eater Territories',   true],
  ['ghost',      'Ghost Territories',       true],
  ['exclusion',  'Exclusion Zone',          true],
];

const html = `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Terra Mortis - Domains of Sydney</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600&family=Lora:ital@0;1&display=swap');
:root{ --parchment:#e9dcc0; --panel:#f4ecd9; --ink:#2a2018; --muted:#6b5b43; --gold2:#9a7b3f; --line:#cbb88f; }
html,body{margin:0;height:100%;background:var(--parchment);color:var(--ink);font-family:'Lora',Georgia,serif;}
#map{position:absolute;inset:0;background:var(--parchment);}
.leaflet-tile-pane{filter:sepia(.38) saturate(.65) brightness(.97) contrast(.92);}
.leaflet-popup-content-wrapper,.leaflet-popup-tip{background:var(--panel);color:var(--ink);box-shadow:0 2px 14px rgba(40,30,16,.35);border:1px solid var(--line);}
.leaflet-popup-content{margin:.7rem .9rem;font-family:'Lora',serif;}
.pop-name{font-family:'Cinzel',serif;font-weight:600;font-size:1.05rem;letter-spacing:.02em;}
.pop-faction{display:inline-block;margin-top:.25rem;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:#fff;padding:.08rem .45rem;border-radius:2px;}
.pop-place{margin-top:.4rem;color:var(--muted);font-style:italic;font-size:.85rem;}
.pop-res{margin-top:.4rem;font-size:.85rem;color:var(--ink);}
.pop-res b{font-variant:small-caps;letter-spacing:.04em;color:var(--muted);font-weight:600;}
.pop-addr{margin-top:.35rem;color:var(--muted);font-style:italic;font-size:.8rem;}
.leaflet-bar a{background:var(--panel);color:var(--ink);border-bottom-color:var(--line);}
.leaflet-bar a:hover{background:var(--gold2);color:var(--panel);}
.leaflet-control-attribution{background:rgba(244,236,217,.8)!important;color:var(--muted)!important;font-family:'Lora',serif;}
.legend{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:.6rem .8rem;box-shadow:0 2px 12px rgba(40,30,16,.3);font-family:'Lora',serif;max-width:230px;}
.legend h4{font-family:'Cinzel',serif;font-weight:600;margin:0 0 .5rem;color:var(--ink);font-size:.95rem;letter-spacing:.04em;border-bottom:1px solid var(--line);padding-bottom:.35rem;}
.legend label{display:flex;align-items:center;gap:.5rem;font-size:.82rem;margin:.28rem 0;cursor:pointer;color:var(--ink);}
.legend .dot{width:.85rem;height:.85rem;border-radius:2px;flex:0 0 auto;border:1px solid rgba(0,0,0,.3);}
.legend input{accent-color:var(--gold2);}
.legend .leg-sec{font-family:'Cinzel',serif;font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:.5rem 0 .25rem;border-top:1px solid var(--line);padding-top:.4rem;}
.legend .leg-sel{width:100%;margin-top:.1rem;font-family:'Lora',serif;font-size:.82rem;padding:.22rem;background:var(--parchment);color:var(--ink);border:1px solid var(--line);border-radius:3px;}
.legend .key-q{color:var(--muted);font-size:.7rem;font-style:italic;}
.popkey{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:.6rem .8rem;box-shadow:0 2px 12px rgba(40,30,16,.3);font-family:'Lora',serif;max-width:248px;}
.popkey h4{font-family:'Cinzel',serif;font-weight:600;margin:0 0 .5rem;color:var(--ink);font-size:.95rem;letter-spacing:.04em;border-bottom:1px solid var(--line);padding-bottom:.35rem;}
.popkey .row{display:flex;align-items:baseline;gap:.5rem;margin:.32rem 0;font-size:.82rem;color:var(--ink);}
.popkey .row .dot{width:.85rem;height:.85rem;border-radius:2px;flex:0 0 auto;border:1px solid rgba(0,0,0,.3);align-self:center;}
.popkey .row .nm{flex:1 1 auto;}
.popkey .row .nm small{display:block;color:var(--muted);font-size:.7rem;font-style:italic;line-height:1.2;}
.popkey .row .ct{flex:0 0 auto;font-weight:600;font-variant-numeric:tabular-nums;color:var(--gold2);align-self:center;}
.popkey .foot{margin-top:.5rem;padding-top:.35rem;border-top:1px solid var(--line);color:var(--muted);font-size:.68rem;font-style:italic;}
.title-card{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:.5rem .8rem;box-shadow:0 2px 12px rgba(40,30,16,.3);}
.title-card .t{font-family:'Cinzel',serif;font-weight:600;font-size:1rem;color:var(--ink);}
.title-card .s{font-size:.72rem;color:var(--muted);letter-spacing:.04em;}
.terr-label{background:transparent;border:none;box-shadow:none;padding:0;color:var(--ink);font-family:'Cinzel',serif;font-weight:600;font-size:.8rem;letter-spacing:.05em;text-shadow:0 0 3px var(--parchment),0 0 3px var(--parchment),0 0 2px var(--parchment),0 0 2px var(--parchment);white-space:nowrap;pointer-events:none;}
.terr-label::before{display:none;}
.ely-mark{background:none;border:none;}
.ely-diamond{display:block;width:11px;height:11px;background:var(--gold2);border:1.5px solid #a52714;transform:rotate(45deg);box-shadow:0 1px 4px rgba(40,30,16,.5);}
.ley-label{background:transparent;border:none;box-shadow:none;color:#5b3aa6;font-family:'Cinzel',serif;font-style:italic;font-weight:600;font-size:.72rem;letter-spacing:.04em;text-shadow:0 0 3px var(--parchment),0 0 3px var(--parchment),0 0 2px var(--parchment);white-space:nowrap;}
.ley-label::before{display:none;}
.court-mark{background:none;border:none;display:flex;align-items:center;justify-content:center;}
.court-crown{font-size:16px;line-height:1;text-shadow:0 0 2px #fff,0 0 3px #fff,0 1px 2px rgba(0,0,0,.4);}
.geist-mark{background:none;border:none;display:flex;align-items:center;justify-content:center;}
.geist-glyph{color:#00838f;line-height:1;text-shadow:0 0 2px #00343a,0 0 3px #00343a,0 1px 3px rgba(0,0,0,.5);}
.wyrm-mark{background:none;border:none;display:flex;align-items:center;justify-content:center;}
.wyrm-glyph{color:#8e1230;font-size:17px;line-height:1;text-shadow:0 0 2px #2a0008,0 0 3px #2a0008,0 1px 3px rgba(0,0,0,.5);}
.locus-mark{background:none;border:none;display:flex;align-items:center;justify-content:center;}
.locus-star{color:#f9a825;font-size:18px;line-height:1;text-shadow:0 0 2px #5d3a00,0 0 3px #5d3a00,0 1px 3px rgba(0,0,0,.5);}
.npc-mark{background:none;border:none;}
.npc-sq{display:flex;align-items:center;justify-content:center;width:13px;height:13px;background:#6d4c7d;border:1.5px solid #3e2c47;box-shadow:0 1px 4px rgba(40,30,16,.5);}
.npc-sq.work{background:#5e6a72;border-color:#39424a;}
.npc-sq .q{color:#fff;font:700 10px/1 'Lora',serif;text-shadow:0 0 1px #3e2c47;}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const DATA = ${JSON.stringify(feats)};
const HAVENS = ${JSON.stringify(havens)};
const ELYSIUMS = ${JSON.stringify(elysiums)};
const NPCSITES = ${JSON.stringify(npcSites)};
const LOCI = ${JSON.stringify(loci)};
const LEYLINES = ${JSON.stringify(leylines)};
const WYRMNESTS = ${JSON.stringify(wyrmnests)};
const CENOTES = ${JSON.stringify(cenotes)};
const COURTS = ${JSON.stringify(courts)};
const FACTIONS = ${JSON.stringify(FACTIONS)};
const POP = ${JSON.stringify(POP)};
const LABEL = Object.fromEntries(FACTIONS.map(f=>[f[0],f[1]]));

const map = L.map('map',{zoomControl:true}).setView([-33.87,151.10],11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  maxZoom:18, attribution:'&copy; OpenStreetMap'}).addTo(map);

const groups = {};
FACTIONS.forEach(([f])=>groups[f]=L.layerGroup());

DATA.forEach(ft=>{
  const poly = L.polygon(ft.ring,{
    color:ft.stroke, weight:2, opacity:.9, fillColor:ft.color, fillOpacity:ft.alpha});
  poly.on('mouseover',()=>poly.setStyle({fillOpacity:Math.min(.7,ft.alpha+0.25)}));
  poly.on('mouseout',()=>poly.setStyle({fillOpacity:ft.alpha}));
  const place = ft.real_place ? '<div class="pop-place">'+ft.real_place+'</div>' : '';
  poly.bindPopup('<div class="pop-name">'+ft.name+'</div>'+
    '<span class="pop-faction" style="background:'+ft.color+'">'+(LABEL[ft.faction]||ft.faction)+'</span>'+place);
  poly.bindTooltip(ft.name,{permanent:true,direction:'center',className:'terr-label',interactive:false});
  (groups[ft.faction]||groups.vampire).addLayer(poly);
});

FACTIONS.forEach(([f,, on])=>{ if(on) groups[f].addTo(map); });

const havenLayer = L.layerGroup();
const havenRecs = [];
const fmtList = a => a.length<=1 ? (a[0]||'') : a.length===2 ? a.join(' & ') : a.slice(0,-1).join(', ')+', & '+a[a.length-1];
HAVENS.forEach(h=>{
  const m = L.circleMarker([h.lat,h.lon],{radius:5,fillColor:'#9a7b3f',color:'#2a2018',weight:1.5,fillOpacity:.95});
  let body='';
  if(h.residents.length>1) body+='<span class="pop-faction" style="background:#6b5b43">Shared Haven</span>';
  body+='<div class="pop-name">'+h.name+'</div>';
  if(h.residents.length) body+='<div class="pop-res"><b>Residents:</b> '+fmtList(h.residents)+'</div>';
  if(h.address) body+='<div class="pop-addr">'+h.address+'</div>';
  m.bindPopup(body);
  havenLayer.addLayer(m);
  havenRecs.push({marker:m, players:h.residents||[]});
});
havenLayer.addTo(map); // ST map: havens default ON

const elyIcon = L.divIcon({className:'ely-mark', html:'<span class="ely-diamond"></span>', iconSize:[16,16], iconAnchor:[8,8]});
const elysiumLayer = L.layerGroup();
ELYSIUMS.forEach(e=>{
  const m = L.marker([e.lat,e.lon],{icon:elyIcon});
  let body='<span class="pop-faction" style="background:#a52714">Elysium</span><div class="pop-name">'+e.name+'</div>';
  if(e.note) body+='<div class="pop-place">'+e.note+'</div>';
  if(e.address) body+='<div class="pop-addr">'+e.address+'</div>';
  m.bindPopup(body);
  elysiumLayer.addLayer(m);
});
elysiumLayer.addTo(map); // ST map: elysiums default ON

const npcHomeLayer = L.layerGroup();
const npcWorkLayer = L.layerGroup();
const npcRecs = [];
NPCSITES.forEach(e=>{
  const work = e.category==='workplace';
  const icon=L.divIcon({className:'npc-mark', html:'<span class="npc-sq'+(work?' work':'')+'">'+(e.confirmed?'':'<span class="q">?</span>')+'</span>', iconSize:[16,16], iconAnchor:[8,8]});
  const m=L.marker([e.lat,e.lon],{icon});
  let body='<span class="pop-faction" style="background:'+(work?'#5e6a72':'#6d4c7d')+'">NPC '+(work?'workplace':'home')+(e.confirmed?'':' &middot; unconfirmed')+'</span>';
  body+='<div class="pop-name">'+e.name+'</div>';
  if(e.tied) body+='<div class="pop-place">tied to '+e.tied+'</div>';
  if(e.desc) body+='<div class="pop-res">'+e.desc+'</div>';
  if(e.suggest) body+='<div class="pop-addr">'+(e.confirmed?'':'Suggested: ')+e.suggest+'</div>';
  if(e.source) body+='<div class="pop-addr">Source: '+e.source+'</div>';
  m.bindPopup(body);
  const layer = work ? npcWorkLayer : npcHomeLayer;
  layer.addLayer(m);
  npcRecs.push({marker:m, player:e.tied||'', layer});
});
npcHomeLayer.addTo(map); npcWorkLayer.addTo(map); // ST map: NPC sites default ON

// Ley lines (Mage grid): sinuous terrain-following currents that cross at the Hallows.
// Drawn as a faint wide halo + a brighter dotted core, beneath the locus stars.
const leyLayer = L.layerGroup();
LEYLINES.forEach(e=>{
  const minor = e.tier==='minor';
  const haloW = minor?6:11, haloO = minor?0.10:0.14, coreW = minor?1.5:2.5, coreO = minor?0.6:0.9, dash = minor?'1 9':'2 8';
  L.polyline(e.path,{color:e.color,weight:haloW,opacity:haloO,lineCap:'round',interactive:false}).addTo(leyLayer);
  const core=L.polyline(e.path,{color:e.color,weight:coreW,opacity:coreO,lineCap:'round',dashArray:dash});
  let body='<span class="pop-faction" style="background:#7c4dff">Ley Line'+(minor?' &middot; minor':'')+'</span><div class="pop-name">'+e.name+'</div>';
  if(e.resonance) body+='<div class="pop-res"><b>Resonance:</b> '+e.resonance+'</div>';
  if(e.note) body+='<div class="pop-place">'+e.note+'</div>';
  core.bindPopup(body); core.bindTooltip(e.name,{className:'ley-label',direction:'center'});
  core.addTo(leyLayer);
});
leyLayer.addTo(map); // ST map: ley lines default ON

const lociLayer = L.layerGroup();
LOCI.forEach(e=>{
  const minor = e.tier==='minor';
  const star = minor?12:18, isz = minor?13:20;
  const icon=L.divIcon({className:'locus-mark', html:'<span class="locus-star" style="font-size:'+star+'px">&#9733;</span>', iconSize:[isz,isz], iconAnchor:[isz/2,isz/2]});
  const m=L.marker([e.lat,e.lon],{icon});
  const kind = e.faction==='mage' ? 'Hallow' : 'Locus';
  const tierTag = e.tier==='major' ? ' &middot; Major' : e.tier==='minor' ? (e.faction==='werewolf' ? ' &middot; Minor (unheld)' : ' &middot; Minor (cabal)') : '';
  let body='<span class="pop-faction" style="background:#f9a825;color:#2a2018">'+kind+' &middot; '+e.locus_type+tierTag+'</span>';
  body+='<div class="pop-name">'+e.name+'</div>';
  body+='<div class="pop-res"><b>Rating:</b> '+'●'.repeat(e.rating)+'○'.repeat(5-e.rating)+'</div>';
  if(e.resonance) body+='<div class="pop-res"><b>Resonance:</b> '+e.resonance+'</div>';
  if(e.territory) body+='<div class="pop-place">'+e.territory+'</div>';
  if(e.anchor) body+='<div class="pop-addr">Anchor: '+e.anchor+'</div>';
  if(e.desc) body+='<div class="pop-res">'+e.desc+'</div>';
  m.bindPopup(body);
  lociLayer.addLayer(m);
});
lociLayer.addTo(map); // ST map: loci default ON

// Wyrm's Nests (Ordo Dracul secret society's reading of the city's places of power)
const wyrmLayer = L.layerGroup();
WYRMNESTS.forEach(e=>{
  const icon=L.divIcon({className:'wyrm-mark', html:'<span class="wyrm-glyph">&#9738;</span>', iconSize:[18,18], iconAnchor:[9,9]});
  const m=L.marker([e.lat,e.lon],{icon});
  let body='<span class="pop-faction" style="background:#8e1230">Wyrm&#39;s Nest &middot; '+e.nest_type+'</span>';
  body+='<div class="pop-name">'+e.name+'</div>';
  body+='<div class="pop-res"><b>Rating:</b> '+'●'.repeat(e.rating)+'○'.repeat(5-e.rating)+'</div>';
  if(e.resonance) body+='<div class="pop-res"><b>Resonance:</b> '+e.resonance+'</div>';
  if(e.anchor) body+='<div class="pop-addr">'+e.anchor+'</div>';
  if(e.desc) body+='<div class="pop-res">'+e.desc+'</div>';
  m.bindPopup(body);
  wyrmLayer.addLayer(m);
});
wyrmLayer.addTo(map); // ST map

// Sin-Eater sites: Avernian Gates (filled down-triangle) + Cenotes (open) - the Geist Underworld layer
const geistLayer = L.layerGroup();
CENOTES.forEach(e=>{
  const gate = e.site_type==='Avernian Gate';
  const glyph = gate?'&#9660;':'&#9661;', sz = gate?18:13, fs = gate?16:12;
  const icon=L.divIcon({className:'geist-mark', html:'<span class="geist-glyph" style="font-size:'+fs+'px">'+glyph+'</span>', iconSize:[sz,sz], iconAnchor:[sz/2,sz/2]});
  const m=L.marker([e.lat,e.lon],{icon});
  let body='<span class="pop-faction" style="background:#00838f">'+e.site_type+'</span>';
  body+='<div class="pop-name">'+e.name+'</div>';
  body+='<div class="pop-res"><b>Rating:</b> '+'●'.repeat(e.rating)+'○'.repeat(5-e.rating)+'</div>';
  if(e.resonance) body+='<div class="pop-res"><b>Resonance:</b> '+e.resonance+'</div>';
  if(e.anchor) body+='<div class="pop-addr">'+e.anchor+'</div>';
  if(e.desc) body+='<div class="pop-res">'+e.desc+'</div>';
  m.bindPopup(body);
  geistLayer.addLayer(m);
});
geistLayer.addTo(map); // ST map

// Changeling seasonal Courts (crown glyph coloured by season)
const courtLayer = L.layerGroup();
COURTS.forEach(e=>{
  const icon=L.divIcon({className:'court-mark', html:'<span class="court-crown" style="color:'+e.color+'">&#9819;</span>', iconSize:[18,18], iconAnchor:[9,9]});
  const m=L.marker([e.lat,e.lon],{icon});
  let body='<span class="pop-faction" style="background:'+e.color+'">'+e.court+' Court &middot; '+e.crown+'</span>';
  body+='<div class="pop-name">'+e.name+'</div>';
  if(e.emotion) body+='<div class="pop-res"><b>Emotion:</b> '+e.emotion+'</div>';
  if(e.resonance) body+='<div class="pop-res"><b>Resonance:</b> '+e.resonance+'</div>';
  if(e.anchor) body+='<div class="pop-addr">'+e.anchor+'</div>';
  if(e.desc) body+='<div class="pop-res">'+e.desc+'</div>';
  m.bindPopup(body);
  courtLayer.addLayer(m);
});
courtLayer.addTo(map); // ST map

// Player filter (scopes havens + NPC homes/workplaces to one character)
const PLAYERS = [...new Set([].concat(...HAVENS.map(h=>h.residents||[]), NPCSITES.map(n=>n.tied).filter(Boolean)))].sort();
let selPlayer = '*';
function applyPlayerFilter(){
  havenRecs.forEach(r=>{ const show = selPlayer==='*' || (r.players||[]).includes(selPlayer); show?havenLayer.addLayer(r.marker):havenLayer.removeLayer(r.marker); });
  npcRecs.forEach(r=>{ const show = selPlayer==='*' || r.player===selPlayer; show?r.layer.addLayer(r.marker):r.layer.removeLayer(r.marker); });
}

const title = L.control({position:'topleft'});
title.onAdd=function(){ const d=L.DomUtil.create('div','title-card');
  d.innerHTML='<div class="t">Terra Mortis</div><div class="s">Domains of Sydney</div>'; return d; };
title.addTo(map);

const FCOL = {vampire:'#a52714',werewolf:'#f9a825',mage:'#0288d1',changeling:'#7cb342',geist:'#00838f',ghost:'#000000'};
const popkey = L.control({position:'topright'});
popkey.onAdd=function(){
  const d=L.DomUtil.create('div','popkey'); L.DomEvent.disableClickPropagation(d);
  let h='<h4>Supernatural Census</h4>';
  POP.forEach(([f,nm,ct,note])=>{
    const col = DATA.find(x=>x.faction===f)?.color || FCOL[f] || '#888';
    h+='<div class="row"><span class="dot" style="background:'+col+'"></span>'+
       '<span class="nm">'+nm+'<small>'+note+'</small></span>'+
       '<span class="ct">'+ct+'</span></div>';
  });
  h+='<div class="foot">Est. across Greater Sydney (~5.3M). Kindred newly returned; others entrenched.</div>';
  d.innerHTML=h; return d;
};
popkey.addTo(map);

// Bottom-right: territory factions only
const legend = L.control({position:'bottomright'});
legend.onAdd=function(){
  const d=L.DomUtil.create('div','legend'); L.DomEvent.disableClickPropagation(d);
  let h='<h4>Territories</h4>';
  FACTIONS.filter(([f])=>f!=='hq').forEach(([f,label,on])=>{
    const col = DATA.find(x=>x.faction===f)?.color || '#888';
    h+='<label><input type="checkbox" data-f="'+f+'" '+(on?'checked':'')+'/>'+
       '<span class="dot" style="background:'+col+'"></span>'+label+'</label>';
  });
  d.innerHTML=h;
  d.querySelectorAll('input').forEach(cb=>cb.addEventListener('change',e=>{
    const g = groups[e.target.dataset.f];
    if(e.target.checked) g.addTo(map); else map.removeLayer(g);
  }));
  return d;
};
legend.addTo(map);

// Bottom-left: places of interest + player filter
const poikey = L.control({position:'bottomleft'});
poikey.onAdd=function(){
  const d=L.DomUtil.create('div','legend poikey'); L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
  let h='<h4>Places of Interest</h4>';
  h+='<label><input type="checkbox" data-f="__havens" checked/><span class="dot" style="background:#9a7b3f;border-radius:50%"></span>Havens</label>';
  h+='<label><input type="checkbox" data-f="__elysiums" checked/><span class="dot" style="background:#9a7b3f;border:1.5px solid #a52714;transform:rotate(45deg)"></span>Elysiums</label>';
  h+='<label><input type="checkbox" data-f="__npchomes" checked/><span class="dot" style="background:#6d4c7d"></span>NPC Homes</label>';
  h+='<label><input type="checkbox" data-f="__npcwork" checked/><span class="dot" style="background:#5e6a72"></span>NPC Workplaces <span class="key-q">&#9633;? = unconfirmed</span></label>';
  h+='<label><input type="checkbox" data-f="__loci" checked/><span class="dot" style="background:none;color:#f9a825;border:none;width:auto;height:auto;line-height:.85rem;font-size:.95rem">&#9733;</span>Sites of Power</label>';
  h+='<label><input type="checkbox" data-f="__ley" checked/><span class="dot" style="background:#8b5cff;border-radius:2px"></span>Ley Lines</label>';
  h+='<label><input type="checkbox" data-f="__wyrm" checked/><span class="dot" style="background:none;color:#8e1230;border:none;width:auto;height:auto;line-height:.85rem;font-size:1rem">&#9738;</span>Wyrm&#39;s Nests</label>';
  h+='<label><input type="checkbox" data-f="__geist" checked/><span class="dot" style="background:none;color:#00838f;border:none;width:auto;height:auto;line-height:.85rem;font-size:.95rem">&#9661;</span>Cenotes &amp; Gates</label>';
  h+='<label><input type="checkbox" data-f="__court" checked/><span class="dot" style="background:none;color:#7cb342;border:none;width:auto;height:auto;line-height:.85rem;font-size:1rem">&#9819;</span>Seasonal Courts</label>';
  h+='<label><input type="checkbox" data-f="__hq" checked/><span class="dot" style="background:#880e4f"></span>Old Covenant Seats</label>';
  h+='<div class="leg-sec">Filter by player</div>';
  h+='<select class="leg-sel"><option value="*">All players</option>'+PLAYERS.map(p=>'<option value="'+p+'">'+p+'</option>').join('')+'</select>';
  d.innerHTML=h;
  d.querySelectorAll('input[type=checkbox]').forEach(cb=>cb.addEventListener('change',e=>{
    const f=e.target.dataset.f;
    const g = f==='__havens' ? havenLayer : f==='__elysiums' ? elysiumLayer : f==='__npchomes' ? npcHomeLayer
            : f==='__npcwork' ? npcWorkLayer : f==='__loci' ? lociLayer : f==='__ley' ? leyLayer : f==='__wyrm' ? wyrmLayer : f==='__geist' ? geistLayer : f==='__court' ? courtLayer : groups.hq;
    if(e.target.checked) g.addTo(map); else map.removeLayer(g);
  }));
  d.querySelector('.leg-sel').addEventListener('change',e=>{ selPlayer=e.target.value; applyPlayerFilter(); });
  return d;
};
poikey.addTo(map);
</script>
</body>
</html>`;

writeFileSync('../tm-map.html', html);
const vPct = vBefore ? Math.round((1 - vAfter/vBefore)*100) : 0;
console.log(`tm-map.html (LOCAL build) written: ${feats.length} polygon features; ${havens.length} haven pins. Source: scripts/_locations-local.json (no Mongo).`);
console.log(`Geometry: ${vBefore} -> ${vAfter} vertices (${vPct}% fewer), ${SIMPLIFY_TOL}deg tol / ${COORD_DP}dp, output-only (source untouched).`);
