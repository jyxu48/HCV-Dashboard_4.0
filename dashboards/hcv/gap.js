// ── Mapbox token ──
mapboxgl.accessToken = 'pk.eyJ1Ijoib2luZHJpemEiLCJhIjoiY21sbzllaWcxMTI2YzNkb242NTJnbng1aCJ9.771NiwRe4c4CqePpL1LdEA';

// ── Color scale (gap ratio as 0–1 decimal) ────────────────────────────────────
const GAP_COLORS   = ['#ffffcc','#fed976','#fd8d3c','#e31a1c','#800026'];
const GAP_GRADIENT = 'linear-gradient(to right,#ffffcc,#fed976,#fd8d3c,#e31a1c,#800026)';
let   currentStops = [[0,'#ffffcc'],[0.10,'#fed976'],[0.20,'#fd8d3c'],[0.30,'#e31a1c'],[0.50,'#800026']];

function computeStops(values) {
  const valid = values.filter(v => v != null && isFinite(v));
  if (!valid.length) return currentStops;
  const mn = Math.min(...valid);
  const mx = Math.max(...valid);
  if (mn === mx) return [[mn, '#fd8d3c']];
  const step = (mx - mn) / (GAP_COLORS.length - 1);
  return GAP_COLORS.map((c, i) => [mn + step * i, c]);
}

// AMI config
const AMI_CFG = {
  30: { field:'gap_30', hhField:'eli_30', label:'<30% AMI (ELI)'   },
  50: { field:'gap_50', hhField:'vli_50', label:'30–50% AMI (VLI)' },
  80: { field:'gap_80', hhField:'li_80',  label:'50–80% AMI (LI)'  }
};

// ACS weighted-by variable config — all use gap_ratio / demographic_share
const VAR_CFG = {
  raw:      { shareField: null,              shareLabel: null,                          label: 'Raw Gap'      },
  renters:  { shareField: 'renter_share',    shareLabel: 'Renter Share',               label: 'Renters'      },
  children: { shareField: 'children_share',  shareLabel: 'Share of HHs with Children', label: 'Children HH'  },
  elderly:  { shareField: 'elderly_share',   shareLabel: 'Share of HHs with Elderly',  label: 'Elderly HH'   },
  poc:      { shareField: 'poc_share',       shareLabel: 'Share of HHs of Color',      label: 'HH of Color'  },
  poverty:  { shareField: 'poverty_share',   shareLabel: 'Share of HHs in Poverty',    label: 'Poverty HH'   },
};

// ── App state ─────────────────────────────────────────────────────────────────
let gapData        = null;   // gap2022_state.json
let gapCountyData  = null;   // gap2022_county.json
let gapTractData   = {};     // per-state tract data, lazy-loaded on demand
let gapAtlas       = null;
let gapStateFeats  = null;
let gapCountyFeats = null;
let gapGeo         = 'state';
let gapAMI         = 30;
let gapVar         = 'raw';

let gapHovId = null, gapLocId = null, gapLocFips = null;
let gapCtyHovId = null, gapCtyLocId = null, gapCtyLocFips = null;
let gapTractStateFips = null;   // last state loaded (for sidebar context)
const TRACT_SOURCE    = 'gap-tracts';
const TRACT_LAYER_SRC = 'tracts';  // vector tile source layer name

// ── Map ───────────────────────────────────────────────────────────────────────
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/light-v11',
  center: [-98, 39],
  zoom: 3.5,
  minZoom: 2
});
map.addControl(new mapboxgl.NavigationControl(), 'top-right');
map.on('load', () => { initGapModule(); });

// ── Init ──────────────────────────────────────────────────────────────────────
async function initGapModule() {
  document.getElementById('gap-loading').classList.remove('hidden');
  try {
    [gapData, gapCountyData, gapAtlas] = await Promise.all([
      fetch('data/gap2022_state.json').then(r => r.json()),
      fetch('data/gap2022_county.json').then(r => r.json()).catch(() => null),
      fetch('https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json').then(r => r.json())
    ]);
    gapStateFeats  = topojson.feature(gapAtlas, gapAtlas.objects.states).features;
    gapCountyFeats = topojson.feature(gapAtlas, gapAtlas.objects.counties).features;

    map.addSource('gap-states', { type:'geojson',
      data: topojson.feature(gapAtlas, gapAtlas.objects.states) });
    map.addLayer({ id:'gap-state-fill', type:'fill', source:'gap-states',
      paint:{'fill-color':'#333333','fill-opacity':0.85} });
    map.addLayer({ id:'gap-state-line', type:'line', source:'gap-states',
      paint:{'line-color':'#2a2f40','line-width':0.7} });
    map.addLayer({ id:'gap-state-hover', type:'line', source:'gap-states',
      paint:{'line-color':'#ffffff',
        'line-width':['case',['boolean',['feature-state','hovered'],false],2,0],'line-opacity':0.9} });
    map.addLayer({ id:'gap-state-selected', type:'line', source:'gap-states',
      paint:{'line-color':'#5b8dee',
        'line-width':['case',['boolean',['feature-state','selected'],false],2.5,0]} });

    map.addSource('gap-counties', { type:'geojson',
      data: topojson.feature(gapAtlas, gapAtlas.objects.counties) });
    map.addLayer({ id:'gap-county-fill', type:'fill', source:'gap-counties',
      layout:{visibility:'none'}, paint:{'fill-color':'#333333','fill-opacity':0.85} });
    map.addLayer({ id:'gap-county-line', type:'line', source:'gap-counties',
      layout:{visibility:'none'}, paint:{'line-color':'#1a1d26','line-width':0.3} });
    map.addLayer({ id:'gap-county-hover', type:'line', source:'gap-counties',
      layout:{visibility:'none'},
      paint:{'line-color':'#ffffff',
        'line-width':['case',['boolean',['feature-state','hovered'],false],1.5,0],'line-opacity':0.9} });
    map.addLayer({ id:'gap-county-selected', type:'line', source:'gap-counties',
      layout:{visibility:'none'},
      paint:{'line-color':'#5b8dee',
        'line-width':['case',['boolean',['feature-state','selected'],false],2,0]} });

    // Mapbox vector tileset for census tracts (built with Tippecanoe)
    map.addSource(TRACT_SOURCE, {
      type: 'vector',
      url: 'mapbox://oindriza.7n39jfbi',
      promoteId: { [TRACT_LAYER_SRC]: 'GEOID' }
    });
    map.addLayer({ id:'gap-tract-fill', type:'fill', source:TRACT_SOURCE,
      'source-layer': TRACT_LAYER_SRC,
      layout:{visibility:'none'},
      paint:{
        'fill-color': ['coalesce', ['feature-state', 'gap_color'], '#333333'],
        'fill-opacity': 0.85
      }
    });
    map.addLayer({ id:'gap-tract-line', type:'line', source:TRACT_SOURCE,
      'source-layer': TRACT_LAYER_SRC,
      layout:{visibility:'none'},
      paint:{'line-color':'#555566','line-width':0.4}
    });
    map.on('mousemove','gap-tract-fill', e => {
      if (!e.features.length) return;
      map.getCanvas().style.cursor = 'pointer';
      const raw   = e.features[0].properties?.GEOID;
      const geoid = String(raw||'').padStart(11,'0');
      console.debug('[tract hover] raw GEOID:', raw, '→ padded:', geoid);
      renderTractSidebar(geoid);
    });
    map.on('mouseleave','gap-tract-fill', () => {
      map.getCanvas().style.cursor = '';
      showDefaultPanel();
    });

    // Reapply tract colors whenever the viewport settles (new tiles become visible)
    map.on('moveend', () => { if (gapGeo === 'tract') applyTractColors(); });
    map.on('zoomend', () => { if (gapGeo === 'tract') applyTractColors(); });

    setupInteractions();
    populateTractStateSelect();
  } catch(e) {
    console.error('Init error:', e);
    document.getElementById('gap-loading').textContent = 'Failed to load data.';
    return;
  }
  document.getElementById('gap-loading').classList.add('hidden');
  paintStates();
  updateLegend();
}

// ── Layer visibility ──────────────────────────────────────────────────────────
const STATE_LAYERS  = ['gap-state-fill','gap-state-line','gap-state-hover','gap-state-selected'];
const COUNTY_LAYERS = ['gap-county-fill','gap-county-line','gap-county-hover','gap-county-selected'];
const TRACT_LAYERS  = ['gap-tract-fill','gap-tract-line'];

function showStateLayers() {
  COUNTY_LAYERS.concat(TRACT_LAYERS).forEach(id => {
    if (map.getLayer(id)) map.setLayoutProperty(id,'visibility','none');
  });
  STATE_LAYERS.forEach(id => {
    if (map.getLayer(id)) map.setLayoutProperty(id,'visibility','visible');
  });
  map.setPaintProperty('gap-state-fill','fill-opacity',0.85);
}
function showCountyLayers() {
  STATE_LAYERS.concat(TRACT_LAYERS).forEach(id => {
    if (map.getLayer(id)) map.setLayoutProperty(id,'visibility','none');
  });
  COUNTY_LAYERS.forEach(id => {
    if (map.getLayer(id)) map.setLayoutProperty(id,'visibility','visible');
  });
}
function showTractLayers() {
  COUNTY_LAYERS.forEach(id => {
    if (map.getLayer(id)) map.setLayoutProperty(id,'visibility','none');
  });
  ['gap-state-hover','gap-state-selected'].forEach(id => {
    if (map.getLayer(id)) map.setLayoutProperty(id,'visibility','none');
  });
  ['gap-state-fill','gap-state-line'].forEach(id => {
    if (map.getLayer(id)) map.setLayoutProperty(id,'visibility','visible');
  });
  map.setPaintProperty('gap-state-fill','fill-opacity',0.01);
  map.setLayoutProperty('gap-tract-fill','visibility','visible');
  map.setLayoutProperty('gap-tract-line','visibility','visible');
}

// ── Color helpers ─────────────────────────────────────────────────────────────
function interpColor(stops, value) {
  if (value <= stops[0][0]) return stops[0][1];
  if (value >= stops[stops.length-1][0]) return stops[stops.length-1][1];
  for (let i = 0; i < stops.length-1; i++) {
    const [v0,c0] = stops[i], [v1,c1] = stops[i+1];
    if (value >= v0 && value <= v1) return lerpHex(c0, c1, (value-v0)/(v1-v0));
  }
  return stops[stops.length-1][1];
}
function lerpHex(c0, c1, t) {
  const r0=parseInt(c0.slice(1,3),16),g0=parseInt(c0.slice(3,5),16),b0=parseInt(c0.slice(5,7),16);
  const r1=parseInt(c1.slice(1,3),16),g1=parseInt(c1.slice(3,5),16),b1=parseInt(c1.slice(5,7),16);
  const r=Math.round(r0+(r1-r0)*t),g=Math.round(g0+(g1-g0)*t),b=Math.round(b0+(b1-b0)*t);
  return '#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function fmtPct(v)  { return v != null ? (v*100).toFixed(1)+'%' : 'N/A'; }
function fmtN(v)    { if (v == null) return 'N/A'; return v.toLocaleString(); }

// ── Paint helpers ─────────────────────────────────────────────────────────────
function gapField() {
  if (gapVar === 'raw') return AMI_CFG[gapAMI].field;
  return `norm_gap_${gapAMI}_${gapVar}`;   // e.g. norm_gap_30_renters
}

function paintStates() {
  if (!gapData || !gapStateFeats || !map.getSource('gap-states')) return;
  const field = gapField(), noData = '#333333';
  const values = Object.values(gapData).map(r => r[field]);
  currentStops = computeStops(values);
  const features = gapStateFeats.map(f => {
    const fips  = String(f.id).padStart(2,'0');
    const ratio = gapData[fips]?.[field] ?? null;
    return { ...f, properties: { ...f.properties,
      fill_color: ratio !== null ? interpColor(currentStops, ratio) : noData }};
  });
  map.getSource('gap-states').setData({ type:'FeatureCollection', features });
  map.setPaintProperty('gap-state-fill','fill-color',['get','fill_color']);
  updateLegend();
  if (gapLocFips) renderSidebar('state', gapLocFips, true);
}

function paintCounties() {
  if (!gapCountyData || !gapCountyFeats || !map.getSource('gap-counties')) return;
  const field = gapField(), noData = '#333333';
  const values = Object.values(gapCountyData).map(r => r[field]);
  currentStops = computeStops(values);
  const features = gapCountyFeats.map(f => {
    const fips5 = String(f.id).padStart(5,'0');
    const ratio = gapCountyData[fips5]?.[field] ?? null;
    return { ...f, properties: { ...f.properties,
      fill_color: ratio !== null ? interpColor(currentStops, ratio) : noData }};
  });
  map.getSource('gap-counties').setData({ type:'FeatureCollection', features });
  map.setPaintProperty('gap-county-fill','fill-color',['get','fill_color']);
  updateLegend();
  if (gapCtyLocFips) renderSidebar('county', gapCtyLocFips, true);
}

// ── Tract layer ───────────────────────────────────────────────────────────────

// GEOID → color lookup built whenever field/AMI changes
const tractColorMap = new Map();

function paintTractFeatureState() {
  if (!gapTractData || !Object.keys(gapTractData).length) return;
  const field  = gapField();
  const noData = '#4a4a5a';

  // Rebuild color map from all loaded states
  const allValues = [];
  for (const sd of Object.values(gapTractData))
    for (const rec of Object.values(sd)) { const v = rec[field]; if (v != null) allValues.push(v); }
  currentStops = computeStops(allValues);

  tractColorMap.clear();
  for (const [, sd] of Object.entries(gapTractData)) {
    for (const [geoid, rec] of Object.entries(sd)) {
      const v = rec[field];
      tractColorMap.set(geoid, v != null ? interpColor(currentStops, v) : noData);
    }
  }
  console.log(`paintTractFeatureState: colorMap has ${tractColorMap.size} entries, field=${field}`);
  applyTractColors();
  updateLegend();
}

// Apply colors to whatever tract features are currently rendered on screen.
// Uses the feature's real .id (from promoteId) to set feature-state,
// and looks up the color by GEOID property string.
function applyTractColors() {
  if (!tractColorMap.size) return;
  const rendered = map.queryRenderedFeatures({ layers: ['gap-tract-fill'] });
  if (!rendered.length) return;
  let hit = 0, miss = 0;
  for (const f of rendered) {
    const geoid = String(f.properties?.GEOID ?? '').padStart(11, '0');
    const color = tractColorMap.get(geoid) ?? '#4a4a5a';
    if (f.id != null) {
      map.setFeatureState(
        { source: TRACT_SOURCE, sourceLayer: TRACT_LAYER_SRC, id: f.id },
        { gap_color: color }
      );
      if (tractColorMap.has(geoid)) hit++; else miss++;
    }
  }
  console.log(`applyTractColors: ${rendered.length} rendered → ${hit} hits, ${miss} no-data`);
}

async function loadTractLayer(stateFips, stateGeom) {
  const loadEl = document.getElementById('tract-loading');

  // Zoom to state
  gapTractStateFips = stateFips;
  const sel = document.getElementById('tract-state-select');
  if (sel) sel.value = stateFips;
  const geomSrc = stateGeom || gapStateFeats?.find(f => String(f.id).padStart(2,'0') === stateFips)?.geometry;
  if (geomSrc) { const b = getBounds(geomSrc); if (b) map.fitBounds(b,{padding:60,maxZoom:9,duration:600}); }

  showTractLayers();

  // Load gap data for this state (lazy, cached)
  if (!gapTractData[stateFips]) {
    loadEl.textContent = 'Loading tract data…';
    loadEl.classList.remove('hidden');
    try {
      gapTractData[stateFips] = await fetch(`data/gap2022_tract_by_state/${stateFips}.json`).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      });
    } catch(e) {
      console.error('Tract gap data load failed:', e);
      loadEl.textContent = `Gap data load failed: ${e.message}`;
      setTimeout(() => loadEl.classList.add('hidden'), 5000);
      return;
    }
    loadEl.classList.add('hidden');
  }

  paintTractFeatureState();
  // Re-apply after tiles settle from the zoom animation
  map.once('idle', () => {
    paintTractFeatureState();
    // Quick diagnostic
    const rendered = map.queryRenderedFeatures({ layers: ['gap-tract-fill'] });
    if (rendered.length) {
      const f = rendered[0];
      console.log('[tract diag] id:', f.id, '| GEOID:', f.properties?.GEOID,
        '| state:', map.getFeatureState({ source: TRACT_SOURCE, sourceLayer: TRACT_LAYER_SRC, id: f.id }));
    }
  });
}

// ── Interactions ──────────────────────────────────────────────────────────────
function setupInteractions() {
  map.on('mousemove','gap-state-fill', e => {
    if (!e.features.length) return;
    map.getCanvas().style.cursor = 'pointer';
    const feat = e.features[0], fips2 = String(feat.id).padStart(2,'0');
    if (gapGeo === 'tract') {
      document.getElementById('hint-primary').textContent =
        `Click ${gapData?.[fips2]?.name||'state'} to load tracts.`; return;
    }
    if (gapHovId !== null && gapHovId !== feat.id)
      map.setFeatureState({source:'gap-states',id:gapHovId},{hovered:false});
    gapHovId = feat.id;
    map.setFeatureState({source:'gap-states',id:gapHovId},{hovered:true});
    if (!gapLocId) renderSidebar('state', fips2, false);
  });
  map.on('mouseleave','gap-state-fill', () => {
    map.getCanvas().style.cursor = '';
    if (gapGeo === 'tract') {
      document.getElementById('hint-primary').textContent = 'Click a state to load its census tracts.'; return;
    }
    if (gapHovId !== null) { map.setFeatureState({source:'gap-states',id:gapHovId},{hovered:false}); gapHovId = null; }
    if (!gapLocId) showDefaultPanel();
  });
  map.on('click','gap-state-fill', e => {
    if (!e.features.length) return;
    const feat = e.features[0], fips = String(feat.id).padStart(2,'0');
    if (gapGeo === 'tract') { loadTractLayer(fips, feat.geometry); return; }
    if (gapLocId === feat.id) {
      map.setFeatureState({source:'gap-states',id:feat.id},{selected:false});
      gapLocId = null; gapLocFips = null; showDefaultPanel();
    } else {
      if (gapLocId !== null) map.setFeatureState({source:'gap-states',id:gapLocId},{selected:false});
      gapLocId = feat.id; gapLocFips = fips;
      map.setFeatureState({source:'gap-states',id:feat.id},{selected:true});
      renderSidebar('state', fips, true);
      const b = getBounds(feat.geometry); if (b) map.fitBounds(b,{padding:80,maxZoom:8,duration:800});
    }
  });
  map.on('mousemove','gap-county-fill', e => {
    if (!e.features.length) return;
    map.getCanvas().style.cursor = 'pointer';
    const feat = e.features[0], fips5 = String(feat.id).padStart(5,'0');
    if (gapCtyHovId !== null && gapCtyHovId !== feat.id)
      map.setFeatureState({source:'gap-counties',id:gapCtyHovId},{hovered:false});
    gapCtyHovId = feat.id;
    map.setFeatureState({source:'gap-counties',id:gapCtyHovId},{hovered:true});
    if (!gapCtyLocId) renderSidebar('county', fips5, false);
  });
  map.on('mouseleave','gap-county-fill', () => {
    map.getCanvas().style.cursor = '';
    if (gapCtyHovId !== null) { map.setFeatureState({source:'gap-counties',id:gapCtyHovId},{hovered:false}); gapCtyHovId = null; }
    if (!gapCtyLocId) showDefaultPanel();
  });
  map.on('click','gap-county-fill', e => {
    if (!e.features.length) return;
    const feat = e.features[0], fips5 = String(feat.id).padStart(5,'0');
    if (gapCtyLocId === feat.id) {
      map.setFeatureState({source:'gap-counties',id:feat.id},{selected:false});
      gapCtyLocId = null; gapCtyLocFips = null; showDefaultPanel();
    } else {
      if (gapCtyLocId !== null) map.setFeatureState({source:'gap-counties',id:gapCtyLocId},{selected:false});
      gapCtyLocId = feat.id; gapCtyLocFips = fips5;
      map.setFeatureState({source:'gap-counties',id:feat.id},{selected:true});
      renderSidebar('county', fips5, true);
      const b = getBounds(feat.geometry); if (b) map.fitBounds(b,{padding:80,maxZoom:12,duration:800});
    }
  });
  map.on('click', e => {
    const layers = gapGeo==='state' ? ['gap-state-fill']
                 : gapGeo==='county' ? ['gap-county-fill']
                 : ['gap-tract-fill','gap-state-fill'];
    if (map.queryRenderedFeatures(e.point,{layers}).length) return;
    if (gapLocId !== null) { map.setFeatureState({source:'gap-states',id:gapLocId},{selected:false}); gapLocId=null; gapLocFips=null; }
    if (gapCtyLocId !== null) { map.setFeatureState({source:'gap-counties',id:gapCtyLocId},{selected:false}); gapCtyLocId=null; gapCtyLocFips=null; }
    showDefaultPanel();
  });
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function renderSidebar(geoType, fips, locked) {
  const rec = geoType === 'state' ? gapData?.[fips] : gapCountyData?.[fips];
  if (!rec) return;

  document.getElementById('gap-info-default').classList.add('hidden');
  document.getElementById('gap-info-content').classList.remove('hidden');
  document.getElementById('gap-geo-name').textContent = rec.name || fips;
  document.getElementById('gap-geo-sub').textContent  =
    (rec.stateAb || '') + (locked ? '  ·  Locked' : '');

  const cfg      = AMI_CFG[gapAMI];
  const vcfg     = VAR_CFG[gapVar];
  const eligible = rec[cfg.hhField];
  const vouchers = rec.actual_vouchers;
  const total    = rec.total_renters;
  const rawGap   = rec[cfg.field];
  const dispGap  = gapVar === 'raw' ? rawGap : rec[`norm_gap_${gapAMI}_${gapVar}`];
  const shareVal = vcfg.shareField ? rec[vcfg.shareField] : null;

  buildSidebarHTML(
    dispGap, rawGap, eligible, vouchers, total,
    rec.total_units, rec.pct_occupied,
    cfg.label, shareVal, vcfg
  );
}

function renderTractSidebar(fips11) {
  const sfips = fips11.slice(0, 2);
  const rec = gapTractData?.[sfips]?.[fips11];
  const sf  = FIPS_TO_STATE[fips11.slice(0,2)] || fips11.slice(0,2);

  document.getElementById('gap-info-default').classList.add('hidden');
  document.getElementById('gap-info-content').classList.remove('hidden');
  document.getElementById('gap-geo-name').textContent = 'Tract ' + fips11.slice(5);
  document.getElementById('gap-geo-sub').textContent  = sf;

  const cfg  = AMI_CFG[gapAMI];
  const vcfg = VAR_CFG[gapVar];
  if (!rec) { buildSidebarHTML(null, null, null, null, null, null, null, cfg.label, null, vcfg); return; }

  const rawGap   = rec[cfg.field];
  const dispGap  = gapVar === 'raw' ? rawGap : rec[`norm_gap_${gapAMI}_${gapVar}`];
  const shareVal = vcfg.shareField ? rec[vcfg.shareField] : null;

  buildSidebarHTML(
    dispGap, rawGap, rec[cfg.hhField], rec.actual_vouchers, rec.total_renters,
    rec.total_units, rec.pct_occupied,
    cfg.label, shareVal, vcfg
  );
}

function buildSidebarHTML(dispGap, rawGap, eligible, vouchers, total, totalUnits, pctOcc, amiLabel, shareVal, vcfg) {
  const grid   = document.getElementById('gap-metrics');
  const isNorm = vcfg && vcfg.shareField;
  const dispLabel = isNorm
    ? `Weighted Gap · ${amiLabel} · ${vcfg.label}`
    : `Voucher Gap Ratio · ${amiLabel}`;

  const dispStr = dispGap == null ? 'N/A' : (dispGap * 100).toFixed(1) + '%';
  const rawStr  = rawGap  == null ? 'N/A' : (rawGap  * 100).toFixed(1) + '%';
  const shrDisp = shareVal != null ? (shareVal * 100).toFixed(1) + '%' : 'N/A';

  const ratioRow = `
    <div class="metric-card highlighted span-2">
      <div class="metric-label">${dispLabel}</div>
      <div class="metric-value${dispGap == null ? ' na' : ''}">${dispStr}</div>
    </div>`;

  const actualVouchers = (totalUnits != null && pctOcc != null)
    ? Math.round(totalUnits * pctOcc / 100) : null;

  const vars = `
    <div class="sidebar-section-label">PSH VOUCHER INPUTS</div>
    <div class="metric-card">
      <div class="metric-label">Total Units (PSH)</div>
      <div class="metric-value">${fmtN(totalUnits)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">% Occupied</div>
      <div class="metric-value">${pctOcc != null ? pctOcc.toFixed(1)+'%' : 'N/A'}</div>
    </div>
    <div class="metric-card span-2">
      <div class="metric-label">Actual Vouchers (Units × % Occupied)</div>
      <div class="metric-value">${fmtN(actualVouchers)}</div>
    </div>
    <div class="sidebar-section-label">CHAS RENTER INPUTS</div>
    <div class="metric-card">
      <div class="metric-label">Eligible Renters (${amiLabel})</div>
      <div class="metric-value">${fmtN(eligible)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Total Renters</div>
      <div class="metric-value">${fmtN(total)}</div>
    </div>`;

  // ACS denominator (weighted only)
  const acsSection = isNorm ? `
    <div class="sidebar-section-label">ACS DENOMINATOR</div>
    <div class="metric-card span-2">
      <div class="metric-label">${vcfg.shareLabel}</div>
      <div class="metric-value">${shrDisp}</div>
    </div>` : '';

  // Formula block — all weighted use: Voucher Gap Ratio ÷ Demographic Share
  let formulaText, formulaCalc;
  if (isNorm) {
    formulaText = `Weighted Gap =<br>Voucher Gap Ratio × ${vcfg.shareLabel}`;
    formulaCalc = `${rawStr} × ${shrDisp}<br>= ${dispStr}`;
  } else {
    formulaText = `Voucher Gap Ratio =<br>(Eligible Renters − Actual Vouchers)<br>÷ Total Renters`;
    formulaCalc = `(${fmtN(eligible)} − ${fmtN(actualVouchers)})<br>÷ ${fmtN(total)}<br>= ${dispStr}`;
  }

  const formula = `
    <div class="formula-block">
      <div class="formula-title">Formula</div>
      <div class="formula-text">${formulaText}</div>
      <div class="formula-calc">${formulaCalc}</div>
    </div>`;

  grid.innerHTML = ratioRow + vars + acsSection + formula;
}

function showDefaultPanel() {
  document.getElementById('gap-info-default').classList.remove('hidden');
  document.getElementById('gap-info-content').classList.add('hidden');
}

// ── Legend ────────────────────────────────────────────────────────────────────
function updateLegend() {
  const isNorm = gapVar !== 'raw';
  const title  = isNorm
    ? `Weighted by ${VAR_CFG[gapVar].label} · ${AMI_CFG[gapAMI].label}`
    : `Voucher Gap Ratio · ${AMI_CFG[gapAMI].label}`;
  document.getElementById('legend-title').textContent = title;
  document.getElementById('legend-gradient').style.background = GAP_GRADIENT;
  const mn  = currentStops[0][0];
  const mx  = currentStops[currentStops.length - 1][0];
  const mid = (mn + mx) / 2;
  const fmt = v => fmtPct(v);
  document.getElementById('legend-min').textContent = fmt(mn);
  document.getElementById('legend-mid').textContent = fmt(mid);
  document.getElementById('legend-max').textContent = fmt(mx);
}

// ── Tract state dropdown ──────────────────────────────────────────────────────
function populateTractStateSelect() {
  const sel = document.getElementById('tract-state-select');
  if (!sel || !gapData) return;
  sel.innerHTML = '<option value="">— click map or select —</option>';
  Object.entries(gapData)
    .filter(([,s]) => s.stateAb)
    .sort((a,b) => a[1].stateAb.localeCompare(b[1].stateAb))
    .forEach(([fips,s]) => {
      const o = document.createElement('option');
      o.value = fips; o.textContent = `${s.stateAb} – ${s.name}`;
      sel.appendChild(o);
    });
  sel.addEventListener('change', () => { if (sel.value) loadTractLayer(sel.value, null); });
}

// ── Geometry helpers ──────────────────────────────────────────────────────────
function getBounds(geom) {
  try {
    const cs = flattenCoords(geom); if (!cs.length) return null;
    const lngs=cs.map(c=>c[0]),lats=cs.map(c=>c[1]);
    return [[Math.min(...lngs),Math.min(...lats)],[Math.max(...lngs),Math.max(...lats)]];
  } catch { return null; }
}
function flattenCoords(g) {
  if (!g) return [];
  if (g.type==='Point') return [g.coordinates];
  if (g.type==='LineString') return g.coordinates;
  if (g.type==='Polygon') return g.coordinates.flat();
  if (g.type==='MultiPolygon') return g.coordinates.flat(2);
  if (g.type==='MultiLineString') return g.coordinates.flat();
  return [];
}

const FIPS_TO_STATE = {
  '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE','11':'DC',
  '12':'FL','13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA','20':'KS','21':'KY',
  '22':'LA','23':'ME','24':'MD','25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT',
  '31':'NE','32':'NV','33':'NH','34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND','39':'OH',
  '40':'OK','41':'OR','42':'PA','44':'RI','45':'SC','46':'SD','47':'TN','48':'TX','49':'UT',
  '50':'VT','51':'VA','53':'WA','54':'WV','55':'WI','56':'WY','72':'PR','78':'VI'
};

// ── Variable toggles (raw + weighted, mutually exclusive) ─────────────────────
function setGapVar(v) {
  gapVar = v;
  // Sync button states across both groups
  document.querySelectorAll('#raw-toggle .tog-btn, #var-toggle .tog-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.var === v);
  });
  if      (gapGeo === 'state')  paintStates();
  else if (gapGeo === 'county') paintCounties();
  else if (gapGeo === 'tract')  paintTractFeatureState();
}

document.querySelectorAll('#raw-toggle .tog-btn, #var-toggle .tog-btn').forEach(btn => {
  btn.addEventListener('click', () => setGapVar(btn.dataset.var));
});

// ── AMI toggle ────────────────────────────────────────────────────────────────
document.querySelectorAll('#ami-toggle .tog-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#ami-toggle .tog-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    gapAMI = +btn.dataset.ami;
    if      (gapGeo === 'state')  paintStates();
    else if (gapGeo === 'county') paintCounties();
    else if (gapGeo === 'tract')  paintTractFeatureState();
  });
});

// ── Geography toggle ──────────────────────────────────────────────────────────
document.querySelectorAll('#geo-toggle .tog-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#geo-toggle .tog-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const prev = gapGeo;
    gapGeo = btn.dataset.val;
    if (prev !== gapGeo) {
      if (gapLocId !== null) { map.setFeatureState({source:'gap-states',id:gapLocId},{selected:false}); gapLocId=null; gapLocFips=null; }
      if (gapCtyLocId !== null) { map.setFeatureState({source:'gap-counties',id:gapCtyLocId},{selected:false}); gapCtyLocId=null; gapCtyLocFips=null; }
      showDefaultPanel();
    }
    const hints = {
      state:  ['Hover over a state to see the voucher gap ratio.',  'Click to lock selection.'],
      county: ['Hover over a county to see the voucher gap ratio.', 'Click to lock selection.'],
      tract:  ['Click a state to load its census tracts.',          'Select from the dropdown or click the map.']
    };
    document.getElementById('hint-primary').textContent   = hints[gapGeo][0];
    document.getElementById('hint-secondary').textContent = hints[gapGeo][1];
    document.getElementById('tract-state-group').classList.toggle('hidden', gapGeo !== 'tract');
    if      (gapGeo === 'state')  { showStateLayers();  paintStates();   }
    else if (gapGeo === 'county') { showCountyLayers(); paintCounties(); }
    else { showTractLayers(); if (Object.keys(gapTractData).length) paintTractFeatureState(); }
  });
});

// ── Sidebar drag-to-resize ─────────────────────────────────────────────────
(function () {
  const sidebar = document.getElementById('sidebar');
  const handle  = document.createElement('div');
  handle.id = 'sidebar-resize-handle';
  sidebar.prepend(handle);

  let dragging = false, startX = 0, startW = 0;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    startX   = e.clientX;
    startW   = sidebar.offsetWidth;
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const newW = Math.min(Math.max(startW + (startX - e.clientX), 280), 680);
    sidebar.style.width    = newW + 'px';
    sidebar.style.minWidth = newW + 'px';
    sidebar.style.fontSize = (13 * newW / 400).toFixed(2) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
  });
})();
