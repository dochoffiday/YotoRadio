import { searchStations, fetchCountries, registerClick, isPlayable, mapCodecToFormat } from "./radioBrowser.js";
import { startLogin, handleRedirectCallback, isLoggedIn, logout, getValidAccessToken } from "./auth.js";
import { createCard, uploadCoverImage } from "./yotoContent.js";
import { generateDefaultCoverImage } from "./coverArt.js";

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
const cardTitleInput = document.getElementById("card-title");
const coverInput = document.getElementById("cover-input");
const coverPreview = document.getElementById("cover-preview");

const accountStatusEl = document.getElementById("account-status");
const loginButton = document.getElementById("login-button");

let currentAudio = null;
let currentAudioButton = null;

const FAVICON_FALLBACK = "img/favicon-fallback.png";
const DRAFT_KEY = "yoto_radio_draft";

// Ordered list of stations selected for the card being built. Order here is
// the track/chapter order on the physical Yoto card. Persisted to
// localStorage (station data + title only, not the cover file) so it
// survives the full-page redirect to Yoto's login and back, or just closing
// the tab and coming back later.
const selectedStations = [];
// stationuuid -> add/remove button, so station cards in the results grid can
// reflect selection state without a full re-render.
const addButtonsByUuid = new Map();

setStatus("Search for a station on the left to get started.");
restoreDraft();
renderSelection();
updateAccountUI();
loadCountries();
initAccount();
refreshGeneratedCoverPreview();

loginButton.addEventListener("click", () => {
  if (isLoggedIn()) {
    logout();
    updateAccountUI();
  } else {
    scrollStatusIntoView();
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
  createCardButton.disabled = !loggedIn;
  createCardButton.title = loggedIn ? "" : "Log in with Yoto first";
}

function persistDraft() {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({
    stations: selectedStations,
    title: cardTitleInput.value,
  }));
}

function restoreDraft() {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return;
  try {
    const draft = JSON.parse(raw);
    if (Array.isArray(draft.stations)) selectedStations.push(...draft.stations);
    if (draft.title) cardTitleInput.value = draft.title;
  } catch {
    // Corrupt draft; just start fresh.
  }
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

let generatedCoverPreviewUrl = null;
let coverPreviewDebounce = null;

function setCoverPreview(url) {
  if (generatedCoverPreviewUrl) URL.revokeObjectURL(generatedCoverPreviewUrl);
  generatedCoverPreviewUrl = url;
  coverPreview.src = url;
  coverPreview.hidden = false;
}

async function refreshGeneratedCoverPreview() {
  if (coverInput.files[0]) return;
  const title = cardTitleInput.value.trim() || "My Radio Stations";
  try {
    const file = await generateDefaultCoverImage(title);
    // Bail if the user picked a file (or the title moved on) while we were generating.
    if (coverInput.files[0]) return;
    setCoverPreview(URL.createObjectURL(file));
  } catch {
    // Preview is a nicety; leave whatever was showing (or nothing) if this fails.
  }
}

cardTitleInput.addEventListener("input", () => {
  persistDraft();
  clearTimeout(coverPreviewDebounce);
  coverPreviewDebounce = setTimeout(refreshGeneratedCoverPreview, 400);
});

coverInput.addEventListener("change", () => {
  const file = coverInput.files[0];
  if (!file) {
    refreshGeneratedCoverPreview();
    return;
  }
  setCoverPreview(URL.createObjectURL(file));
});

createCardButton.addEventListener("click", async () => {
  const title = cardTitleInput.value.trim() || "My Radio Stations";
  const coverFile = coverInput.files[0] || null;
  createCardButton.disabled = true;
  scrollStatusIntoView();

  try {
    const accessToken = await getValidAccessToken();

    setStatus(coverFile ? "Uploading cover image..." : "Generating a cover image...");
    const coverToUpload = coverFile || (await generateDefaultCoverImage(title));
    const coverImageUrl = await uploadCoverImage(coverToUpload, accessToken);

    const card = await createCard({
      title,
      stations: selectedStations,
      accessToken,
      coverImageUrl,
      onProgress: (done, total) => setStatus(`Generating station icons (${done}/${total})...`),
    });
    const cardId = card?.card?.cardId;
    if (cardId) {
      setStatusLink(`"${title}" created!`, `https://my.yotoplay.com/cards/${cardId}`, "View your card →");
    } else {
      setStatus(`"${title}" created! Check the Yoto app to see it on your account.`);
    }

    // Deliberately not clearing the selection/tray here: doing so hides the
    // "Your Card" panel (selectionSection.hidden), which shrinks the
    // sidebar right as the success message appears. If the page had been
    // scrolled at all during the wait, the browser snaps the scroll
    // position back to fit the now-shorter page — a jarring second jump
    // right on top of the deliberate one from scrollStatusIntoView(). The
    // tray staying put also just reads as "here's what you built."
    console.log("Created card:", card);
  } catch (err) {
    setStatus(`Error: ${err.message}`);
  } finally {
    createCardButton.disabled = !isLoggedIn();
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  const countrycode = countrySelect.value;
  const tag = tagInput.value.trim();

  scrollStatusIntoView();
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

function setStatusLink(text, url, linkLabel) {
  statusEl.textContent = "";
  statusEl.append(`${text} `);
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = linkLabel;
  statusEl.appendChild(link);
}

// Scroll the status line into view once, at the start of a user-initiated
// action — not on every status update within that action, or a multi-step
// flow (upload cover, generate icons, create card...) visibly jumps the
// page with every step instead of settling once.
function scrollStatusIntoView() {
  statusEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
  persistDraft();
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
