import type { TextContent, TextItem } from "pdfjs-dist/types/src/display/api";

export type ItemRange = { itemIndex: number; start: number; end: number };
export type Match = { start: number; end: number };

/**
 * Concatenate the page's text items (in reading order) into one raw string, and
 * record the [start, end) char range each text item occupies within it.
 *
 * `itemIndex` is the index in the FULL items array. react-pdf's customTextRenderer
 * iterates every item (skipping marked-content) and reports that same index, so the
 * two stay aligned. A trailing "\n" is added after items with `hasEOL` to preserve
 * word boundaries across lines.
 */
export function buildRanges(items: TextContent["items"]) {
  let pageText = "";
  const ranges: ItemRange[] = [];
  items.forEach((item, itemIndex) => {
    if (typeof (item as TextItem).str !== "string") return; // skip marked content
    const { str, hasEOL } = item as TextItem;
    const start = pageText.length;
    pageText += str;
    ranges.push({ itemIndex, start, end: pageText.length });
    if (hasEOL) pageText += "\n";
  });
  return { pageText, ranges };
}

/**
 * Build a whitespace-normalized copy of `raw` plus a map from each normalized-char
 * index back to the RAW index it came from (runs of whitespace collapse to a single
 * space mapped to the run's start). This lets us match on normalized text — robust to
 * PDF.js line-wrapping and odd spacing — while still reporting EXACT raw offsets, so
 * there is no index drift between matching and rendering.
 */
function buildNormalized(raw: string) {
  let norm = "";
  const map: number[] = [];
  let i = 0;
  while (i < raw.length) {
    if (/\s/.test(raw[i])) {
      const runStart = i;
      while (i < raw.length && /\s/.test(raw[i])) i++;
      norm += " ";
      map.push(runStart);
    } else {
      map.push(i);
      norm += raw[i];
      i++;
    }
  }
  map.push(raw.length); // sentinel: position just past the last char
  return { norm, map };
}

/** Find all occurrences of `phrase` in `pageText`, returning EXACT raw offsets. */
export function findMatches(pageText: string, phrase: string): Match[] {
  const needle = phrase.replace(/\s+/g, " ").trim().toLowerCase();
  if (!needle) return [];

  const { norm, map } = buildNormalized(pageText);
  const hay = norm.toLowerCase();

  const matches: Match[] = [];
  let i = hay.indexOf(needle);
  while (i !== -1) {
    // needle is trimmed, so its first & last matched chars are non-space and map 1:1
    // to raw chars; hence rawEnd = (raw index of last char) + 1.
    const start = map[i];
    const end = map[i + needle.length - 1] + 1;
    matches.push({ start, end });
    i = hay.indexOf(needle, i + 1);
  }
  return matches;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

export const escapeHtml = (s: string): string =>
  s.replace(/[&<>]/g, (c) => HTML_ESCAPES[c]);

/**
 * Return one text item's content as an HTML string, wrapping the slice(s) that overlap
 * any match in <mark class="pdf-flash">. Items with no overlap return their escaped
 * text. (react-pdf sanitizes this HTML but preserves <mark class=...>.)
 */
export function renderItemHtml(
  str: string,
  range: ItemRange,
  matches: Match[],
  markClass = "pdf-flash"
): string {
  let html = "";
  let cursor = 0; // offset within `str`
  for (const m of matches) {
    const s = Math.max(m.start, range.start);
    const e = Math.min(m.end, range.end);
    if (s >= e) continue; // this match doesn't overlap this item
    const localStart = s - range.start;
    const localEnd = e - range.start;
    html += escapeHtml(str.slice(cursor, localStart));
    html += `<mark class="${markClass}">${escapeHtml(str.slice(localStart, localEnd))}</mark>`;
    cursor = localEnd;
  }
  html += escapeHtml(str.slice(cursor));
  return html;
}
