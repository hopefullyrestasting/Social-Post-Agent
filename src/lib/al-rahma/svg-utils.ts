/** Small, dependency-free helpers shared by the SVG renderers. */

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Greedy word wrap tuned for Arabic SVG text (no glyph measurement). */
export function wrapText(text: string, maxChars: number, maxLines = 3): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines - 1) break;
  }

  if (current && lines.length < maxLines) lines.push(current);

  const consumed = lines.join(" ").split(/\s+/).filter(Boolean).length;
  if (consumed < words.length) {
    const last = lines[lines.length - 1] ?? "";
    lines[lines.length - 1] = `${last.replace(/\s+\S*$/, "")} …`;
  }

  return lines;
}
