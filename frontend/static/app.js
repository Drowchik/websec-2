const MAP_START = [58.2, 76.5];
const MAP_START_ZOOM = 4;
const MAP_FOCUS_ZOOM = 7;
const POPUP_OPTIONS = {
  maxWidth: 420,
  minWidth: 320,
  maxHeight: 520,
  autoPan: true,
  keepInView: true,
  autoPanPadding: [24, 92],
};
const CHART_HEIGHT_DELAY = 120;
const MARKER_COLORS = {
  huge: "#2563eb",
  large: "#0ea5e9",
  medium: "#10b981",
  small: "#f59e0b",
  wind: "#ef4444",
  rain: "#6366f1",
  heat: "#f97316",
};
const CHART_CONFIGS = [
  { key: "temperature", color: "#f97316", fill: "rgba(249, 115, 22, 0.12)" },
  { key: "precipitation", color: "#2563eb", fill: "rgba(37, 99, 235, 0.12)" },
  { key: "wind", color: "#10b981", fill: "rgba(16, 185, 129, 0.12)" },
];

const chartRegistry = new Map();
const markerRegistry = new Map();
let settlements = [];
let activeSettlement = null;

const map = L.map("map", {
  preferCanvas: true,
  zoomControl: false,
  attributionControl: false,
}).setView(MAP_START, MAP_START_ZOOM);

L.control.zoom({ position: "bottomright" }).addTo(map);

L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
  maxZoom: 18,
  subdomains: "abcd",
}).addTo(map);

const pointLayer = L.layerGroup().addTo(map);
const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
});

function formatPopulation(value) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function markerRadius(population) {
  return Math.max(5, Math.min(18, Math.sqrt(population) / 72));
}

function markerColor(population) {
  if (population > 900000) return MARKER_COLORS.huge;
  if (population > 300000) return MARKER_COLORS.large;
  if (population > 100000) return MARKER_COLORS.medium;
  return MARKER_COLORS.small;
}

function weatherColor(forecast) {
  const first = forecast.points[0];
  if (!first) return MARKER_COLORS.huge;
  if (first.wind >= 9) return MARKER_COLORS.wind;
  if (first.precipitation >= 0.8) return MARKER_COLORS.rain;
  if (first.temperature >= 24) return MARKER_COLORS.heat;
  return MARKER_COLORS.medium;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setActivePlace(settlement, forecast) {
  const weather = forecast?.daily?.[0];
  const body = weather
    ? `
      <div class="city__stats">
        <div class="city__stat"><b>${Math.round(weather.temp_min)}...${Math.round(weather.temp_max)}°C</b><span>температура</span></div>
        <div class="city__stat"><b>${weather.rain_total} мм</b><span>осадки</span></div>
        <div class="city__stat"><b>${weather.wind_max} м/с</b><span>ветер</span></div>
        <div class="city__stat"><b>${weather.condition}</b><span>погода</span></div>
      </div>`
    : `<p>Загружаю прогноз и обновляю popup на карте.</p>`;

  $("#active-place").html(`
    <p class="weather__label">карточка места</p>
    <h2 class="city__title">${escapeHtml(settlement.name)}</h2>
    <p class="city__text">${escapeHtml(settlement.region)} · ${formatPopulation(settlement.population)} жителей</p>
    ${body}
  `);
}

function popupLoading(settlement) {
  return `
    <div class="popup">
      <div class="popup__head">
        <div>
          <h3 class="popup__title">${escapeHtml(settlement.name)}</h3>
          <p class="popup__text">${escapeHtml(settlement.region)}</p>
        </div>
      </div>
      <p class="popup__loading">Запрашиваю прогноз по координатам ${settlement.lat}, ${settlement.lon}...</p>
    </div>`;
}

function dayCards(daily) {
  return daily
    .map(
      (day) => `
        <div class="popup__day">
          <strong>${day.date.slice(5).replace("-", ".")}</strong>
          <span>${Math.round(day.temp_min)}...${Math.round(day.temp_max)}°C</span>
          <span>${day.rain_total} мм · ${day.wind_max} м/с</span>
        </div>`
    )
    .join("");
}

function popupForecast(settlement, forecast, popupId) {
  return `
    <div class="popup" id="${popupId}">
      <div class="popup__head">
        <div>
          <h3 class="popup__title">${escapeHtml(settlement.name)}</h3>
          <p class="popup__text">${escapeHtml(settlement.region)} · ${formatPopulation(settlement.population)} жителей</p>
        </div>
      </div>
      <img class="popup__image" src="/static/img/city.jpg" alt="Городской вид" />
      <div class="popup__days">${dayCards(forecast.daily)}</div>
      <div class="popup__charts">
        <div class="popup__chart"><span>Температура, °C</span><canvas width="340" height="92" data-chart="temperature"></canvas></div>
        <div class="popup__chart"><span>Осадки, мм/ч</span><canvas width="340" height="92" data-chart="precipitation"></canvas></div>
        <div class="popup__chart"><span>Ветер, м/с</span><canvas width="340" height="92" data-chart="wind"></canvas></div>
      </div>
    </div>`;
}

function destroyPopupCharts(popupId) {
  const charts = chartRegistry.get(popupId) || [];
  charts.forEach((chart) => chart.destroy());
  chartRegistry.delete(popupId);
}

function renderPopupCharts(popupId, forecast) {
  destroyPopupCharts(popupId);
  const popup = document.getElementById(popupId);
  if (!popup) return;

  const labels = forecast.points.map((point) => dateFormatter.format(new Date(point.time)));
  const charts = CHART_CONFIGS.map((config) => {
    const canvas = popup.querySelector(`[data-chart="${config.key}"]`);
    const data = forecast.points.map((point) => point[config.key]);
    return new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            data,
            borderColor: config.color,
            backgroundColor: config.fill,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.36,
            fill: true,
          },
        ],
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: 0 },
        plugins: { legend: { display: false }, tooltip: { intersect: false, mode: "index" } },
        scales: {
          x: { ticks: { maxTicksLimit: 4, color: "#93a4b8" }, grid: { display: false } },
          y: {
            beginAtZero: config.key !== "temperature",
            ticks: { maxTicksLimit: 4, color: "#93a4b8" },
            grid: { color: "rgba(148, 163, 184, 0.18)" },
          },
        },
      },
    });
  });

  chartRegistry.set(popupId, charts);
}

async function loadForecast(settlement, marker) {
  activeSettlement = settlement;
  setActivePlace(settlement);
  marker.bindPopup(popupLoading(settlement), POPUP_OPTIONS).openPopup();

  const response = await fetch(`/api/forecast?lat=${settlement.lat}&lon=${settlement.lon}&days=5`);
  if (!response.ok) throw new Error("forecast request failed");
  const forecast = await response.json();
  const popupId = `popup-${String(settlement.id).replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  marker.setStyle({
    color: weatherColor(forecast),
    fillColor: weatherColor(forecast),
    fillOpacity: 0.78,
  });
  marker.setPopupContent(popupForecast(settlement, forecast, popupId));
  setActivePlace(settlement, forecast);
  setTimeout(() => renderPopupCharts(popupId, forecast), CHART_HEIGHT_DELAY);
}

function addSettlementsToMap(items) {
  pointLayer.clearLayers();
  markerRegistry.clear();

  items.forEach((settlement) => {
    const marker = L.circleMarker([settlement.lat, settlement.lon], {
      radius: markerRadius(settlement.population),
      color: markerColor(settlement.population),
      fillColor: markerColor(settlement.population),
      fillOpacity: 0.55,
      weight: 2,
    });

    marker.on("click", () => {
      loadForecast(settlement, marker).catch(() => {
        marker.setPopupContent(`<div class="popup"><h3 class="popup__title">${escapeHtml(settlement.name)}</h3><p class="popup__text">Не удалось загрузить прогноз.</p></div>`);
      });
    });

    marker.addTo(pointLayer);
    markerRegistry.set(settlement.id, marker);
  });

  const bounds = L.latLngBounds(items.map((item) => [item.lat, item.lon]));
  map.fitBounds(bounds, { padding: [30, 30] });
  $("#settlement-count").text(`${items.length} населенных пунктов на карте`);
}

function renderSearchResults(items) {
  const container = $("#search-results").empty();
  if (!items.length) {
    container.append('<p class="is-muted">Ничего не найдено.</p>');
    return;
  }

  items.slice(0, 8).forEach((item) => {
    const template = document.getElementById("result-template");
    const node = $(template.content.firstElementChild.cloneNode(true));
    node.find("strong").text(item.name);
    node.find("span").text(`${item.region} · ${formatPopulation(item.population)} жителей`);
    node.on("click", () => focusSettlement(item));
    container.append(node);
  });
}

async function searchSettlements(query) {
  if (!query.trim()) {
    $("#search-results").empty();
    return;
  }
  const response = await fetch(`/api/settlements?q=${encodeURIComponent(query)}&limit=20`);
  const payload = await response.json();
  renderSearchResults(payload.items);
}

function focusSettlement(settlement) {
  const marker = markerRegistry.get(settlement.id);
  if (!marker) return;
  map.setView([settlement.lat, settlement.lon], Math.max(map.getZoom(), MAP_FOCUS_ZOOM), { animate: true });
  setTimeout(() => marker.fire("click"), 220);
  $("#search-results").empty();
  $("#settlement-search").val(settlement.name);
}

function debounce(callback, delay = 260) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
}

async function init() {
  const response = await fetch("/api/settlements?limit=1000");
  const payload = await response.json();
  settlements = payload.items;
  addSettlementsToMap(settlements);

  $("#settlement-search").on(
    "input",
    debounce((event) => searchSettlements(event.target.value))
  );

  $("#search-form").on("submit", (event) => {
    event.preventDefault();
    const query = $("#settlement-search").val().toString().trim().toLowerCase();
    const first = settlements.find((item) => item.search.includes(query));
    if (first) focusSettlement(first);
  });

  $("#reset-map").on("click", () => {
    addSettlementsToMap(settlements);
    if (activeSettlement) setActivePlace(activeSettlement);
  });
}

map.on("popupclose", (event) => {
  const popup = event.popup.getElement();
  const weatherPopup = popup?.querySelector(".popup");
  if (weatherPopup?.id) destroyPopupCharts(weatherPopup.id);
});

init().catch(() => {
  $("#settlement-count").text("Не удалось загрузить населенные пункты");
});
