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

  // If text overflows maxLines, keep remaining words on the last line (never truncate with ellipsis).
  const consumed = lines.join(" ").split(/\s+/).filter(Boolean).length;
  if (consumed < words.length && lines.length > 0) {
    lines[lines.length - 1] = words.slice(consumed - (lines[lines.length - 1]?.split(/\s+/).filter(Boolean).length ?? 0)).join(" ");
    // Fallback: ensure all remaining words are included on last line
    const used = lines.slice(0, -1).join(" ").split(/\s+/).filter(Boolean).length;
    lines[lines.length - 1] = words.slice(used).join(" ");
  }

  return lines.filter((l) => l.length > 0);
}

/**
 * Wrap text without truncation by dynamically reducing maxChars until it fits within maxLines.
 * Returns the chosen lines and an approximate scale factor for font sizing.
 */
export function wrapTextNoTruncate(
  text: string,
  maxChars: number,
  maxLines: number,
  minChars = 10,
): { lines: string[]; charsPerLine: number } {
  const chars = Math.max(maxChars, minChars);
  for (let c = chars; c >= minChars; c -= 1) {
    const lines = wrapText(text, c, maxLines);
    const joined = lines.join(" ").split(/\s+/).filter(Boolean).length;
    const total = text.trim().split(/\s+/).filter(Boolean).length;
    if (joined >= total && lines.length <= maxLines) {
      return { lines, charsPerLine: c };
    }
  }
  // Last resort: force all words into maxLines
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { lines: [], charsPerLine: maxChars };
  const perLine = Math.ceil(words.length / maxLines);
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += perLine) {
    lines.push(words.slice(i, i + perLine).join(" "));
  }
  return { lines: lines.slice(0, maxLines), charsPerLine: minChars };
}

