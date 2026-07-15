// server/scripts/export-map-png.mjs — export a static PNG snapshot of tm-map.html, filtered to
// specific factions, with the territory labels made legible against the OSM tile background.
//
// The live map's .terr-label CSS only uses a soft text-shadow halo, tuned for a plain background.
// Against real OpenStreetMap tiles (streets, suburb names, water) that halo isn't enough contrast,
// and several labels collide with the base map's own place names or get clipped at the fixed
// setView bounds. This script does NOT touch the live interactive map at all -- it drives a
// headless copy of the same page, hides the factions/overlays the export doesn't want, gives labels
// a solid background pill for the static image, fits the view to what's actually shown, and
// screenshots just the #map element.
//
// Usage: node server/scripts/export-map-png.mjs [--out <path>] [--factions vampire,mage,exclusion]
//
// No live DB, no writes back to tm-map.html -- read-only over the page, output is a new PNG file.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAP_HTML = join(ROOT, 'tm-map.html');

const argv = process.argv.slice(2);
function argVal(flag, dflt) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : dflt;
}
const OUT = resolve(argVal('--out', join(ROOT, 'scratch', 'tm-map-vampire-mage-exclusion.png')));
const KEEP_FACTIONS = argVal('--factions', 'vampire,mage,exclusion').split(',').map((s) => s.trim());

// Every faction checkbox key + every point-overlay checkbox key the live legend renders.
const ALL_FACTION_KEYS = ['vampire', 'hq', 'werewolf', 'mage', 'changeling', 'geist', 'ghost', 'exclusion'];
const ALL_POI_KEYS = ['__havens', '__elysiums', '__npchomes', '__npcwork', '__loci', '__ley', '__wyrm', '__geist', '__court', '__hq'];

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 2 });

  await page.goto('file:///' + MAP_HTML.replace(/\\/g, '/'), { waitUntil: 'load' });
  // Let the initial OSM tile set for the default view load before we touch anything.
  await page.waitForTimeout(1500);

  // Uncheck every faction not being kept, and every point-overlay checkbox -- a territories-only
  // export doesn't want havens/elysiums/ley lines/etc. cluttering it. Real .click() so the page's
  // own 'change' listeners run exactly as they would for a person using the legend.
  await page.evaluate(({ keep, allFactions, allPoi }) => {
    const drop = new Set([...allFactions.filter((f) => !keep.includes(f)), ...allPoi]);
    document.querySelectorAll('input[type=checkbox][data-f]').forEach((cb) => {
      if (drop.has(cb.dataset.f) && cb.checked) cb.click();
    });
  }, { keep: KEEP_FACTIONS, allFactions: ALL_FACTION_KEYS, allPoi: ALL_POI_KEYS });

  // Hide the interactive chrome that doesn't belong in a static reference image: the population
  // census panel (lists every faction including hidden ones) and the two filter-legend controls.
  // The title card ("Terra Mortis / Domains of Sydney") stays -- it reads fine as a caption.
  await page.evaluate(() => {
    document.querySelectorAll('.popkey, .legend, .leaflet-bottom.leaflet-left').forEach((el) => {
      const ctrl = el.closest('.leaflet-control') || el;
      ctrl.style.display = 'none';
    });
  });

  // Fit the view to the union of whatever's actually still on the map, instead of the page's fixed
  // setView -- this is what was clipping Eastcliff Watchtower (a mage zone) out of frame.
  await page.evaluate(({ keep }) => {
    let bounds = null;
    keep.forEach((f) => {
      const g = window.__tmGroups ? window.__tmGroups[f] : null;
      if (!g) return;
      g.eachLayer((l) => {
        if (typeof l.getBounds !== 'function') return;
        bounds = bounds ? bounds.extend(l.getBounds()) : l.getBounds();
      });
    });
    if (bounds) window.__tmMap.fitBounds(bounds, { padding: [10, 10] });
  }, { keep: KEEP_FACTIONS });

  // fitBounds alone kept landing on the same integer zoom level regardless of padding -- force one
  // step closer explicitly rather than fighting Leaflet's own "largest zoom that still fits" choice.
  await page.evaluate(() => { window.__tmMap.setZoom(window.__tmMap.getZoom() + 1); });
  await page.waitForTimeout(600);

  // The Federation Glade (mage) and The Academy (vampire) sit close enough that their center-anchored
  // label pills collide at every zoom level tried. Nudge Federation Glade's label away rather than
  // keep cranking the zoom just to chase one pair apart -- Leaflet positions the tooltip with its own
  // inline transform:translate3d(...), so append a further translate() rather than replace it.
  await page.evaluate(() => {
    const els = document.querySelectorAll('.terr-label');
    for (const el of els) {
      if (el.textContent.trim() === 'The Federation Glade') {
        el.style.transform += ' translate(38px, -8px)';
      }
    }
  });

  // Give the territory labels real contrast against OSM tiles: a solid parchment pill instead of
  // just a soft text-shadow halo, plus a touch more size/weight so they hold up at export resolution.
  await page.addStyleTag({
    content: `
      .terr-label{
        background:rgba(250,244,227,.94)!important;
        border:1px solid rgba(58,40,20,.35)!important;
        border-radius:4px!important;
        padding:2px 7px!important;
        text-shadow:none!important;
        font-size:.86rem!important;
        box-shadow:0 1px 2px rgba(0,0,0,.25)!important;
      }
    `,
  });

  // Let the fitBounds pan/zoom settle and the newly-visible tiles finish loading.
  await page.waitForTimeout(1200);

  const mapEl = await page.$('#map');
  await mapEl.screenshot({ path: OUT });
  await browser.close();
  console.log('wrote ' + OUT);
};

run().catch((e) => { console.error(e); process.exit(1); });
