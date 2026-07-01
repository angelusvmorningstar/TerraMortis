// Generate a self-contained standalone Leaflet map of the chronicle geography.
// Reads the `locations` collection, writes tm-map.html with all data INLINED
// (no fetch, so it opens by double-click under file:// with no CORS block).
// Re-run after any geography change.  NOTE: keep the output local - it is a
// read-only artefact and the havens layer (when geocoded) carries player PII.
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { writeFileSync } from 'node:fs';

const c = new MongoClient(process.env.MONGODB_URI); await c.connect();
const db = c.db('tm_suite');
const locs = await db.collection('locations').find({ polygon: { $exists: true, $ne: null } }).toArray();
const havenDocs = await db.collection('locations').find({ type:'haven', geocoded:true }).toArray();
await c.close();

// one pin per haven (already merged via Safe Place merit shared_with at build time)
const havens = havenDocs.map(h => ({
  name: h.name || '(haven)', residents: h.residents || [], address: h.address || '', lat: h.lat, lon: h.lon }));

// Leaflet wants [lat,lon]; our polygons are stored [lon,lat] (KML order).
const feats = locs.filter(l => l.polygon?.length).map(l => ({
  name: l.name, faction: l.faction, type: l.type, real_place: l.real_place || null,
  color: l.color || '#888', alpha: l.fill_alpha ?? 0.3, stroke: l.stroke || l.color || '#888',
  ring: l.polygon.map(([lon, lat]) => [lat, lon]),
}));

// faction display order, label, and whether it starts visible
const FACTIONS = [
  ['vampire',    'Vampire Territories', true],
  ['hq',         'Old Covenant Seats',  true],
  ['werewolf',   'Werewolf — the Forsaken', false],
  ['mage',       'Mage — the Awakening',    false],
  ['changeling', 'Changeling — the Lost',   false],
  ['ghost',      'The Restless Dead',       false],
  ['exclusion',  'Exclusion Zone',          false],
];
const swatch = f => (feats.find(x => x.faction === f) || {}).color || '#888';

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
/* Sally: mute the base tiles so the factions are the only saturated thing */
.leaflet-tile-pane{filter:sepia(.38) saturate(.65) brightness(.97) contrast(.92);}
/* themed chrome */
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
/* legend / layer panel */
.legend{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:.6rem .8rem;box-shadow:0 2px 12px rgba(40,30,16,.3);font-family:'Lora',serif;max-width:230px;}
.legend h4{font-family:'Cinzel',serif;font-weight:600;margin:0 0 .5rem;color:var(--ink);font-size:.95rem;letter-spacing:.04em;border-bottom:1px solid var(--line);padding-bottom:.35rem;}
.legend label{display:flex;align-items:center;gap:.5rem;font-size:.82rem;margin:.28rem 0;cursor:pointer;color:var(--ink);}
.legend .dot{width:.85rem;height:.85rem;border-radius:2px;flex:0 0 auto;border:1px solid rgba(0,0,0,.3);}
.legend input{accent-color:var(--gold2);}
.title-card{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:.5rem .8rem;box-shadow:0 2px 12px rgba(40,30,16,.3);}
.title-card .t{font-family:'Cinzel',serif;font-weight:600;font-size:1rem;color:var(--ink);}
.title-card .s{font-size:.72rem;color:var(--muted);letter-spacing:.04em;}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const DATA = ${JSON.stringify(feats)};
const HAVENS = ${JSON.stringify(havens)};
const FACTIONS = ${JSON.stringify(FACTIONS)};
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
  (groups[ft.faction]||groups.vampire).addLayer(poly);
});

FACTIONS.forEach(([f,, on])=>{ if(on) groups[f].addTo(map); });

// havens (point layer, off by default; shared addresses merged so a pin names its coterie)
const havenLayer = L.layerGroup();
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
});

// title card (top-left)
const title = L.control({position:'topleft'});
title.onAdd=function(){ const d=L.DomUtil.create('div','title-card');
  d.innerHTML='<div class="t">Terra Mortis</div><div class="s">Domains of Sydney</div>'; return d; };
title.addTo(map);

// legend / layer toggles (bottom-right)
const legend = L.control({position:'bottomright'});
legend.onAdd=function(){
  const d=L.DomUtil.create('div','legend'); L.DomEvent.disableClickPropagation(d);
  let h='<h4>Domains</h4>';
  FACTIONS.forEach(([f,label,on])=>{
    const col = DATA.find(x=>x.faction===f)?.color || '#888';
    h+='<label><input type="checkbox" data-f="'+f+'" '+(on?'checked':'')+'/>'+
       '<span class="dot" style="background:'+col+'"></span>'+label+'</label>';
  });
  h+='<label><input type="checkbox" data-f="__havens"/><span class="dot" style="background:#9a7b3f;border-radius:50%"></span>Havens</label>';
  d.innerHTML=h;
  d.querySelectorAll('input').forEach(cb=>cb.addEventListener('change',e=>{
    const g = e.target.dataset.f==='__havens' ? havenLayer : groups[e.target.dataset.f];
    if(e.target.checked) g.addTo(map); else map.removeLayer(g);
  }));
  return d;
};
legend.addTo(map);
</script>
</body>
</html>`;

writeFileSync('tm-map.html', html);
const residents = havens.reduce((n,h)=>n+h.residents.length,0);
console.log(`tm-map.html written: ${feats.length} polygon features across ${new Set(feats.map(f=>f.faction)).size} factions; ${havens.length} haven pins (${residents} residents).`);
console.log('Open by double-click (data is inlined - no server needed).');
