// ============================
// 初始化地图
// ============================

const map = L.map('map').setView([39.95, -75.16], 10);

// 底图（必须）
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);


// ============================
// 颜色函数（根据 gap 上色）
// ============================

function getColor(gap) {
  return gap > 1000 ? '#08306b' :
         gap > 500  ? '#2171b5' :
         gap > 200  ? '#6baed6' :
         gap > 0    ? '#c6dbef' :
                      '#f7fbff';
}


// ============================
// 样式函数
// ============================

function style(feature) {
  return {
    fillColor: getColor(feature.properties.gap),
    weight: 1,
    opacity: 1,
    color: 'white',
    fillOpacity: 0.7
  };
}


// ============================
// 每个区域的交互
// ============================

function onEachFeature(feature, layer) {

  // hover 高亮
  layer.on('mouseover', function () {
    layer.setStyle({
      weight: 2,
      fillOpacity: 0.9
    });
  });

  layer.on('mouseout', function () {
    layer.setStyle({
      weight: 1,
      fillOpacity: 0.7
    });
  });

  // 🔥 点击 → 发送全局事件
  layer.on('click', function () {
    document.dispatchEvent(
      new CustomEvent("map:select", {
        detail: feature
      })
    );
  });
}


// ============================
// 加载 GeoJSON（核心）
// ============================

fetch("data/zip.geojson")
  .then(res => res.json())
  .then(data => {

    L.geoJSON(data, {
      style: style,
      onEachFeature: onEachFeature
    }).addTo(map);

  })
  .catch(err => {
    console.error("GeoJSON加载失败:", err);
  });