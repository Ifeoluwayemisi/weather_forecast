// script.js - drop into your project root and include via <script src="script.js"></script>

// ---------------- DOM refs ----------------
const searchBtn = document.getElementById("search-btn");
const searchInput = document.getElementById("search-input");

const unitsBtn = document.querySelector(".units-btn");
const unitsDropdown = document.querySelector(".units-dropdown");
const unitOptions = document.querySelectorAll(".units-dropdown button");

const locationTitle = document.querySelector(".location h2");
const locationDate = document.querySelector(".location p");
const tempValue = document.querySelector(".temp-value");
const dayEls = document.querySelectorAll(".forecast-grid .day");

const spinner = document.getElementById("loading-spinner");

// ---------------- State ----------------
let lastLocation = null;
let cachedWeather = null;

let selectedUnits = {
  temperature: "celsius", // 'celsius' | 'fahrenheit'
  wind: "kmh", // 'kmh' | 'mph'
  precipitation: "mm", // 'mm' | 'in'
};

// ---------------- Helpers ----------------
function getWeatherIcon(code) {
  if (code === 0) return "/assets/images/icon-sunny.webp";
  if (code === 1 || code === 2) return "/assets/images/icon-partly-cloudy.webp";
  if (code === 3) return "/assets/images/icon-overcast.webp";
  if (code === 45 || code === 48) return "/assets/images/icon-fog.webp";
  if (code >= 51 && code <= 57) return "/assets/images/icon-drizzle.webp";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82))
    return "/assets/images/icon-rain.webp";
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86))
    return "/assets/images/icon-snow.webp";
  if (code === 95 || (code >= 96 && code <= 99))
    return "/assets/images/icon-storm.webp";
  return "/assets/images/icon-partly-cloudy.webp"; // fallback
}

function getMetricSpan(label) {
  const items = document.querySelectorAll(".metrics .metric");
  for (const item of items) {
    const p = item.querySelector("p").textContent.trim().toLowerCase();
    if (p.includes(label)) return item.querySelector("span");
  }
  return null;
}
const feelsLikeSpan = () => getMetricSpan("feels");
const humiditySpan = () => getMetricSpan("humidity");
const windSpan = () => getMetricSpan("wind");
const precipSpan = () => getMetricSpan("precip");

function formatDateFromISO(isoStr) {
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  } catch {
    return isoStr;
  }
}
function round(v) {
  return Math.round(Number(v));
}

function showLoading() {
  if (spinner) spinner.classList.remove("hidden");
}
function hideLoading() {
  if (spinner) spinner.classList.add("hidden");
}

// ---------------- API calls ----------------
async function getCoordinates(query) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    query
  )}&count=5&language=en`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Geocoding request failed");
  const data = await res.json();
  if (!data.results || data.results.length === 0)
    throw new Error("Location not found");
  return data.results;
}

async function getWeather(lat, lon) {
  const tempUnit =
    selectedUnits.temperature === "fahrenheit" ? "fahrenheit" : "celsius";
  const windUnit = selectedUnits.wind === "mph" ? "mph" : "kmh";
  const precipUnit = selectedUnits.precipitation === "in" ? "inch" : "mm";

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=temperature_2m,apparent_temperature,relativehumidity_2m,precipitation,weathercode&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&timezone=auto&temperature_unit=${tempUnit}&windspeed_unit=${windUnit}&precipitation_unit=${precipUnit}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Weather request failed");
  return await res.json();
}

// ---------------- UI update ----------------
function displayWeather(data, location) {
  if (!data || !data.current_weather) return;

  window.weatherData = data; // save globally
  const cw = data.current_weather;

  // Temperature
  tempValue.textContent = `${round(cw.temperature)}°`;

  // Icon
  const weatherIconEl = document.querySelector(
    ".current-weather .weather-icon"
  );
  if (weatherIconEl && cw.weathercode !== undefined) {
    weatherIconEl.src = getWeatherIcon(cw.weathercode);
  }

  // Location + Date
  locationTitle.textContent = `${location.name}${
    location.country ? ", " + location.country : ""
  }`;
  locationDate.textContent = formatDateFromISO(cw.time);

  // --- DAILY forecast ---
  const days = document.querySelectorAll(".daily-forecast .day");
  data.daily.time.forEach((date, idx) => {
    const dayEl = days[idx];
    if (!dayEl) return;

    dayEl.dataset.date = date;
    dayEl.querySelector("p").textContent = new Date(date).toLocaleDateString(
      "en-US",
      { weekday: "short" }
    );
    dayEl.querySelector(".flex p:first-child").textContent = `${Math.round(
      data.daily.temperature_2m_max[idx]
    )}°`;
    dayEl.querySelector(".flex p:last-child").textContent = `${Math.round(
      data.daily.temperature_2m_min[idx]
    )}°`;
    const code = data.daily.weathercode[idx];
    dayEl.querySelector("img").src = getWeatherIcon(code);
  });

  // --- HOURLY forecast dropdown ---
  const select = document.querySelector(".hourly-forecast select");
  if (select) {
    select.innerHTML = "";

    data.daily.time.forEach((dateStr, i) => {
      const date = new Date(dateStr);
      const weekday = date.toLocaleDateString("en-US", { weekday: "long" });

      for (let block = 0; block < 24; block += 6) {
        const option = document.createElement("option");
        option.value = `${dateStr}-${block}`; // e.g. "2025-10-04-0"
        option.textContent = `${weekday} ${block}:00 - ${block + 6}:00`;
        if (i === 0 && block === 0) option.selected = true;
        select.appendChild(option);
      }
    });

    // initial render: first 6hr chunk of today
    const [firstDate] = data.daily.time;
    renderHourly(data, `${firstDate}-0`);

    // dropdown listener
    select.addEventListener("change", (e) => {
      renderHourly(data, e.target.value);
      highlightDay(e.target.value.split("-")[0]); // highlight base day
    });
  }

  // daily tile click listener
  const dayEls = document.querySelectorAll(".daily-forecast .day");
  dayEls.forEach((dayEl) => {
    dayEl.addEventListener("click", () => {
      const selectedDate = dayEl.dataset.date;
      renderHourly(data, `${selectedDate}-0`); // default to 0–6 chunk
      if (select) select.value = `${selectedDate}-0`;
      highlightDay(selectedDate);
    });
  });

  // highlight today initially
  highlightDay(data.daily.time[0]);

  // ---- Metrics ----
  let hourIndex = -1;
  if (data.hourly && data.hourly.time) {
    hourIndex = data.hourly.time.indexOf(cw.time);
  }

  const feels =
    hourIndex >= 0 && data.hourly.apparent_temperature
      ? data.hourly.apparent_temperature[hourIndex]
      : null;
  const feelsEl = feelsLikeSpan();
  if (feelsEl) feelsEl.textContent = feels !== null ? `${round(feels)}°` : "—";

  const hum =
    hourIndex >= 0 && data.hourly.relativehumidity_2m
      ? data.hourly.relativehumidity_2m[hourIndex]
      : null;
  const humEl = humiditySpan();
  if (humEl) humEl.textContent = hum !== null ? `${round(hum)}%` : "—";

  const windEl = windSpan();
  if (windEl)
    windEl.textContent =
      cw.windspeed !== undefined
        ? `${round(cw.windspeed)} ${selectedUnits.wind}`
        : "—";

  const precip =
    hourIndex >= 0 && data.hourly.precipitation
      ? data.hourly.precipitation[hourIndex]
      : null;
  const precipEl = precipSpan();
  if (precipEl)
    precipEl.textContent =
      precip !== null
        ? `${precip} ${selectedUnits.precipitation === "in" ? "in" : "mm"}`
        : "—";

  cachedWeather = data;
}

// ---------------- Hourly rendering ----------------
function renderHourly(data, selectedChunk) {
  const hourlyList = document.querySelector(".hourly-list");
  if (!hourlyList || !data.hourly) return;

  hourlyList.innerHTML = "";

  const [dateStr, blockStr] = selectedChunk.split("-");
  const blockStart = parseInt(blockStr, 10);
  const blockEnd = blockStart + 6;

  data.hourly.time.forEach((t, i) => {
    if (!t.startsWith(dateStr)) return;
    const timeObj = new Date(t);
    const hour = timeObj.getHours();
    if (hour < blockStart || hour >= blockEnd) return;

    const hourLabel = timeObj.toLocaleTimeString("en-US", {
      hour: "numeric",
      hour12: true,
    });
    const temp = Math.round(data.hourly.temperature_2m[i]);
    const icon = getWeatherIcon(data.hourly.weathercode[i]);

    const hourEl = document.createElement("div");
    hourEl.classList.add("hour");
    hourEl.innerHTML = `
      <div class="hr">
        <img class="image" src="${icon}" alt="Weather Icon">
        <p>${hourLabel}</p>
      </div>
      <p>${temp}°</p>
    `;
    hourlyList.appendChild(hourEl);
  });
}

// ---------------- Main search flow ----------------
async function doSearch(query) {
  try {
    if (!query || !query.trim()) return;
    showLoading();

    const results = await getCoordinates(query);
    const best = results[0];
    lastLocation = {
      name: best.name,
      country: best.country,
      lat: best.latitude,
      lon: best.longitude,
    };

    const weather = await getWeather(best.latitude, best.longitude);
    displayWeather(weather, lastLocation);
  } catch (err) {
    console.error(err);
    alert(err.message || "Something went wrong fetching data");
  } finally {
    hideLoading();
  }
}

// ---------------- Events ----------------
searchBtn.addEventListener("click", () => doSearch(searchInput.value));
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") doSearch(searchInput.value);
});

unitsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  unitsDropdown.classList.toggle("active");
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".units")) {
    unitsDropdown.classList.remove("active");
  }
});

function highlightDay(selectedDate) {
  const dayEls = document.querySelectorAll(".daily-forecast .day");
  dayEls.forEach((dayEl) => {
    if (dayEl.dataset.date === selectedDate) {
      dayEl.classList.add("active");
    } else {
      dayEl.classList.remove("active");
    }
  });
}

unitOptions.forEach((opt) => {
  opt.addEventListener("click", () => {
    const type = opt.dataset.type;
    const unit = opt.dataset.unit;
    selectedUnits[type] = unit;

    unitsBtn.innerHTML = `
      <img src="/assets/images/icon-units.svg" alt=""> 
      ${opt.textContent.trim()} 
      <img src="/assets/images/icon-dropdown.svg" alt="">
    `;
    unitsDropdown.classList.remove("active");

    if (cachedWeather && lastLocation) {
      displayWeather(cachedWeather, lastLocation);
    }
  });
});
