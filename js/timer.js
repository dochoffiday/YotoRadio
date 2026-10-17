// Timer prototype: previews the generated assets (timer/Generate.cs) and
// creates a card with one stream track per timer. Each timer is a long mp3
// (silence with spoken "N minutes remaining" announcements), and its icon is
// an animated 16x16 GIF — a ring around the minutes that unwinds as time runs down.

import { isLoggedIn, getValidAccessToken } from "./auth.js";
import { uploadCoverImage } from "./yotoContent.js";
import { generateDefaultCoverImage } from "./coverArt.js";

const TIMERS = [1, 5, 10]; // minutes — keep in sync with timer/Generate.cs
// The player streams these, so they must be the published URLs, not localhost.
const AUDIO_BASE = "https://dochoffiday.github.io/YotoRadio/timer/audio/";
const CONTENT_URL = "https://api.yotoplay.com/content";
const ICON_UPLOAD_URL = "https://api.yotoplay.com/media/displayIcons/user/me/upload";

const timersEl = document.getElementById("timers");
const statusEl = document.getElementById("status");
const createButton = document.getElementById("create-button");
const accountStatusEl = document.getElementById("account-status");

const label = (minutes) => `${minutes} minute${minutes === 1 ? "" : "s"}`;
const audioUrl = (minutes) => `${AUDIO_BASE}timer-${minutes}.mp3`;

function setStatus(text) {
  statusEl.textContent = text;
}

function renderTimers() {
  for (const minutes of TIMERS) {
    const article = document.createElement("article");
    article.className = "timer";
    article.innerHTML = `
      <img class="timer-icon" src="timer/icons/timer-${minutes}.gif" alt="${label(minutes)} icon" />
      <div class="timer-body">
        <h2>${label(minutes)}</h2>
        <audio controls preload="none" src="timer/audio/timer-${minutes}.mp3"></audio>
      </div>`;
    timersEl.appendChild(article);
  }
}

async function assertPublished() {
  for (const minutes of TIMERS) {
    const url = audioUrl(minutes);
    const res = await fetch(url, { method: "HEAD" });
    if (!res.ok) {
      throw new Error(`${url} returned ${res.status} — commit and push timer/audio/ to GitHub Pages first.`);
    }
  }
}

// Animated GIFs must be uploaded as-is: autoConvert=true would flatten them
// to a static PNG. https://yoto.dev/icons/uploading-animated-gifs/
async function uploadAnimatedIcon(minutes, accessToken) {
  const gif = await (await fetch(`timer/icons/timer-${minutes}.gif`)).blob();
  const res = await fetch(`${ICON_UPLOAD_URL}?autoConvert=false&filename=timer-${minutes}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "image/gif" },
    body: gif,
  });
  if (!res.ok) {
    throw new Error(`Icon upload failed for ${label(minutes)}: ${res.status} ${await res.text()}`);
  }
  const { displayIcon } = await res.json();
  return `yoto:#${displayIcon.mediaId}`;
}

function buildChapter(minutes, index, icon) {
  const title = label(minutes);
  const display = { icon16x16: icon };
  return {
    key: String(index + 1).padStart(2, "0"),
    title,
    overlayLabel: String(minutes),
    display,
    tracks: [
      {
        key: "01",
        type: "stream",
        format: "mp3",
        title,
        trackUrl: audioUrl(minutes),
        display,
        // Stop at the end instead of rolling into the next timer.
        events: { onEnd: { cmd: "stop" } },
      },
    ],
  };
}

async function createTimerCard() {
  createButton.disabled = true;
  try {
    setStatus("Checking the mp3s are published...");
    await assertPublished();

    const accessToken = await getValidAccessToken();

    setStatus("Uploading animated icons...");
    const icons = await Promise.all(TIMERS.map((minutes) => uploadAnimatedIcon(minutes, accessToken)));

    setStatus("Generating a cover image...");
    const coverImageUrl = await uploadCoverImage(await generateDefaultCoverImage("Yoto Timer"), accessToken);

    setStatus("Creating the card...");
    const title = "Yoto Timer (prototype)";
    const res = await fetch(CONTENT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        content: { chapters: TIMERS.map((minutes, i) => buildChapter(minutes, i, icons[i])) },
        metadata: { description: "Countdown timers with spoken announcements", cover: { imageL: coverImageUrl } },
      }),
    });
    if (!res.ok) throw new Error(`Card creation failed: ${res.status} ${await res.text()}`);

    const cardId = (await res.json())?.card?.cardId;
    statusEl.textContent = `"${title}" created! `;
    if (cardId) {
      const link = document.createElement("a");
      link.href = `https://my.yotoplay.com/cards/${cardId}`;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "View your card →";
      statusEl.appendChild(link);
    }
  } catch (err) {
    setStatus(`Error: ${err.message}`);
  } finally {
    createButton.disabled = !isLoggedIn();
  }
}

renderTimers();
accountStatusEl.textContent = isLoggedIn()
  ? "Logged in to Yoto."
  : "Not logged in — log in on the main page first, then come back here.";
createButton.disabled = !isLoggedIn();
createButton.addEventListener("click", createTimerCard);
