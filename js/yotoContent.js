// Yoto content-creation API — POST /content creates a new MYO card.
// https://yoto.dev/myo/streaming-tracks/

import { mapCodecToFormat } from "./radioBrowser.js";

const CONTENT_URL = "https://api.yotoplay.com/content";
const COVER_UPLOAD_URL = "https://api.yotoplay.com/media/coverImage/user/me/upload";

function stationToChapter(station, index) {
  const key = String(index + 1).padStart(2, "0");
  const title = station.name || `Station ${index + 1}`;
  // iconUrl16x16 needs a URL Yoto's servers can fetch — a station's own
  // favicon works, but our local fallback icon won't until this is deployed.
  const display = station.favicon ? { iconUrl16x16: station.favicon } : {};

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

export async function createCard({ title, stations, accessToken, coverImageUrl }) {
  const metadata = { description: "Created with Yoto Radio Station Picker" };
  if (coverImageUrl) {
    metadata.cover = { imageL: coverImageUrl };
  }

  const body = {
    title,
    content: { chapters: stations.map(stationToChapter) },
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
