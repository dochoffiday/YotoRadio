// Generates a default cover (title text + the pixel radio logo) for cards
// where the user didn't upload their own image. Sized to Yoto's "default"
// coverType (638x1011, portrait) — that's the aspect ratio cards actually
// render at, not the "radio"/"podcast" square dimensions the docs also list.

const WIDTH = 638;
const HEIGHT = 1011;
const BG = "#ffffff";
const FG = "#201c1a";
const LOGO_URL = "img/logo-radio.png";

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function wrapLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fitTitle(ctx, title, maxWidth, maxLines) {
  for (let size = 64; size >= 32; size -= 4) {
    ctx.font = `700 ${size}px Fredoka, sans-serif`;
    const lines = wrapLines(ctx, title, maxWidth);
    if (lines.length <= maxLines) return { lines, size };
  }
  ctx.font = "700 32px Fredoka, sans-serif";
  const lines = wrapLines(ctx, title, maxWidth).slice(0, maxLines);
  return { lines, size: 32 };
}

export async function generateDefaultCoverImage(title) {
  await document.fonts.load("700 64px Fredoka");
  const logo = await loadImage(LOGO_URL);

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = FG;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const { lines, size } = fitTitle(ctx, title, WIDTH - 90, 4);
  ctx.font = `700 ${size}px Fredoka, sans-serif`;
  const lineHeight = size * 1.2;
  const textBlockHeight = lines.length * lineHeight;
  const textTop = 110;
  lines.forEach((line, i) => {
    ctx.fillText(line, WIDTH / 2, textTop + i * lineHeight + lineHeight / 2);
  });

  // Centre the logo in whatever vertical space is left below the title.
  const bottomMargin = 110;
  const logoAreaTop = textTop + textBlockHeight + 50;
  const logoAreaHeight = HEIGHT - bottomMargin - logoAreaTop;
  const logoSize = Math.min(420, WIDTH - 160, logoAreaHeight);
  const logoTop = logoAreaTop + (logoAreaHeight - logoSize) / 2;
  ctx.drawImage(logo, (WIDTH - logoSize) / 2, logoTop, logoSize, logoSize);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  return new File([blob], "cover.png", { type: "image/png" });
}
