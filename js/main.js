import { searchStations, fetchCountries, registerClick, isPlayable, mapCodecToFormat } from "./radioBrowser.js";
import { startLogin, handleRedirectCallback, isLoggedIn, logout } from "./auth.js";

const form = document.getElementById("search-form");
const nameInput = document.getElementById("search-name");
const countrySelect = document.getElementById("search-country");
const tagInput = document.getElementById("search-tag");
const resultsEl = document.getElementById("results");
const statusEl = document.getElementById("status");

const selectionSection = document.getElementById("selection");
const selectionList = document.getElementById("selection-list");
const selectionCount = document.getElementById("selection-count");
const createCardButton = document.getElementById("create-card-button");

const accountStatusEl = document.getElementById("account-status");
const loginButton = document.getElementById("login-button");

let currentAudio = null;
let currentAudioButton = null;

const FAVICON_FALLBACK = "img/favicon-fallback.png";

// Ordered list of stations selected for the card being built. Order here is
// the track/chapter order on the physical Yoto card.
const selectedStations = [];
// stationuuid -> add/remove button, so station cards in the results grid can
// reflect selection state without a full re-render.
const addButtonsByUuid = new Map();

setStatus("Search for a station on the left to get started.");
loadCountries();
initAccount();

loginButton.addEventListener("click", () => {
  if (isLoggedIn()) {
    logout();
    updateAccountUI();
  } else {
    startLogin().catch((err) => setStatus(`Error: ${err.message}`));
  }
});

async function initAccount() {
  try {
    await handleRedirectCallback();
  } catch (err) {
    setStatus(`Error: ${err.message}`);
  }
  updateAccountUI();
}

function updateAccountUI() {
  const loggedIn = isLoggedIn();
  accountStatusEl.textContent = loggedIn ? "Connected to Yoto." : "Not connected to Yoto.";
  loginButton.textContent = loggedIn ? "Log out" : "Log in with Yoto";
  createCardButton.disabled = true; // Card creation (POST /content) isn't wired up yet.
  createCardButton.title = loggedIn
    ? "Card creation isn't wired up yet"
    : "Log in with Yoto first";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  const countrycode = countrySelect.value;
  const tag = tagInput.value.trim();

  setStatus("Searching...");
  resultsEl.innerHTML = "";
  addButtonsByUuid.clear();

  try {
    const stations = await searchStations({ name, countrycode, tag });
    renderResults(stations);
    setStatus(stations.length ? `${stations.length} station(s) found.` : "No stations found.");
  } catch (err) {
    setStatus(`Error: ${err.message}`);
  }
});

function setStatus(text) {
  statusEl.textContent = text;
}

async function loadCountries() {
  try {
    const countries = await fetchCountries();
    for (const country of countries) {
      const option = document.createElement("option");
      option.value = country.iso_3166_1;
      option.textContent = `${country.name} (${country.stationcount})`;
      countrySelect.appendChild(option);
    }
  } catch {
    // Country filter is a courtesy; leave it at "Any country" if this fails.
  }
}

function renderResults(stations) {
  resultsEl.innerHTML = "";
  for (const station of stations) {
    resultsEl.appendChild(renderStationCard(station));
  }
}

function renderStationCard(station) {
  const playable = isPlayable(station);
  const format = mapCodecToFormat(station.codec);
  const canAdd = playable && !!format;

  const card = document.createElement("article");
  card.className = "station-card" + (playable ? "" : " station-card--unsupported");

  const favicon = document.createElement("img");
  favicon.className = "station-favicon";
  favicon.src = station.favicon || FAVICON_FALLBACK;
  favicon.alt = "";
  favicon.loading = "lazy";
  favicon.onerror = () => {
    favicon.onerror = null;
    favicon.src = FAVICON_FALLBACK;
  };

  const body = document.createElement("div");
  body.className = "station-body";

  const title = document.createElement("h3");
  title.className = "station-name";
  title.textContent = station.name || "(unnamed station)";

  const meta = document.createElement("p");
  meta.className = "station-meta";
  const bits = [station.country, station.codec, station.bitrate ? `${station.bitrate}kbps` : null]
    .filter(Boolean);
  meta.textContent = bits.join(" · ");

  const badges = document.createElement("div");
  badges.className = "station-badges";
  badges.appendChild(makeBadge(station.hls ? "HLS (unsupported)" : "direct stream", station.hls ? "bad" : "good"));
  badges.appendChild(makeBadge(format ? `${format}` : "unknown codec", format ? "good" : "warn"));

  body.append(title, meta, badges);

  const actions = document.createElement("div");
  actions.className = "station-actions";

  const playButton = document.createElement("button");
  playButton.type = "button";
  playButton.className = "play-button";
  playButton.textContent = "▶ Preview";
  playButton.disabled = !station.url_resolved;
  playButton.addEventListener("click", () => togglePreview(station, playButton));

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "add-button";
  addButton.disabled = !canAdd;
  addButton.title = canAdd ? "" : "Not usable on a Yoto card (needs a direct mp3/aac stream)";
  addButtonsByUuid.set(station.stationuuid, addButton);
  updateAddButton(addButton, station);
  addButton.addEventListener("click", () => toggleSelection(station, addButton));

  actions.append(playButton, addButton);

  card.append(favicon, body, actions);
  return card;
}

function makeBadge(text, kind) {
  const span = document.createElement("span");
  span.className = `badge badge--${kind}`;
  span.textContent = text;
  return span;
}

function togglePreview(station, button) {
  if (currentAudio && currentAudioButton === button) {
    currentAudio.pause();
    currentAudio = null;
    currentAudioButton = null;
    button.textContent = "▶ Preview";
    return;
  }

  if (currentAudio) {
    currentAudio.pause();
    currentAudioButton.textContent = "▶ Preview";
  }

  const audio = new Audio(station.url_resolved);
  audio.addEventListener("ended", () => {
    button.textContent = "▶ Preview";
  });
  audio.addEventListener("error", () => {
    button.textContent = "⚠ playback failed";
    currentAudio = null;
    currentAudioButton = null;
  });

  audio.play();
  currentAudio = audio;
  currentAudioButton = button;
  button.textContent = "■ Stop";

  registerClick(station.stationuuid);
}

function isSelected(station) {
  return selectedStations.some((s) => s.stationuuid === station.stationuuid);
}

function updateAddButton(button, station) {
  button.textContent = isSelected(station) ? "✓ Added" : "＋ Add to card";
  button.classList.toggle("add-button--added", isSelected(station));
}

function toggleSelection(station, button) {
  const index = selectedStations.findIndex((s) => s.stationuuid === station.stationuuid);
  if (index === -1) {
    selectedStations.push(station);
  } else {
    selectedStations.splice(index, 1);
  }
  updateAddButton(button, station);
  renderSelection();
}

function removeFromSelection(station) {
  const index = selectedStations.findIndex((s) => s.stationuuid === station.stationuuid);
  if (index !== -1) {
    selectedStations.splice(index, 1);
  }
  const button = addButtonsByUuid.get(station.stationuuid);
  if (button) updateAddButton(button, station);
  renderSelection();
}

function moveSelection(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= selectedStations.length) return;
  [selectedStations[index], selectedStations[target]] = [selectedStations[target], selectedStations[index]];
  renderSelection();
}

function renderSelection() {
  selectionSection.hidden = selectedStations.length === 0;
  selectionCount.textContent = selectedStations.length ? `(${selectedStations.length} track${selectedStations.length === 1 ? "" : "s"})` : "";

  selectionList.innerHTML = "";
  selectedStations.forEach((station, index) => {
    const item = document.createElement("li");
    item.className = "selection-item";

    const name = document.createElement("span");
    name.className = "selection-item-name";
    name.textContent = station.name || "(unnamed station)";

    const controls = document.createElement("div");
    controls.className = "selection-item-controls";

    const upButton = document.createElement("button");
    upButton.type = "button";
    upButton.textContent = "↑";
    upButton.disabled = index === 0;
    upButton.title = "Move up";
    upButton.addEventListener("click", () => moveSelection(index, -1));

    const downButton = document.createElement("button");
    downButton.type = "button";
    downButton.textContent = "↓";
    downButton.disabled = index === selectedStations.length - 1;
    downButton.title = "Move down";
    downButton.addEventListener("click", () => moveSelection(index, 1));

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "✕";
    removeButton.title = "Remove";
    removeButton.addEventListener("click", () => removeFromSelection(station));

    controls.append(upButton, downButton, removeButton);
    item.append(name, controls);
    selectionList.appendChild(item);
  });
}
