// ── Mapbox token ──
mapboxgl.accessToken = 'pk.eyJ1Ijoib2luZHJpemEiLCJhIjoiY21sbzllaWcxMTI2YzNkb242NTJnbng1aCJ9.771NiwRe4c4CqePpL1LdEA';

// ── Metric configuration ──
const METRICS = {
  effective_under_lease: {
    label: 'Effective Under Lease',
    shortLabel: 'Eff. Leased',
    format: v => (v * 100).toFixed(1) + '%',
    stops: [0.7, '#c6dbef', 0.9, '#2171b5', 1.05, '#08306b'],
    legendStops: [0.7, 0.9, 1.05],
    gradient: 'linear-gradient(to right, #c6dbef, #2171b5, #08306b)',
    description: 'Vouchers effectively under lease / Total vouchers'
  },
  utilization_rate: {
    label: 'Utilization Rate',
    shortLabel: 'Utilization',
    format: v => (v * 100).toFixed(1) + '%',
    stops: [0.7, '#cbc9e2', 0.9, '#756bb1', 1.05, '#3f007d'],
    legendStops: [0.7, 0.9, 1.05],
    gradient: 'linear-gradient(to right, #cbc9e2, #756bb1, #3f007d)',
    description: 'Vouchers under lease / Total vouchers'
  },
  success_rate: {
    label: 'Success Rate',
    shortLabel: 'Success',
    format: v => (v * 100).toFixed(1) + '%',
    stops: [0.5, '#f7fcf5', 0.75, '#41ab5d', 1.0, '#00441b'],
    legendStops: [0.5, 0.75, 1.0],
    gradient: 'linear-gradient(to right, #f7fcf5, #41ab5d, #00441b)',
    description: 'Leased / (Leased + Issued not leased)'
  },
  cost_per_voucher: {
    label: 'Cost Per Voucher',
    shortLabel: 'Cost/Voucher',
    format: v => '$' + Math.round(v).toLocaleString(),
    stops: [0, '#fff5eb', 1000, '#fd8d3c', 3000, '#7f2704'],
    legendStops: [0, 1000, 3000],
    gradient: 'linear-gradient(to right, #fff5eb, #fd8d3c, #7f2704)',
    description: 'HAP expenses / Vouchers under lease'
  },
  port_in_rate: {
    label: 'Port-In Rate',
    shortLabel: 'Port-In',
    format: v => (v * 100).toFixed(1) + '%',
    stops: [0, '#b2e2e2', 0.15, '#2ca25f', 0.5, '#006d2c'],
    legendStops: [0, 0.15, 0.5],
    gradient: 'linear-gradient(to right, #b2e2e2, #2ca25f, #006d2c)',
    description: 'Portable vouchers / Vouchers under lease'
  }
};

// ── State abbreviation → name lookup ──
const STATE_NAMES = {
  AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California',
  CO:'Colorado', CT:'Connecticut', DE:'Delaware', FL:'Florida', GA:'Georgia',
  HI:'Hawaii', ID:'Idaho', IL:'Illinois', IN:'Indiana', IA:'Iowa',
  KS:'Kansas', KY:'Kentucky', LA:'Louisiana', ME:'Maine', MD:'Maryland',
  MA:'Massachusetts', MI:'Michigan', MN:'Minnesota', MS:'Mississippi',
  MO:'Missouri', MT:'Montana', NE:'Nebraska', NV:'Nevada', NH:'New Hampshire',
  NJ:'New Jersey', NM:'New Mexico', NY:'New York', NC:'North Carolina',
  ND:'North Dakota', OH:'Ohio', OK:'Oklahoma', OR:'Oregon', PA:'Pennsylvania',
  RI:'Rhode Island', SC:'South Carolina', SD:'South Dakota', TN:'Tennessee',
  TX:'Texas', UT:'Utah', VT:'Vermont', VA:'Virginia', WA:'Washington',
  WV:'West Virginia', WI:'Wisconsin', WY:'Wyoming', DC:'Washington D.C.',
  PR:'Puerto Rico', VI:'Virgin Islands', GU:'Guam'
};

// ── App state ──
let currentMetric = 'utilization_rate';
let lockedPhaCode = null;
let timeSeriesData = {};   // { pha_code: [{year, ...metrics}] }
let trendChart = null;

// ── Map init ──
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/light-v11',
  center: [-98, 39],
  zoom: 3.5,
  minZoom: 2
});

map.addControl(new mapboxgl.NavigationControl(), 'top-right');

// ── Load data ──
map.on('load', () => {

  // Load time series JSON for charts
  fetch('data/pha_master_timeseries.json')
    .then(r => r.json())
    .then(data => {
      timeSeriesData = data;
      console.log('Time series loaded for', Object.keys(timeSeriesData).length, 'PHAs');
    });

  // Load GeoJSON and add to map
  fetch('data/pha_master_latest.geojson')
    .then(r => r.json())
    .then(geojson => {
      // Sort largest → smallest so smaller PHAs render on top and are clickable
      geojson.features.sort((a, b) => bboxArea(b.geometry) - bboxArea(a.geometry));

      map.addSource('pha', {
        type: 'geojson',
        data: geojson,
        generateId: true
      });

      // Fill layer
      map.addLayer({
        id: 'pha-fill',
        type: 'fill',
        source: 'pha',
        paint: buildFillPaint('utilization_rate')
      });

      // Hover highlight
      map.addLayer({
        id: 'pha-hover',
        type: 'line',
        source: 'pha',
        paint: {
          'line-color': '#ffffff',
          'line-width': ['case', ['boolean', ['feature-state', 'hovered'], false], 2, 0],
          'line-opacity': 0.9
        }
      });

      // Selected PHA outline
      map.addLayer({
        id: 'pha-selected',
        type: 'line',
        source: 'pha',
        paint: {
          'line-color': '#5b8dee',
          'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.5, 0]
        }
      });

      setupInteractions();
      updateLegend();
    })
    .catch(err => {
      console.error('GeoJSON load failed:', err);
      showDataMissingWarning();
    });
});

// ── Build fill paint expression ──
function buildFillPaint(metricKey) {
  const m = METRICS[metricKey];
  const s = m.stops;
  return {
    'fill-color': [
      'interpolate', ['linear'],
      ['coalesce', ['get', metricKey], s[0]],
      s[0], s[1],
      s[2], s[3],
      s[4], s[5]
    ],
    'fill-opacity': [
      'case',
      ['==', ['get', metricKey], null], 0,
      0.85
    ]
  };
}

// ── Metric selector ──
document.getElementById('metric-select').addEventListener('change', e => {
  currentMetric = e.target.value;
  const paint = buildFillPaint(currentMetric);
  map.setPaintProperty('pha-fill', 'fill-color',   paint['fill-color']);
  map.setPaintProperty('pha-fill', 'fill-opacity',  paint['fill-opacity']);
  updateLegend();

  // If PHA locked, refresh chart + highlight
  if (lockedPhaCode) {
    const features = map.querySourceFeatures('pha');
    const feat = features.find(f => getPhaCode(f) === lockedPhaCode);
    if (feat) {
      updateSidebar(feat, true);
      renderChart(lockedPhaCode);
    }
  }
});

// ── Hover tooltip popup ──
const hoverPopup = new mapboxgl.Popup({
  closeButton: false,
  closeOnClick: false,
  className: 'pha-hover-popup',
  maxWidth: '260px',
  offset: 12
});

function buildPopupHTML(props) {
  const name = props.pha_name || props.AGENCY_NAME || props.NAME || 'Unknown PHA';
  const code = String(props.PARTICIPAN || props.pha_code || props.PHA_CODE || '').trim().toUpperCase();
  const stateAb = code.slice(0, 2).toUpperCase();
  const stateName = STATE_NAMES[stateAb] || stateAb;
  const totalVouchers = (props.total_vouchers !== null && props.total_vouchers !== undefined)
    ? Number(props.total_vouchers).toLocaleString()
    : 'N/A';
  return `
    <div class="pha-popup-name">${name}</div>
    <div class="pha-popup-row"><span class="pha-popup-label">State</span><span class="pha-popup-val">${stateName}</span></div>
    <div class="pha-popup-row"><span class="pha-popup-label">Total Vouchers</span><span class="pha-popup-val">${totalVouchers}</span></div>
  `;
}

// ── Interactions ──
let hoveredId = null;

function setupInteractions() {

  // Hover
  map.on('mousemove', 'pha-fill', e => {
    if (e.features.length === 0) return;
    map.getCanvas().style.cursor = 'pointer';

    const feat = e.features[0];

    if (hoveredId !== null && hoveredId !== feat.id) {
      map.setFeatureState({ source: 'pha', id: hoveredId }, { hovered: false });
    }
    hoveredId = feat.id;
    map.setFeatureState({ source: 'pha', id: hoveredId }, { hovered: true });

    // Show hover tooltip
    hoverPopup
      .setLngLat(e.lngLat)
      .setHTML(buildPopupHTML(feat.properties))
      .addTo(map);

    // Only update sidebar if no PHA is locked
    if (!lockedPhaCode) {
      updateSidebar(feat, false);
    }
  });

  map.on('mouseleave', 'pha-fill', () => {
    map.getCanvas().style.cursor = '';
    if (hoveredId !== null) {
      map.setFeatureState({ source: 'pha', id: hoveredId }, { hovered: false });
      hoveredId = null;
    }
    hoverPopup.remove();
    if (!lockedPhaCode) {
      showDefaultPanel();
    }
  });

  // Click — lock/unlock selection
  map.on('click', 'pha-fill', e => {
    if (e.features.length === 0) return;
    const feat = e.features[0];
    const code = getPhaCode(feat);

    // If same PHA clicked again → unlock
    if (lockedPhaCode === code) {
      clearSelection();
      return;
    }

    // Lock new PHA
    setSelection(feat);
  });

  // Click on empty area → clear
  map.on('click', e => {
    const features = map.queryRenderedFeatures(e.point, { layers: ['pha-fill'] });
    if (features.length === 0 && lockedPhaCode) {
      clearSelection();
    }
  });
}

// ── Selection management ──
let selectedFeatureId = null;

function setSelection(feat) {
  // Clear old selection
  if (selectedFeatureId !== null) {
    map.setFeatureState({ source: 'pha', id: selectedFeatureId }, { selected: false });
  }
  selectedFeatureId = feat.id;
  lockedPhaCode = getPhaCode(feat);
  map.setFeatureState({ source: 'pha', id: selectedFeatureId }, { selected: true });

  updateSidebar(feat, true);
  renderChart(lockedPhaCode);

  // Zoom to PHA
  const bounds = getBounds(feat.geometry);
  if (bounds) {
    map.fitBounds(bounds, { padding: 80, maxZoom: 10, duration: 800 });
  }
}

function clearSelection() {
  if (selectedFeatureId !== null) {
    map.setFeatureState({ source: 'pha', id: selectedFeatureId }, { selected: false });
  }
  selectedFeatureId = null;
  lockedPhaCode = null;
  showDefaultPanel();
  hideChartPanel();
}

// ── Sidebar update ──
function updateSidebar(feat, isLocked) {
  const props = feat.properties;
  const name = props.pha_name || props.AGENCY_NAME || props.NAME || 'Unknown PHA';
  const code = getPhaCode(feat);

  document.getElementById('info-default').classList.add('hidden');
  document.getElementById('info-content').classList.remove('hidden');
  document.getElementById('info-pha-name').textContent = name;
  document.getElementById('info-pha-code').textContent = code + (isLocked ? '  ·  Locked' : '');

  const grid = document.getElementById('info-metrics');
  grid.innerHTML = '';

  Object.entries(METRICS).forEach(([key, meta]) => {
    const val = props[key];
    const card = document.createElement('div');
    card.className = 'metric-card' + (key === currentMetric ? ' highlighted' : '');

    const valEl = document.createElement('div');
    valEl.className = 'metric-value';

    if (val === null || val === undefined || isNaN(val)) {
      valEl.textContent = 'N/A';
      valEl.classList.add('na');
    } else {
      valEl.textContent = meta.format(parseFloat(val));
    }

    card.innerHTML = `<div class="metric-label">${meta.shortLabel}</div>`;
    card.appendChild(valEl);
    grid.appendChild(card);
  });
}

function showDefaultPanel() {
  document.getElementById('info-default').classList.remove('hidden');
  document.getElementById('info-content').classList.add('hidden');
}

// ── Time-series chart ──
function renderChart(phaCode) {
  const records = timeSeriesData[phaCode];
  const panel = document.getElementById('chart-panel');
  panel.classList.remove('hidden');

  const meta = METRICS[currentMetric];
  document.getElementById('chart-pha-label').textContent = phaCode;
  document.getElementById('chart-metric-label').textContent = meta.label;

  const years = records ? records.map(r => r.year) : [];
  const values = records ? records.map(r => {
    const v = r[currentMetric];
    return (v !== null && v !== undefined && !isNaN(v)) ? parseFloat(v) : null;
  }) : [];

  if (trendChart) trendChart.destroy();

  const ctx = document.getElementById('trend-chart').getContext('2d');
  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: years,
      datasets: [{
        label: meta.label,
        data: values,
        borderColor: '#3a5ec8',
        backgroundColor: 'rgba(58, 94, 200, 0.1)',
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: '#3a5ec8',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        tension: 0.3,
        spanGaps: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(255, 255, 255, 0.97)',
          borderColor: '#d0d5e8',
          borderWidth: 1,
          titleColor: '#7a86a8',
          bodyColor: '#1a1d2e',
          callbacks: {
            label: ctx => meta.format(ctx.raw)
          }
        }
      },
      scales: {
        x: {
          grid: { color: '#e8eaf2' },
          ticks: { color: '#7a86a8', font: { size: 11 } }
        },
        y: {
          grid: { color: '#e8eaf2' },
          ticks: {
            color: '#7a86a8',
            font: { size: 11 },
            callback: v => meta.format(v)
          }
        }
      }
    }
  });
}

function hideChartPanel() {
  document.getElementById('chart-panel').classList.add('hidden');
  if (trendChart) { trendChart.destroy(); trendChart = null; }
}

// ── Legend update ──
function updateLegend() {
  const meta = METRICS[currentMetric];
  document.getElementById('legend-title').textContent = meta.label;
  document.getElementById('legend-gradient').style.background = meta.gradient;
  const labels = meta.legendStops.map(v => meta.format(v));
  document.getElementById('legend-min').textContent = labels[0];
  document.getElementById('legend-mid').textContent = labels[1];
  document.getElementById('legend-max').textContent = labels[2];
}

// ── Download ──
document.getElementById('download-btn').addEventListener('click', () => {
  const fields = {
    effective_under_lease: document.getElementById('dl-effective').checked,
    utilization_rate:      document.getElementById('dl-utilization').checked,
    success_rate:          document.getElementById('dl-success').checked,
    cost_per_voucher:      document.getElementById('dl-cost').checked,
    port_in_rate:          document.getElementById('dl-portin').checked
  };

  const selectedFields = Object.entries(fields).filter(([, v]) => v).map(([k]) => k);
  const rows = [];

  // Flatten time series data
  Object.entries(timeSeriesData).forEach(([code, records]) => {
    records.forEach(row => {
      const out = { pha_code: code, pha_name: row.pha_name || '', year: row.year };
      selectedFields.forEach(f => { out[f] = row[f] ?? ''; });
      rows.push(out);
    });
  });

  if (rows.length === 0) {
    alert('No data loaded yet. Please wait for the data to finish loading.');
    return;
  }

  const headers = ['pha_code', 'pha_name', 'year', ...selectedFields];
  const csvLines = [headers.join(',')];
  rows.forEach(r => csvLines.push(headers.map(h => r[h] ?? '').join(',')));
  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'hcv_pha_performance.csv';
  a.click();
  URL.revokeObjectURL(url);
});

// ── Helpers ──
function getPhaCode(feat) {
  const p = feat.properties;
  return String(p.PARTICIPAN || p.pha_code || p.PHA_CODE || '').trim().toUpperCase();
}

function getBounds(geometry) {
  try {
    const coords = flattenCoords(geometry);
    if (coords.length === 0) return null;
    const lngs = coords.map(c => c[0]);
    const lats = coords.map(c => c[1]);
    return [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)]
    ];
  } catch { return null; }
}

function bboxArea(geom) {
  const coords = flattenCoords(geom);
  if (!coords.length) return 0;
  const lngs = coords.map(c => c[0]);
  const lats  = coords.map(c => c[1]);
  return (Math.max(...lngs) - Math.min(...lngs)) * (Math.max(...lats) - Math.min(...lats));
}

function flattenCoords(geom) {
  if (!geom) return [];
  if (geom.type === 'Point') return [geom.coordinates];
  if (geom.type === 'LineString') return geom.coordinates;
  if (geom.type === 'Polygon') return geom.coordinates.flat();
  if (geom.type === 'MultiPolygon') return geom.coordinates.flat(2);
  if (geom.type === 'MultiLineString') return geom.coordinates.flat();
  return [];
}

function showDataMissingWarning() {
  const el = document.createElement('div');
  el.style.cssText = `
    position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
    background:#ffffff; border:1px solid #e31a1c;
    padding:24px 32px; border-radius:10px; text-align:center;
    color:#1a1d2e; font-size:13px; max-width:360px; z-index:200;
    box-shadow:0 4px 20px rgba(0,0,0,0.12);
  `;
  el.innerHTML = `
    <div style="font-size:24px;margin-bottom:12px">&#9888;</div>
    <strong>GeoJSON not found</strong><br><br>
    Please run the build script first to generate:<br>
    <code style="color:#3a5ec8">data/pha_master_latest.geojson</code><br>
    <code style="color:#3a5ec8">data/pha_master_timeseries.json</code>
  `;
  document.getElementById('map-wrap').appendChild(el);
}

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


