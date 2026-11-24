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

export function fitText(text: string, zone: Rect, direction: TextDirection, maxFontSize = 72, minFontSize = 20): FittedText {
  const words = text.trim().split(/\s+/).filter(Boolean);
  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 2) {
    const chars = Math.max(4, Math.floor(zone.width / (fontSize * 0.58)));
    const lines: string[] = []; let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length <= chars || !line) line = candidate;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    const lineHeight = Math.round(fontSize * 1.25);
    if (lines.length * lineHeight <= zone.height) return { lines, fontSize, lineHeight, direction };
  }
  return { lines: [text.slice(0, Math.max(1, Math.floor(zone.width / (minFontSize * 0.58))))], fontSize: minFontSize, lineHeight: Math.round(minFontSize * 1.25), direction };
}
