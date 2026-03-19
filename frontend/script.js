// ─── CONFIG ───────────────────────────────────────────────────────────
// Placeholder URL for Azure Function; replace with your actual function URL if deployed
const AZURE_FUNCTION_URL = "https://YOUR_FUNCTION_APP.azurewebsites.net/api/diet-analysis";

// ─── EMBEDDED FALLBACK DATA (from data_analysis.py on All_Diets.csv) ──
const FALLBACK = {
  metadata: {
    function_name: "diet-analysis-fn",
    total_records: 7806,
    diet_types: ["dash","keto","mediterranean","paleo","vegan"],
    execution_time_ms: 0,
    dataset: "All_Diets.csv (embedded)"
  },
  avg_macros: [
    {"Diet_type":"dash",          "Protein(g)":69.3,  "Carbs(g)":160.5, "Fat(g)":101.2},
    {"Diet_type":"keto",          "Protein(g)":101.3, "Carbs(g)":58.0,  "Fat(g)":153.1},
    {"Diet_type":"mediterranean", "Protein(g)":101.1, "Carbs(g)":152.9, "Fat(g)":101.4},
    {"Diet_type":"paleo",         "Protein(g)":88.7,  "Carbs(g)":129.6, "Fat(g)":135.7},
    {"Diet_type":"vegan",         "Protein(g)":56.2,  "Carbs(g)":254.0, "Fat(g)":103.3}
  ],
  protein_carb_ratio: [
    {"Diet_type":"dash",          "Protein_to_Carbs_ratio":1.49},
    {"Diet_type":"keto",          "Protein_to_Carbs_ratio":4.12},
    {"Diet_type":"mediterranean", "Protein_to_Carbs_ratio":1.78},
    {"Diet_type":"paleo",         "Protein_to_Carbs_ratio":2.06},
    {"Diet_type":"vegan",         "Protein_to_Carbs_ratio":0.33}
  ],
  recipe_counts: [
    {"Diet_type":"dash","recipe_count":1745},
    {"Diet_type":"keto","recipe_count":1512},
    {"Diet_type":"mediterranean","recipe_count":1753},
    {"Diet_type":"paleo","recipe_count":1274},
    {"Diet_type":"vegan","recipe_count":1522}
  ],
  top_protein_recipes: [
    {"Diet_type":"paleo",         "Recipe_name":"Swiss Paleo's Homemade Italian & Chorizo Sausage","Protein(g)":1273.6,"Cuisine_type":"italian"},
    {"Diet_type":"dash",          "Recipe_name":"Salmon Mousse","Protein(g)":1239.5,"Cuisine_type":"nordic"},
    {"Diet_type":"dash",          "Recipe_name":"Homemade Turkey Alphabet Soup","Protein(g)":1190.4,"Cuisine_type":"american"},
    {"Diet_type":"paleo",         "Recipe_name":"Turkey Soup","Protein(g)":1142.6,"Cuisine_type":"american"},
    {"Diet_type":"keto",          "Recipe_name":"Sara Louise's Keto Smoked Holiday Turkey","Protein(g)":1092.0,"Cuisine_type":"american"},
    {"Diet_type":"dash",          "Recipe_name":"Barbecue Chicken Legs","Protein(g)":1017.2,"Cuisine_type":"mediterranean"},
    {"Diet_type":"mediterranean", "Recipe_name":"Fava Bean Salad with Mountain Ham and Mint","Protein(g)":970.3,"Cuisine_type":"american"},
    {"Diet_type":"keto",          "Recipe_name":"Mayo Free Deviled Eggs (Paleo, Whole30 + Keto)","Protein(g)":767.0,"Cuisine_type":"italian"},
    {"Diet_type":"keto",          "Recipe_name":"Low Carb Beef and Cheddar Cauliflower Bake","Protein(g)":710.8,"Cuisine_type":"british"},
    {"Diet_type":"paleo",         "Recipe_name":"Orange and Five-Spice Roasted Chicken Legs","Protein(g)":677.2,"Cuisine_type":"mediterranean"},
    {"Diet_type":"mediterranean", "Recipe_name":"Poached Salt Cod with Vegetables","Protein(g)":656.6,"Cuisine_type":"mediterranean"},
    {"Diet_type":"mediterranean", "Recipe_name":"Mediterranean Pizza","Protein(g)":628.3,"Cuisine_type":"italian"},
    {"Diet_type":"vegan",         "Recipe_name":"Tangy Teriyaki Salmon","Protein(g)":431.1,"Cuisine_type":"nordic"},
    {"Diet_type":"vegan",         "Recipe_name":"Mini Nut Roasts with Candied Carrots","Protein(g)":421.7,"Cuisine_type":"american"},
    {"Diet_type":"vegan",         "Recipe_name":"Vegan Pinto Bean Chili","Protein(g)":381.6,"Cuisine_type":"american"}
  ]
};

// ─── STATE ────────────────────────────────────────────────────────────
let globalData = null;
let activeFilter = 'all';
let charts = {};

const DIET_COLORS = {
  dash:          '#ff9f47',
  keto:          '#47c8ff',
  mediterranean: '#e8ff47',
  paleo:         '#ff6b6b',
  vegan:         '#7fff9f',
};
const DIET_LABELS = {
  dash:'DASH', keto:'Keto', mediterranean:'Mediterranean', paleo:'Paleo', vegan:'Vegan'
};

// ─── LOAD DATA ────────────────────────────────────────────────────────
async function loadData() {
  showLoader(true);
  let data = null;
  let usedFallback = false;

  // Try Azure Function first
  if (!AZURE_FUNCTION_URL.includes("YOUR_FUNCTION_APP")) {
    try {
      const res = await fetch(AZURE_FUNCTION_URL, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        data = await res.json();
        document.getElementById('data-source').textContent = 'Source: Azure Function (live)';
        setStatus(true, `Azure · ${data.metadata?.execution_time_ms || '—'}ms`);
        document.getElementById('exec-time').textContent = `${data.metadata?.execution_time_ms || '—'} ms`;
      }
    } catch (e) {
      showError(`Azure Function unreachable — showing embedded data. (${e.message})`);
    }
  }

  if (!data) {
    data = FALLBACK;
    usedFallback = true;
    document.getElementById('data-source').textContent = 'Source: Embedded dataset fallback';
    setStatus(false, 'Embedded data');
    document.getElementById('exec-time').textContent = '< 1 ms';
  }

  globalData = data;
  renderAll(data);
  showLoader(false);
}

// ─── FILTER ───────────────────────────────────────────────────────────
function setFilter(diet) {
  activeFilter = diet;
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.diet === diet);
  });
  if (globalData) renderAll(globalData);
}

function filterData(arr, key='Diet_type') {
  if (activeFilter === 'all') return arr;
  return arr.filter(d => d[key] === activeFilter);
}

// ─── RENDER ALL ───────────────────────────────────────────────────────
function renderAll(data) {
  const macros  = filterData(data.avg_macros);
  const ratios  = filterData(data.protein_carb_ratio);
  const counts  = filterData(data.recipe_counts);
  const recipes = filterData(data.top_protein_recipes);

  updateKPIs(macros, counts, data.recipe_counts);
  renderBarChart(macros);
  renderDonutChart(counts);
  renderRatioChart(ratios);
  renderRadarChart(macros);
  renderTable(recipes);
}

// ─── KPIs ─────────────────────────────────────────────────────────────
function updateKPIs(macros, counts, allCounts) {
  const total = counts.reduce((s,d) => s + d.recipe_count, 0);
  const avgP  = avg(macros.map(d => d['Protein(g)']));
  const avgC  = avg(macros.map(d => d['Carbs(g)']));
  const avgF  = avg(macros.map(d => d['Fat(g)']));
  setText('kpi-total',   total.toLocaleString());
  setText('kpi-protein', avgP.toFixed(1));
  setText('kpi-carbs',   avgC.toFixed(1));
  setText('kpi-fat',     avgF.toFixed(1));
  setText('kpi-diets',   macros.length);
}

// ─── CHART 1: GROUPED BAR ─────────────────────────────────────────────
function renderBarChart(macros) {
  const labels   = macros.map(d => DIET_LABELS[d.Diet_type] || d.Diet_type);
  const proteins = macros.map(d => d['Protein(g)']);
  const carbs    = macros.map(d => d['Carbs(g)']);
  const fats     = macros.map(d => d['Fat(g)']);

  destroyChart('barChart');
  const ctx = document.getElementById('barChart').getContext('2d');
  charts.bar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label:'Protein (g)', data:proteins, backgroundColor:'rgba(71,200,255,0.75)', borderColor:'#47c8ff', borderWidth:1.5, borderRadius:4 },
        { label:'Carbs (g)',   data:carbs,    backgroundColor:'rgba(232,255,71,0.75)', borderColor:'#e8ff47', borderWidth:1.5, borderRadius:4 },
        { label:'Fat (g)',     data:fats,     backgroundColor:'rgba(255,107,107,0.75)',borderColor:'#ff6b6b', borderWidth:1.5, borderRadius:4 },
      ]
    },
    options: chartOptions({ title:'', xLabel:'Diet Type', yLabel:'Average (g)', legend:true })
  });
}

// ─── CHART 2: DONUT ───────────────────────────────────────────────────
function renderDonutChart(counts) {
  const labels = counts.map(d => DIET_LABELS[d.Diet_type] || d.Diet_type);
  const values = counts.map(d => d.recipe_count);
  const colors = counts.map(d => DIET_COLORS[d.Diet_type] || '#888');

  destroyChart('donutChart');
  const ctx = document.getElementById('donutChart').getContext('2d');
  charts.donut = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets:[{ data:values, backgroundColor:colors.map(c=>c+'bb'), borderColor:colors, borderWidth:2, hoverOffset:8 }] },
    options: {
      responsive: true, maintainAspectRatio: true,
      cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#181c23',
          borderColor: '#232730',
          borderWidth: 1,
          titleColor: '#e8eaf0',
          bodyColor: '#6b7280',
          padding: 12,
          callbacks: {
            label: ctx => ` ${ctx.formattedValue} recipes`
          }
        }
      }
    }
  });

  // Custom legend
  const legend = document.getElementById('donut-legend');
  legend.innerHTML = counts.map((d, i) => `
    <div class="legend-row">
      <div class="legend-name"><div class="legend-dot" style="background:${colors[i]}"></div>${labels[i]}</div>
      <div class="legend-val">${values[i].toLocaleString()}</div>
    </div>
  `).join('');
}

// ─── CHART 3: HORIZONTAL BAR — RATIO ─────────────────────────────────
function renderRatioChart(ratios) {
  const labels = ratios.map(d => DIET_LABELS[d.Diet_type] || d.Diet_type);
  const values = ratios.map(d => d.Protein_to_Carbs_ratio);
  const colors = ratios.map(d => DIET_COLORS[d.Diet_type] || '#888');

  destroyChart('ratioChart');
  const ctx = document.getElementById('ratioChart').getContext('2d');
  charts.ratio = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets:[{
        label:'Protein:Carbs Ratio',
        data: values,
        backgroundColor: colors.map(c => c+'99'),
        borderColor: colors,
        borderWidth: 2,
        borderRadius: 6,
      }]
    },
    options: {
      ...chartOptions({ yLabel:'Ratio', legend:false }),
      indexAxis: 'y',
      plugins: {
        ...basePlugins(false),
        tooltip: baseTooltip(ctx => ` ${ctx.raw} ratio`)
      },
      scales: {
        x: { ...scaleStyle(), beginAtZero: true, title:{ display:true, text:'Protein ÷ Carbs', color:'#6b7280', font:{size:10} } },
        y: { ...scaleStyle() }
      }
    }
  });
}

// ─── CHART 4: RADAR ───────────────────────────────────────────────────
function renderRadarChart(macros) {
  // Normalise 0–100 per macro
  const allP = macros.map(d => d['Protein(g)']);
  const allC = macros.map(d => d['Carbs(g)']);
  const allF = macros.map(d => d['Fat(g)']);
  const norm = (v, arr) => Math.round((v - Math.min(...arr)) / (Math.max(...arr) - Math.min(...arr)) * 100);

  const dietColors = macros.map(d => DIET_COLORS[d.Diet_type] || '#888');
  const datasets = macros.map((d, i) => ({
    label: DIET_LABELS[d.Diet_type] || d.Diet_type,
    data: [
      norm(d['Protein(g)'], allP),
      norm(d['Carbs(g)'],   allC),
      norm(d['Fat(g)'],     allF),
    ],
    backgroundColor: dietColors[i] + '22',
    borderColor: dietColors[i],
    borderWidth: 2,
    pointBackgroundColor: dietColors[i],
    pointRadius: 4,
  }));

  destroyChart('radarChart');
  const ctx = document.getElementById('radarChart').getContext('2d');
  charts.radar = new Chart(ctx, {
    type: 'radar',
    data: { labels: ['Protein', 'Carbs', 'Fat'], datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: { color:'#6b7280', font:{size:10, family:"'DM Mono', monospace"}, boxWidth:10, padding:14 }
        },
        tooltip: baseTooltip(ctx => ` ${ctx.raw} (norm.)`),
      },
      scales: {
        r: {
          backgroundColor: 'rgba(255,255,255,0.01)',
          angleLines:   { color: 'rgba(255,255,255,0.07)' },
          grid:         { color: 'rgba(255,255,255,0.06)' },
          pointLabels:  { color: '#e8eaf0', font:{ size:11, family:"'Syne', sans-serif", weight:'700' } },
          ticks:        { display: false, stepSize: 25 },
          suggestedMin: 0, suggestedMax: 100,
        }
      }
    }
  });
}

// ─── TABLE ────────────────────────────────────────────────────────────
function renderTable(recipes) {
  const body = document.getElementById('table-body');
  body.innerHTML = recipes.map((r, i) => `
    <tr>
      <td style="color:var(--muted)">${String(i+1).padStart(2,'0')}</td>
      <td><span class="diet-pill pill-${r.Diet_type}">${DIET_LABELS[r.Diet_type]||r.Diet_type}</span></td>
      <td style="max-width:360px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.Recipe_name}</td>
      <td style="color:var(--muted);text-transform:capitalize">${r.Cuisine_type}</td>
      <td style="color:var(--accent2);font-weight:500">${r['Protein(g)'].toFixed(1)}</td>
    </tr>
  `).join('');
}

// ─── CHART HELPERS ────────────────────────────────────────────────────
function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}
function baseTooltip(labelCb) {
  return {
    tooltip: {
      backgroundColor:'#181c23', borderColor:'#232730', borderWidth:1,
      titleColor:'#e8eaf0', bodyColor:'#6b7280', padding:12,
      callbacks: { label: labelCb }
    }
  };
}
function basePlugins(legend=false) {
  return {
    legend: {
      display: legend,
      position: 'bottom',
      labels: { color:'#6b7280', font:{size:10, family:"'DM Mono', monospace"}, boxWidth:10, padding:14 }
    },
    ...baseTooltip(ctx => ` ${ctx.raw}g`)
  };
}
function scaleStyle() {
  return {
    grid:   { color:'rgba(255,255,255,0.04)' },
    ticks:  { color:'#6b7280', font:{size:10, family:"'DM Mono', monospace"} },
    border: { color:'transparent' }
  };
}
function chartOptions({ legend=false }) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: basePlugins(legend),
    scales: {
      x: { ...scaleStyle() },
      y: { ...scaleStyle(), beginAtZero: true }
    }
  };
}

// ─── UI HELPERS ───────────────────────────────────────────────────────
function showLoader(show) {
  document.getElementById('loader').classList.toggle('hidden', !show);
}
function setStatus(live, label) {
  const dot  = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  dot.style.background    = live ? '#4ade80' : '#ff9f47';
  dot.style.boxShadow     = live ? '0 0 8px #4ade80' : '0 0 8px #ff9f47';
  text.textContent = label;
}
function showError(msg) {
  const el = document.getElementById('error-banner');
  el.textContent = '⚠ ' + msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 8000);
}
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function avg(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }

// ─── BOOT ─────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loader-msg').textContent = 'Loading dataset analysis…';
  setTimeout(loadData, 800);
});