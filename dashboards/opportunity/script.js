mapboxgl.accessToken = 'pk.eyJ1Ijoib2luZHJpemEiLCJhIjoiY21sbzllaWcxMTI2YzNkb242NTJnbng1aCJ9.771NiwRe4c4CqePpL1LdEA';

window.__OPPORTUNITY_DASHBOARD__ = window.__OPPORTUNITY_DASHBOARD__ || {
  summary: null,
  cbsa: null
};

const NATIONAL_BOUNDS = [[-168, 15], [-64, 72]];
const SOURCE_FIELDS = [
  'hcv_coi_idx',
  'renter_coi_idx',
  'hcv_coi_edu',
  'renter_coi_edu',
  'hcv_coi_health_env',
  'renter_coi_health_env',
  'hcv_coi_eco',
  'renter_coi_eco',
  'gap_coi_idx',
  'gap_coi_edu',
  'gap_coi_health_env',
  'gap_coi_eco'
];

const METRICS = {
  gap_coi_idx: {
    label: 'Overall Opportunity Gap',
    shortLabel: 'Overall Gap',
    hcvField: 'hcv_coi_idx',
    renterField: 'renter_coi_idx',
    hcvLabel: 'HCV-Weighted COI',
    renterLabel: 'Renter-Weighted COI',
    format: formatGap,
    sourceFormat: formatScore,
    stops: [-20, '#8f1239', 0, '#f8fafc', 20, '#1d4ed8'],
    legendStops: [-20, 0, 20],
    gradient: 'linear-gradient(to right, #8f1239, #f8fafc, #1d4ed8)',
    description: 'Difference between the HCV-weighted and renter-weighted overall Child Opportunity Index'
  },
  gap_coi_edu: {
    label: 'Education Opportunity Gap',
    shortLabel: 'Education Gap',
    hcvField: 'hcv_coi_edu',
    renterField: 'renter_coi_edu',
    hcvLabel: 'HCV-Weighted Education',
    renterLabel: 'Renter-Weighted Education',
    format: formatGap,
    sourceFormat: formatScore,
    stops: [-20, '#9f1239', 0, '#f8fafc', 20, '#1d4ed8'],
    legendStops: [-20, 0, 20],
    gradient: 'linear-gradient(to right, #9f1239, #f8fafc, #1d4ed8)',
    description: 'Difference between the HCV-weighted and renter-weighted education opportunity scores'
  },
  gap_coi_health_env: {
    label: 'Health & Environment Gap',
    shortLabel: 'Health Gap',
    hcvField: 'hcv_coi_health_env',
    renterField: 'renter_coi_health_env',
    hcvLabel: 'HCV-Weighted Health',
    renterLabel: 'Renter-Weighted Health',
    format: formatGap,
    sourceFormat: formatScore,
    stops: [-20, '#9a3412', 0, '#f8fafc', 20, '#166534'],
    legendStops: [-20, 0, 20],
    gradient: 'linear-gradient(to right, #9a3412, #f8fafc, #166534)',
    description: 'Difference between the HCV-weighted and renter-weighted health and environment scores'
  },
  gap_coi_eco: {
    label: 'Social & Economic Gap',
    shortLabel: 'Soc-Econ Gap',
    hcvField: 'hcv_coi_eco',
    renterField: 'renter_coi_eco',
    hcvLabel: 'HCV-Weighted Soc-Econ',
    renterLabel: 'Renter-Weighted Soc-Econ',
    format: formatGap,
    sourceFormat: formatScore,
    stops: [-20, '#7f1d1d', 0, '#f8fafc', 20, '#0f766e'],
    legendStops: [-20, 0, 20],
    gradient: 'linear-gradient(to right, #7f1d1d, #f8fafc, #0f766e)',
    description: 'Difference between the HCV-weighted and renter-weighted social and economic opportunity scores'
  }
};

let currentMetric = 'gap_coi_idx';
let summaryData = null;
let cbsaGeojson = null;
let comparisonChart = null;
let hoveredId = null;
let selectedFeatureId = null;
let lockedCbsaCode = null;

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/light-v11',
  center: [-98, 39],
  zoom: 3.1,
  minZoom: 2.5,
  renderWorldCopies: false
});

map.addControl(new mapboxgl.NavigationControl(), 'top-right');

map.on('load', async () => {
  try {
    summaryData = await loadSummaryData();
    cbsaGeojson = await loadCbsaData();

    bindControls();
    addCbsaLayers(cbsaGeojson);
    updateLegend();
    map.fitBounds(NATIONAL_BOUNDS, { padding: 30, duration: 0 });
    hideStatus();
  } catch (err) {
    console.error(err);
    showStatus('Metropolitan statistical area opportunity gap data could not be loaded. Run scripts/build_opportunity_dashboard_data.R first.');
  }
});

function bindControls() {
  document.getElementById('metric-select').addEventListener('change', event => {
    currentMetric = event.target.value;
    updateLegend();

    if (map.getLayer('cbsa-fill')) {
      map.setPaintProperty('cbsa-fill', 'fill-color', buildFillPaint(currentMetric)['fill-color']);
    }

    const selected = getSelectedFeature();
    if (selected) {
      updateSidebar(selected, true);
      renderComparisonChart(selected.properties);
    }
  });

  document.getElementById('download-btn').addEventListener('click', exportCbsaCsv);
}

function addCbsaLayers(geojson) {
  map.addSource('cbsa', {
    type: 'geojson',
    data: geojson,
    generateId: true
  });

  map.addLayer({
    id: 'cbsa-fill',
    type: 'fill',
    source: 'cbsa',
    paint: buildFillPaint(currentMetric)
  });

  map.addLayer({
    id: 'cbsa-hover',
    type: 'line',
    source: 'cbsa',
    paint: {
      'line-color': '#ffffff',
      'line-width': ['case', ['boolean', ['feature-state', 'hovered'], false], 1.4, 0],
      'line-opacity': 0.95
    }
  });

  map.addLayer({
    id: 'cbsa-selected',
    type: 'line',
    source: 'cbsa',
    paint: {
      'line-color': '#2563eb',
      'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.1, 0]
    }
  });

  setupInteractions();
}

function setupInteractions() {
  map.on('mousemove', 'cbsa-fill', event => {
    if (!event.features.length) return;

    map.getCanvas().style.cursor = 'pointer';
    const feature = event.features[0];

    if (hoveredId !== null && hoveredId !== feature.id) {
      map.setFeatureState({ source: 'cbsa', id: hoveredId }, { hovered: false });
    }

    hoveredId = feature.id;
    map.setFeatureState({ source: 'cbsa', id: hoveredId }, { hovered: true });

    if (!lockedCbsaCode) {
      updateSidebar(feature, false);
    }
  });

  map.on('mouseleave', 'cbsa-fill', () => {
    map.getCanvas().style.cursor = '';

    if (hoveredId !== null) {
      map.setFeatureState({ source: 'cbsa', id: hoveredId }, { hovered: false });
      hoveredId = null;
    }

    if (!lockedCbsaCode) {
      showDefaultPanel();
    }
  });

  map.on('click', 'cbsa-fill', event => {
    if (!event.features.length) return;

    const feature = event.features[0];
    const cbsaCode = feature.properties.cbsa_code;

    if (lockedCbsaCode === cbsaCode) {
      clearSelection();
      return;
    }

    setSelection(feature);
  });

  map.on('click', event => {
    const features = map.queryRenderedFeatures(event.point, { layers: ['cbsa-fill'] });
    if (!features.length && lockedCbsaCode) {
      clearSelection();
    }
  });
}

function setSelection(feature) {
  if (selectedFeatureId !== null) {
    map.setFeatureState({ source: 'cbsa', id: selectedFeatureId }, { selected: false });
  }

  selectedFeatureId = feature.id;
  lockedCbsaCode = feature.properties.cbsa_code;
  map.setFeatureState({ source: 'cbsa', id: selectedFeatureId }, { selected: true });

  updateSidebar(feature, true);
  renderComparisonChart(feature.properties);

  const bounds = getBounds(feature.geometry);
  if (bounds) {
    map.fitBounds(bounds, { padding: 70, maxZoom: 7.5, duration: 700 });
  }
}

function clearSelection(silent = false) {
  if (selectedFeatureId !== null && map.getSource('cbsa')) {
    map.setFeatureState({ source: 'cbsa', id: selectedFeatureId }, { selected: false });
  }

  selectedFeatureId = null;
  lockedCbsaCode = null;

  if (!silent) {
    showDefaultPanel();
    hideChartPanel();
    map.fitBounds(NATIONAL_BOUNDS, { padding: 30, duration: 500 });
  }
}

function updateSidebar(feature, isLocked) {
  const props = feature.properties || {};
  const meta = METRICS[currentMetric];
  const national = summaryData?.national || {};

  document.getElementById('info-default').classList.add('hidden');
  document.getElementById('info-content').classList.remove('hidden');
  document.getElementById('info-tract-name').textContent = props.cbsa_name_full || props.cbsa_name || 'Selected Metropolitan Statistical Area';
  document.getElementById('info-tract-code').textContent = `${props.cbsa_code || 'Unknown Metropolitan Statistical Area'}${isLocked ? '  ·  Locked' : ''}`;
  document.getElementById('info-context').textContent = buildContextLine(props);

  const grid = document.getElementById('info-metrics');
  grid.innerHTML = '';

  const gapValue = toNumber(props[currentMetric]);
  const hcvValue = toNumber(props[meta.hcvField]);
  const renterValue = toNumber(props[meta.renterField]);
  const nationalGap = toNumber(national[currentMetric]);

  const explainer = document.createElement('div');
  explainer.className = 'metric-explainer';

  const summary = document.createElement('div');
  summary.className = 'gap-summary';
  if (gapValue !== null) {
    summary.classList.add(gapValue < 0 ? 'negative' : gapValue > 0 ? 'positive' : 'neutral');
  }

  const summaryLabel = document.createElement('div');
  summaryLabel.className = 'metric-label';
  summaryLabel.textContent = 'Selected metro gap';

  const summaryValue = document.createElement('div');
  summaryValue.className = 'gap-value' + (gapValue === null ? ' na' : '');
  summaryValue.textContent = gapValue === null ? 'N/A' : meta.format(gapValue);

  const formula = document.createElement('div');
  formula.className = 'gap-formula';
  formula.textContent = 'Gap = HCV-weighted score - renter-weighted score';

  const interpretation = document.createElement('div');
  interpretation.className = 'gap-interpretation';
  interpretation.textContent = describeGap(gapValue);

  summary.appendChild(summaryLabel);
  summary.appendChild(summaryValue);
  summary.appendChild(formula);
  summary.appendChild(interpretation);
  explainer.appendChild(summary);

  const comparison = document.createElement('div');
  comparison.className = 'score-comparison';
  appendScoreRow(comparison, meta.hcvLabel, hcvValue, '#2563eb');
  appendScoreRow(comparison, meta.renterLabel, renterValue, '#64748b');
  explainer.appendChild(comparison);

  const domains = document.createElement('div');
  domains.className = 'domain-breakdown';

  const domainTitle = document.createElement('div');
  domainTitle.className = 'domain-title';
  domainTitle.textContent = 'COI domain gaps';
  domains.appendChild(domainTitle);

  [
    { label: 'Education', gap: 'gap_coi_edu', hcv: 'hcv_coi_edu', renter: 'renter_coi_edu' },
    { label: 'Health & Environment', gap: 'gap_coi_health_env', hcv: 'hcv_coi_health_env', renter: 'renter_coi_health_env' },
    { label: 'Social & Economic', gap: 'gap_coi_eco', hcv: 'hcv_coi_eco', renter: 'renter_coi_eco' }
  ].forEach(domain => {
    appendDomainRow(
      domains,
      domain.label,
      toNumber(props[domain.gap]),
      toNumber(props[domain.hcv]),
      toNumber(props[domain.renter])
    );
  });

  explainer.appendChild(domains);

  const reference = document.createElement('div');
  reference.className = 'national-reference';

  const refLabel = document.createElement('span');
  refLabel.textContent = 'U.S. average gap';

  const refValue = document.createElement('strong');
  refValue.textContent = nationalGap === null ? 'N/A' : meta.format(nationalGap);

  reference.appendChild(refLabel);
  reference.appendChild(refValue);

  if (gapValue !== null && nationalGap !== null) {
    const refNote = document.createElement('em');
    refNote.textContent = describeNationalComparison(gapValue, nationalGap);
    reference.appendChild(refNote);
  }

  explainer.appendChild(reference);
  grid.appendChild(explainer);

  renderFlags(props);
}

function appendScoreRow(container, labelText, value, color) {
  const row = document.createElement('div');
  row.className = 'score-row';

  const label = document.createElement('div');
  label.className = 'score-row-label';
  label.textContent = labelText;

  const valueLabel = document.createElement('div');
  valueLabel.className = 'score-row-value' + (value === null ? ' na' : '');
  valueLabel.textContent = value === null ? 'N/A' : formatScore(value);

  const track = document.createElement('div');
  track.className = 'score-track';

  const fill = document.createElement('div');
  fill.className = 'score-fill';
  fill.style.background = color;
  fill.style.width = value === null ? '0%' : `${Math.max(0, Math.min(100, value))}%`;

  track.appendChild(fill);
  row.appendChild(label);
  row.appendChild(valueLabel);
  row.appendChild(track);
  container.appendChild(row);
}

function appendDomainRow(container, labelText, gapValue, hcvValue, renterValue) {
  const row = document.createElement('div');
  row.className = 'domain-row';

  const label = document.createElement('div');
  label.className = 'domain-label';
  label.textContent = labelText;

  const gap = document.createElement('div');
  gap.className = 'domain-gap' + (gapValue === null ? ' na' : gapValue < 0 ? ' negative' : gapValue > 0 ? ' positive' : ' neutral');
  gap.textContent = gapValue === null ? 'N/A' : formatGap(gapValue);

  const detail = document.createElement('div');
  detail.className = 'domain-detail';
  detail.textContent = hcvValue === null || renterValue === null
    ? 'HCV / renter scores unavailable'
    : `HCV ${formatScore(hcvValue)} · Renters ${formatScore(renterValue)}`;

  row.appendChild(label);
  row.appendChild(gap);
  row.appendChild(detail);
  container.appendChild(row);
}

function describeGap(value) {
  if (value === null) {
    return 'No gap value is available for this metropolitan area.';
  }

  const magnitude = Math.abs(value).toFixed(1);
  if (value < -0.05) {
    return `HCV households are exposed to ${magnitude} fewer opportunity points than renters overall.`;
  }
  if (value > 0.05) {
    return `HCV households are exposed to ${magnitude} more opportunity points than renters overall.`;
  }
  return 'HCV households and renters have nearly equal opportunity exposure.';
}

function describeNationalComparison(value, nationalValue) {
  const difference = value - nationalValue;
  const magnitude = Math.abs(difference).toFixed(1);

  if (Math.abs(difference) < 0.05) {
    return 'Similar to the national average.';
  }

  return difference < 0
    ? `${magnitude} points more negative than the national average.`
    : `${magnitude} points more positive than the national average.`;
}

function buildContextLine(props) {
  const parts = [];

  if (props.cbsa_type) {
    parts.push(props.cbsa_type);
  } else if (toNumber(props.is_metropolitan) === 1) {
    parts.push('Metro Area');
  }

  const gapValue = toNumber(props[currentMetric]);
  if (gapValue !== null) {
    parts.push(`Current gap: ${METRICS[currentMetric].format(gapValue)}`);
  }

  return parts.join(' · ');
}

function renderFlags(props) {
  const pills = document.getElementById('flag-pills');
  pills.innerHTML = '';

  const typePill = document.createElement('div');
  typePill.className = 'flag-pill active';
  typePill.textContent = 'Metropolitan';
  pills.appendChild(typePill);
}

function showDefaultPanel() {
  document.getElementById('info-default').classList.remove('hidden');
  document.getElementById('info-content').classList.add('hidden');
}

function renderComparisonChart(props) {
  const panel = document.getElementById('chart-panel');
  panel.classList.remove('hidden');

  const meta = METRICS[currentMetric];
  const national = summaryData?.national || {};

  document.getElementById('chart-tract-label').textContent = props.cbsa_name || props.cbsa_code || 'Selected Metropolitan Statistical Area';
  document.getElementById('chart-metric-label').textContent = meta.label;

  if (comparisonChart) comparisonChart.destroy();

  const ctx = document.getElementById('comparison-chart').getContext('2d');
  comparisonChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Selected Metropolitan Area', 'U.S. Average'],
      datasets: [
        {
          label: meta.hcvLabel,
          data: [toNumber(props[meta.hcvField]), toNumber(national[meta.hcvField])],
          backgroundColor: '#2563eb',
          borderColor: '#2563eb',
          borderWidth: 1.5,
          borderRadius: 6
        },
        {
          label: meta.renterLabel,
          data: [toNumber(props[meta.renterField]), toNumber(national[meta.renterField])],
          backgroundColor: '#94a3b8cc',
          borderColor: '#94a3b8',
          borderWidth: 1.5,
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#374151',
            boxWidth: 10,
            usePointStyle: true,
            pointStyle: 'rectRounded'
          }
        },
        tooltip: {
          backgroundColor: 'rgba(255, 255, 255, 0.96)',
          borderColor: '#e5e7eb',
          borderWidth: 1,
          titleColor: '#6b7280',
          bodyColor: '#111827',
          callbacks: {
            label: ctx => {
              if (ctx.raw === null || ctx.raw === undefined) return `${ctx.dataset.label}: No data`;
              return `${ctx.dataset.label}: ${meta.sourceFormat(ctx.raw)}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#6b7280', font: { size: 11 } }
        },
        y: {
          suggestedMin: 0,
          suggestedMax: 100,
          grid: { color: '#e5e7eb' },
          ticks: {
            color: '#6b7280',
            font: { size: 11 },
            callback: value => formatScore(value)
          }
        }
      }
    }
  });
}

function hideChartPanel() {
  document.getElementById('chart-panel').classList.add('hidden');
  if (comparisonChart) {
    comparisonChart.destroy();
    comparisonChart = null;
  }
}

function updateLegend() {
  const meta = METRICS[currentMetric];
  document.getElementById('legend-title').textContent = meta.label;
  document.getElementById('legend-gradient').style.background = meta.gradient;
  document.getElementById('legend-min').textContent = meta.format(meta.legendStops[0]);
  document.getElementById('legend-mid').textContent = meta.format(meta.legendStops[1]);
  document.getElementById('legend-max').textContent = meta.format(meta.legendStops[2]);
}

function buildFillPaint(metricKey) {
  const metric = METRICS[metricKey];
  const stops = metric.stops;

  return {
    'fill-color': [
      'case',
      ['==', ['get', metricKey], null],
      '#d1d5db',
      ['==', ['typeof', ['get', metricKey]], 'string'],
      '#d1d5db',
      [
        'interpolate',
        ['linear'],
        ['get', metricKey],
        stops[0], stops[1],
        stops[2], stops[3],
        stops[4], stops[5]
      ]
    ],
    'fill-opacity': 0.78
  };
}

function exportCbsaCsv() {
  if (!cbsaGeojson) {
    alert('Metropolitan statistical area data is still loading. Please try again in a moment.');
    return;
  }

  const rows = cbsaGeojson.features.map(feature => {
    const props = feature.properties || {};
    const output = {
      cbsa_code: props.cbsa_code || '',
      cbsa_name: props.cbsa_name || '',
      cbsa_name_full: props.cbsa_name_full || '',
      cbsa_type: props.cbsa_type || ''
    };

    SOURCE_FIELDS.forEach(field => {
      output[field] = props[field] ?? '';
    });

    return output;
  });

  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'metropolitan_statistical_area_opportunity_gap.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function getSelectedFeature() {
  if (!lockedCbsaCode || !map.getSource('cbsa')) return null;

  const features = map.querySourceFeatures('cbsa');
  return features.find(feature => feature.properties.cbsa_code === lockedCbsaCode) || null;
}

function getBounds(target) {
  try {
    const coords = flattenCoords(target);
    if (!coords.length) return null;
    const lngs = coords.map(coord => coord[0]);
    const lats = coords.map(coord => coord[1]);
    return [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)]
    ];
  } catch {
    return null;
  }
}

function flattenCoords(target) {
  if (!target) return [];

  if (target.type === 'FeatureCollection') {
    return target.features.flatMap(feature => flattenCoords(feature.geometry));
  }

  if (target.type === 'Feature') {
    return flattenCoords(target.geometry);
  }

  if (target.type === 'Point') return [target.coordinates];
  if (target.type === 'LineString') return target.coordinates;
  if (target.type === 'Polygon') return target.coordinates.flat();
  if (target.type === 'MultiPolygon') return target.coordinates.flat(2);
  if (target.type === 'MultiLineString') return target.coordinates.flat();

  return [];
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatScore(value) {
  return Number(value).toFixed(1);
}

function formatGap(value) {
  const number = Number(value);
  const prefix = number > 0 ? '+' : '';
  return `${prefix}${number.toFixed(1)}`;
}

function showStatus(message) {
  const status = document.getElementById('map-status');
  status.textContent = message;
  status.classList.remove('hidden');
}

function hideStatus() {
  document.getElementById('map-status').classList.add('hidden');
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.status}`);
  }

  return response.json();
}

async function loadSummaryData() {
  if (window.__OPPORTUNITY_DASHBOARD__?.summary) {
    return window.__OPPORTUNITY_DASHBOARD__.summary;
  }

  try {
    return await fetchJson('data/summary.json');
  } catch (error) {
    await loadScript('data/summary.js');
    if (window.__OPPORTUNITY_DASHBOARD__?.summary) {
      return window.__OPPORTUNITY_DASHBOARD__.summary;
    }
    throw error;
  }
}

async function loadCbsaData() {
  if (window.__OPPORTUNITY_DASHBOARD__?.cbsa) {
    return window.__OPPORTUNITY_DASHBOARD__.cbsa;
  }

  try {
    return await fetchJson('data/cbsa.geojson');
  } catch (error) {
    await loadScript('data/cbsa.js');
    if (window.__OPPORTUNITY_DASHBOARD__?.cbsa) {
      return window.__OPPORTUNITY_DASHBOARD__.cbsa;
    }
    throw error;
  }
}

function loadScript(path) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-opportunity-src="${path}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${path}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = path;
    script.async = true;
    script.dataset.opportunitySrc = path;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${path}`)), { once: true });
    document.head.appendChild(script);
  });
}
