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

      const option = document.createElement("option");
      option.value = dateStr;
      option.textContent = weekday;
      if (i === 0) option.selected = true;
      select.appendChild(option);
    });

    // initial render: today
    renderHourly(data, data.daily.time[0]);

    // dropdown listener
    select.addEventListener("change", (e) => {
      renderHourly(data, e.target.value);
      highlightDay(e.target.value);
    });
  }

  // daily tile click listener
  const dayEls = document.querySelectorAll(".daily-forecast .day");
  dayEls.forEach((dayEl) => {
    dayEl.addEventListener("click", () => {
      const selectedDate = dayEl.dataset.date;
      renderHourly(data, selectedDate);
      if (select) select.value = selectedDate;
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
function renderHourly(data, selectedDate) {
  const container = document.querySelector(".hourly-list");
  if (!container || !data.hourly) return;

  container.innerHTML = "";

  const dayHours = data.hourly.time
    .map((time, i) => ({
      time,
      temp: data.hourly.temperature_2m[i],
      code: data.hourly.weathercode[i],
    }))
    .filter((h) => h.time.startsWith(selectedDate));

  if (dayHours.length === 0) {
    container.innerHTML = "<p>No hourly data</p>";
    return;
  }

  const chunks = [];
  for (let i = 0; i < dayHours.length; i += 6) {
    chunks.push(dayHours.slice(i, i + 6));
  }

  let currentPage = 0;

  function renderPage(page) {
    container.innerHTML = "";
    chunks[page].forEach((h) => {
      const hourEl = document.createElement("div");
      hourEl.className = "hour";
      hourEl.innerHTML = `
        <div class="hr">
          <img class="image" src="${getWeatherIcon(h.code)}" alt="Weather Icon">
          <p>${new Date(h.time).getHours()}:00</p>
        </div>
        <p>${Math.round(h.temp)}°</p>
      `;
      container.appendChild(hourEl);
    });

    const controls = document.createElement("div");
    controls.className = "pagination";

    const prev = document.createElement("button");
    prev.textContent = "Prev 6h";
    prev.disabled = page === 0;
    prev.addEventListener("click", () => renderPage(page - 1));

    const next = document.createElement("button");
    next.textContent = "Next 6h";
    next.disabled = page === chunks.length - 1;
    next.addEventListener("click", () => renderPage(page + 1));

    controls.appendChild(prev);
    controls.appendChild(next);
    container.appendChild(controls);
  }

  renderPage(currentPage);
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
  unitsBtn.classList.toggle("active");
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".units")) {
    unitsDropdown.classList.remove("active");
    unitsBtn.classList.remove("active");
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    unitsDropdown.classList.remove("active");
    unitsBtn.classList.remove("active");
  }
});

function highlightDay(selectedDate) {
  const dayEls = document.querySelectorAll(".daily-forecast .day");
  dayEls.forEach((dayEl) => {
    dayEl.classList.toggle("active", dayEl.dataset.date === selectedDate);
  });
}

// ---------------- Units dropdown ----------------
unitOptions.forEach((opt) => {
  opt.addEventListener("click", async () => {
    const type = opt.dataset.type;
    const unit = opt.dataset.unit;
    selectedUnits[type] = unit;

    const parentSection = opt.closest(".dropdown-section");
    parentSection
      .querySelectorAll("button")
      .forEach((b) => b.classList.remove("active"));
    opt.classList.add("active");

    unitsBtn.innerHTML = `
      <img src="/assets/images/icon-units.svg" alt=""> 
      ${opt.textContent.trim()} 
      <img src="/assets/images/icon-dropdown.svg" alt="">
    `;
    unitsDropdown.classList.remove("active");
    unitsBtn.classList.remove("active");

    if (lastLocation) {
      showLoading();
      try {
        const weather = await getWeather(lastLocation.lat, lastLocation.lon);
        displayWeather(weather, lastLocation);
      } catch (err) {
        console.error(err);
        alert("Failed to fetch weather with new units.");
      } finally {
        hideLoading();
      }
    }
  });
});
