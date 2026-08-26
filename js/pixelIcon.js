// Per-station icons via the YotoPixelText embeddable tool — renders short
// text as a 16x16 pixel icon, returned as a data: URL.
// https://github.com/dochoffiday/YotoPixelText
//
// Requires <script src="https://dochoffiday.github.io/YotoPixelText/assets/embed.js">
// to be loaded on the page (sets up window.YotoIconEmbed) before this is called.

const ICON_COLOR = "f45436";
const ICON_BACKGROUND = "transparent";

// The renderer auto-wraps onto a second line (breaking on a space near the
// middle) when text doesn't fit on one, so this only needs to cap total
// length, not force everything onto a single word — that's what was
// chopping names like "WORDFM" into "WORDF" instead of letting it wrap to
// "WOR" / "DFM". Keep whole words up to ~9 characters (roughly two lines'
// worth) so the split lands on a word boundary when there is one.
// Characters outside the font's supported set (see the bitmap font in
// https://dochoffiday.github.io/YotoPixelText/assets/icon.js) are dropped
// rather than falling back to "?" glyphs.
const SUPPORTED_CHARS = /[^A-Z0-9 .,\-:/!?'&+%#()]/g;
const TARGET_LENGTH = 9;

export function shortLabel(name) {
  const cleaned = (name || "").toUpperCase().trim().replace(SUPPORTED_CHARS, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "??";

  const words = cleaned.split(" ");
  let result = "";
  for (const word of words) {
    const candidate = result ? `${result} ${word}` : word;
    if (result && candidate.length > TARGET_LENGTH) break;
    result = candidate;
    if (result.length >= TARGET_LENGTH) break;
  }
  return result;
}

export function generatePixelIconDataUrl(text) {
  if (!window.YotoIconEmbed) {
    return Promise.reject(new Error("YotoPixelText embed script isn't loaded."));
  }
  return window.YotoIconEmbed.getDataUrl({ text, color: ICON_COLOR, background: ICON_BACKGROUND });
}
