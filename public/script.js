const WINDBORNE_BASE = "/api/hour";
const HOURS = Array.from({ length: 24 }, (_, i) =>
  i.toString().padStart(2, "0")
);

// Balloon history indexed by ID (we'll use the array index as ID)
let balloonHistories = new Map();
let map;
let layerGroup;
let selectedLayer = null;

const statusEl = document.getElementById("status");
const refreshBtn = document.getElementById("refresh-btn");
const balloonInfoEl = document.getElementById("balloon-info");

init();

function init() {
  initMap();
  attachEvents();
  loadAllData();

  // Refresh automatically every 10 minutes to stay “live”
  setInterval(loadAllData, 10 * 60 * 1000);
}

function initMap() {
  map = L.map("map").setView([10, 0], 2);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  layerGroup = L.layerGroup().addTo(map);
}

function attachEvents() {
  refreshBtn.addEventListener("click", () => loadAllData());
}

async function loadAllData() {
  statusEl.textContent = "Loading balloon tracks…";
  balloonHistories.clear();
  layerGroup.clearLayers();
  selectedLayer = null;
  balloonInfoEl.innerHTML =
    "<p>Click a track on the map to see details and current weather.</p>";

  try {
    const results = await Promise.all(
      HOURS.map(async (hour) => {
        const url = `${WINDBORNE_BASE}/${hour}`;
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          return { hour, json };
        } catch (err) {
          console.warn("Failed to fetch hour", hour, err);
          return { hour, json: null, error: err };
        }
      })
    );

    for (const { hour, json } of results) {
      if (!json) continue;
      processHourJson(hour, json);
    }

    if (balloonHistories.size === 0) {
      console.warn("No balloon histories found after processing all hours.");
    }

    drawTracks();
    statusEl.textContent = "Loaded latest 24h of data.";
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Failed to load data.";
  }
}

function processHourJson(hourStr, json) {
  const hoursAgo = parseInt(hourStr, 10);

  if (!Array.isArray(json)) return;

  json.forEach((row, index) => {
    if (index >= 300) return;

    if (!Array.isArray(row) || row.length < 2) return;

    const lat = Number(row[0]);
    const lon = Number(row[1]);
    const altRaw = row.length > 2 ? Number(row[2]) : null;

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return;

    const id = `balloon-${index}`;
    const alt = Number.isFinite(altRaw) ? altRaw : null;

    const point = { id, lat, lon, alt, hoursAgo };

    if (!balloonHistories.has(id)) {
      balloonHistories.set(id, []);
    }
    balloonHistories.get(id).push(point);
  });
}

function drawTracks() {
  balloonHistories.forEach((points, id) => {
    // Sort by how many hours ago (23 → oldest, 0 → newest)
    points.sort((a, b) => b.hoursAgo - a.hoursAgo);

    const latlngs = points.map((p) => [p.lat, p.lon]);
    if (latlngs.length < 2) return;

    const polyline = L.polyline(latlngs, {
      color: "#38bdf8",
      weight: 2,
      opacity: 0.8,
    }).addTo(layerGroup);

    polyline.balloonId = id;
    polyline.points = points;

    polyline.on("click", () => {
      selectBalloon(polyline);
    });
  });

  // Fit map to all tracks
  const allLatLngs = [];
  balloonHistories.forEach((points) =>
    points.forEach((p) => allLatLngs.push([p.lat, p.lon]))
  );
  if (allLatLngs.length > 0) {
    map.fitBounds(allLatLngs, { padding: [20, 20] });
  }
}

async function selectBalloon(polyline) {
  if (selectedLayer) {
    selectedLayer.setStyle({ color: "#38bdf8", weight: 2 });
  }
  selectedLayer = polyline;
  selectedLayer.setStyle({ color: "#f97316", weight: 3 });

  const id = polyline.balloonId;
  const points = polyline.points;

  // Latest snapshot is the one with hoursAgo = 0 (or smallest)
  const latest = points.reduce((best, p) =>
    best == null || p.hoursAgo < best.hoursAgo ? p : best
  );

  showBalloonInfo(id, latest, { loading: true });

  try {
    const weather = await fetchWeather(latest.lat, latest.lon);
    showBalloonInfo(id, latest, { loading: false, weather });
  } catch (err) {
    console.error(err);
    showBalloonInfo(id, latest, { loading: false, error: err });
  }
}

function showBalloonInfo(id, latest, { loading, weather, error }) {
  const timeStr = `~${latest.hoursAgo} hour(s) ago snapshot`;

  let html = `
    <div class="info-row">
      <span class="info-label">Balloon ID:</span>
      <span class="badge">${id}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Last position:</span>
      <div>lat ${latest.lat.toFixed(3)}, lon ${latest.lon.toFixed(3)}</div>
    </div>
    <div class="info-row">
      <span class="info-label">Last seen:</span>
      <div>${timeStr}</div>
    </div>
  `;

  if (latest.alt != null) {
    html += `
      <div class="info-row">
        <span class="info-label">Altitude (3rd field):</span>
        <div>${latest.alt.toFixed(2)}</div>
      </div>
    `;
  }

  if (loading) {
    html += `<div class="info-row"><em>Loading current surface weather…</em></div>`;
  } else if (error) {
    html += `<div class="info-row error">Failed to load weather data.</div>`;
  } else if (weather) {
    html += `
      <h3>Current surface weather</h3>
      <div class="info-row">
        <span class="info-label">Temperature:</span>
        <div>${weather.temperature} °C</div>
      </div>
      <div class="info-row">
        <span class="info-label">Wind speed:</span>
        <div>${weather.windspeed} m/s</div>
      </div>
      <div class="info-row">
        <span class="info-label">Wind direction:</span>
        <div>${weather.winddirection}°</div>
      </div>
    `;
  }

  balloonInfoEl.innerHTML = html;
}

async function fetchWeather(lat, lon) {
  // Open-Meteo current weather API (no key needed, CORS-friendly)
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat.toString());
  url.searchParams.set("longitude", lon.toString());
  url.searchParams.set("current_weather", "true");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Weather HTTP ${res.status}`);

  const data = await res.json();
  if (!data.current_weather) throw new Error("Missing current_weather");

  return data.current_weather;
}
