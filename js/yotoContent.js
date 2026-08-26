// Yoto content-creation API — POST /content creates a new MYO card.
// https://yoto.dev/myo/streaming-tracks/

import { mapCodecToFormat } from "./radioBrowser.js";
import { shortLabel, generatePixelIconDataUrl } from "./pixelIcon.js";

const CONTENT_URL = "https://api.yotoplay.com/content";
const COVER_UPLOAD_URL = "https://api.yotoplay.com/media/coverImage/user/me/upload";
const ICON_UPLOAD_URL = "https://api.yotoplay.com/media/displayIcons/user/me/upload";

function stationToChapter(station, index, display) {
  const key = String(index + 1).padStart(2, "0");
  const title = station.name || `Station ${index + 1}`;

  return {
    key,
    title,
    overlayLabel: String(index + 1),
    display,
    tracks: [
      {
        key: "01",
        type: "stream",
        format: mapCodecToFormat(station.codec),
        title,
        trackUrl: station.url_resolved,
        display,
      },
    ],
  };
}

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

export async function uploadStationIcon(dataUrl, accessToken) {
  const blob = await dataUrlToBlob(dataUrl);

  // Like the cover-image upload, the docs say multipart/form-data works, but
  // (per the same discrepancy we found there) the server actually wants the
  // raw image bytes as the request body, not wrapped in a form field.
  const res = await fetch(`${ICON_UPLOAD_URL}?autoConvert=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": blob.type || "image/png",
    },
    body: blob,
  });

  if (!res.ok) {
    throw new Error(`Icon upload failed: ${res.status} ${await res.text()}`);
  }

  const { displayIcon } = await res.json();
  return `yoto:#${displayIcon.mediaId}`;
}

// One pixel-text icon per station, generated + uploaded to Yoto in parallel.
// A station's own icon isn't allowed to fail card creation — fall back to
// its favicon (or no icon at all) if the pixel-text tool or upload fails.
async function stationDisplay(station, accessToken) {
  try {
    const dataUrl = await generatePixelIconDataUrl(shortLabel(station.name));
    const icon16x16 = await uploadStationIcon(dataUrl, accessToken);
    return { icon16x16 };
  } catch (err) {
    console.warn(`Pixel icon failed for "${station.name}", falling back:`, err);
    return station.favicon ? { iconUrl16x16: station.favicon } : {};
  }
}

export async function createCard({ title, stations, accessToken, coverImageUrl, onProgress }) {
  let done = 0;
  const displays = await Promise.all(stations.map(async (station) => {
    const display = await stationDisplay(station, accessToken);
    done += 1;
    onProgress?.(done, stations.length);
    return display;
  }));

  const metadata = { description: "Created with Yoto Radio Station Picker" };
  if (coverImageUrl) {
    metadata.cover = { imageL: coverImageUrl };
  }

  const body = {
    title,
    content: { chapters: stations.map((station, index) => stationToChapter(station, index, displays[index])) },
    metadata,
  };

  const res = await fetch(CONTENT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Card creation failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

export async function uploadCoverImage(file, accessToken) {
  const res = await fetch(`${COVER_UPLOAD_URL}?coverType=default`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": file.type || "image/png",
    },
    body: file,
  });

  if (!res.ok) {
    throw new Error(`Cover image upload failed: ${res.status} ${await res.text()}`);
  }

  const { coverImage } = await res.json();
  return coverImage.mediaUrl;
}
