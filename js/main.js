// ============================
// 全局变量
// ============================

let selectedFeature = null;
let miniTrendChart = null;


// ============================
// 监听地图点击事件（核心）
// ============================

document.addEventListener("map:select", function (e) {

  selectedFeature = e.detail;

  updateProfile(selectedFeature);
  updateMiniTrendChart(selectedFeature);
  updateSummaryMetrics(selectedFeature);

});


// ============================
// 更新右侧 Profile 面板
// ============================

function updateProfile(feature) {

  if (!feature || !feature.properties) return;

  const props = feature.properties;

  document.getElementById("profileContent").innerHTML = `
    <h4>${props.zip || "Selected Area"}</h4>

    <p><strong>Market Rent:</strong> ${props.rent ?? "N/A"}</p>
    <p><strong>Subsidy:</strong> ${props.subsidy ?? "N/A"}</p>
    <p><strong>Affordability Gap:</strong> ${props.gap ?? "N/A"}</p>

    <p><strong>Poverty Rate:</strong> ${props.poverty ?? "N/A"}</p>
    <p><strong>Voucher Density:</strong> ${props.voucher_density ?? "N/A"}</p>
  `;
}


// ============================
// 更新 mini Trend Chart
// ============================

function updateMiniTrendChart(feature) {

  if (!feature || !feature.properties) return;

  const props = feature.properties;

  const trendData = props.trend
    ? props.trend
    : [props.rent ?? 0, props.rent ?? 0, props.rent ?? 0, props.rent ?? 0, props.rent ?? 0];

  const labels = ["2019", "2020", "2021", "2022", "2023"];

  if (!miniTrendChart) {

    miniTrendChart = new Chart(
      document.getElementById("miniTrendChart"),
      {
        type: "line",
        data: {
          labels: labels,
          datasets: [{
            label: "Rent Trend",
            data: trendData,
            tension: 0.3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false
        }
      }
    );

  } else {

    miniTrendChart.data.labels = labels;
    miniTrendChart.data.datasets[0].data = trendData;
    miniTrendChart.update();

  }
}


// ============================
// 更新 Summary Metrics
// ============================

function updateSummaryMetrics(feature) {

  if (!feature || !feature.properties) return;

  const props = feature.properties;

  document.getElementById("summaryMetrics").innerHTML = `
    <div><strong>ZIP:</strong> ${props.zip || "N/A"}</div>
    <div><strong>Gap:</strong> ${props.gap ?? "N/A"}</div>
    <div><strong>Poverty:</strong> ${props.poverty ?? "N/A"}</div>
    <div><strong>Voucher Density:</strong> ${props.voucher_density ?? "N/A"}</div>
  `;
}