// Thin wrapper around the radio-browser.info API.
// https://api.radio-browser.info/

const API_BASE = "https://de1.api.radio-browser.info";
const USER_AGENT = "yoto-radio-picker/0.1 (github.com/aj/YotoRadio)";

export async function searchStations({ name = "", tag = "", countrycode = "", limit = 30 } = {}) {
  const params = new URLSearchParams({
    limit: String(limit),
    hidebroken: "true",
    order: "clickcount",
    reverse: "true",
  });
  if (name) params.set("name", name);
  if (tag) params.set("tag", tag);
  if (countrycode) params.set("countrycode", countrycode);

  const res = await fetch(`${API_BASE}/json/stations/search?${params.toString()}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`radio-browser search failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// Countries, for a dropdown instead of free-text: the search endpoint's
// `country` param is a case-sensitive substring match (e.g. "United States"
// works but "united states" doesn't), while `countrycode` is a reliable
// case-insensitive ISO 3166-1 code — so we look the code up here.
export async function fetchCountries() {
  const res = await fetch(`${API_BASE}/json/countries`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`radio-browser countries lookup failed: ${res.status} ${res.statusText}`);
  }
  const countries = await res.json();
  return countries
    .filter((c) => c.name && c.iso_3166_1 && c.stationcount > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Courtesy call so radio-browser knows the station was actually used.
// https://api.radio-browser.info/#Count-server-click
export async function registerClick(stationuuid) {
  try {
    await fetch(`${API_BASE}/json/url/${stationuuid}`, {
      headers: { "User-Agent": USER_AGENT },
    });
  } catch {
    // Best-effort only; never block the UI on this.
  }
}

export function isPlayable(station) {
  return !station.hls;
}

// Yoto's stream track schema wants "mp3" or "aac". Anything else we can't
// confidently map, so callers should treat a null return as unsupported.
export function mapCodecToFormat(codec) {
  const normalized = (codec || "").trim().toUpperCase();
  if (normalized === "MP3") return "mp3";
  if (normalized.startsWith("AAC")) return "aac";
  return null;
}
