export type TextDirection = "rtl" | "ltr";

export interface Rect { x: number; y: number; width: number; height: number; }
export interface AdZones {
  logoZone: Rect; headlineZone: Rect; productZone: Rect;
  offerZone: Rect | null; priceZone: Rect | null; brandContactZone: Rect;
}
export interface FittedText { lines: string[]; fontSize: number; lineHeight: number; direction: TextDirection; }

const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

export function createAdZones(width: number, height: number, options: { offer?: boolean; price?: boolean } = {}): AdZones {
  const gutter = Math.round(width * 0.06);
  const logoZone = { x: width - gutter - 170, y: gutter, width: 170, height: 170 };
  const headlineZone = { x: gutter, y: gutter + 20, width: width - gutter * 2 - 190, height: Math.round(height * 0.18) };
  const brandContactZone = { x: 0, y: Math.round(height * 0.86), width, height: height - Math.round(height * 0.86) };
  const priceZone = options.price ? { x: gutter, y: brandContactZone.y - 150, width: 300, height: 110 } : null;
  const offerZone = options.offer ? { x: width - gutter - 300, y: brandContactZone.y - 150, width: 300, height: 110 } : null;
  return {
    logoZone, headlineZone,
    productZone: { x: gutter, y: headlineZone.y + headlineZone.height + 30, width: width - gutter * 2, height: (priceZone || offerZone ? brandContactZone.y - 190 : brandContactZone.y - 30) - (headlineZone.y + headlineZone.height + 30) },
    offerZone, priceZone, brandContactZone,
  };
}

export function assertZonesDoNotOverlap(zones: AdZones): boolean {
  const active = Object.values(zones).filter((zone): zone is Rect => Boolean(zone));
  return active.every((zone, index) => active.slice(index + 1).every(other => !overlap(zone, other)));
}

/** Estimated glyph advance for the Cairo/Tajawal display faces. */
const GLYPH_WIDTH_RATIO = 0.58;

function wrapWords(words: string[], chars: number): string[] {
  const lines: string[] = [];
  let line = "";
  const push = (word: string) => {
    if (!word) return;
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= chars || !line) {
      line = candidate;
      return;
    }
    lines.push(line);
    line = word;
  };
  for (const word of words) {
    // A single unbroken token must still respect the canvas width.
    if (word.length > chars) {
      let rest = word;
      while (rest.length > chars) {
        push(rest.slice(0, chars));
        rest = rest.slice(chars);
      }
      push(rest);
      continue;
    }
    push(word);
  }
  if (line) lines.push(line);
  return lines;
}

function clampLines(lines: string[], maxLines: number): string[] {
  return lines.slice(0, Math.max(1, maxLines));
}

/**
 * Fits copy into a safe zone for either text direction. Every returned line is
 * guaranteed to fit the zone width and the block is guaranteed not to exceed
 * the zone height, so callers never clip text off the canvas.
 */
export function fitText(text: string, zone: Rect, direction: TextDirection, maxFontSize = 72, minFontSize = 20): FittedText {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const width = Math.max(1, zone.width);
  const height = Math.max(1, zone.height);
  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 2) {
    const chars = Math.max(4, Math.floor(width / (fontSize * GLYPH_WIDTH_RATIO)));
    const lines = wrapWords(words, chars);
    const lineHeight = Math.round(fontSize * 1.25);
    if (lines.length * lineHeight <= height) return { lines, fontSize, lineHeight, direction };
  }

  // Pathological copy: shrink to the zone, then hard-wrap instead of clipping.
  let fontSize = minFontSize;
  let lineHeight = Math.round(fontSize * 1.25);
  if (lineHeight > height) {
    fontSize = Math.max(8, Math.floor(height / 1.25));
    lineHeight = Math.round(fontSize * 1.25);
  }
  const chars = Math.max(1, Math.floor(width / (fontSize * GLYPH_WIDTH_RATIO)));
  const maxLines = Math.max(1, Math.floor(height / lineHeight));
  const hardWrapped: string[] = [];
  const joined = words.join(" ");
  for (let index = 0; index < joined.length; index += chars) {
    hardWrapped.push(joined.slice(index, index + chars));
  }
  const lines = clampLines(hardWrapped, maxLines);
  return { lines: lines.length ? lines : [""], fontSize, lineHeight, direction };
}
