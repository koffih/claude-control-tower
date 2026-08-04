import { stripAnsi } from '../ansi/style.js';

/**
 * Display width measurement.
 *
 * Laying out a status line means knowing how many terminal cells a string will
 * occupy, and that is not its `length`. Escape sequences occupy none, CJK and
 * emoji occupy two, and combining marks occupy zero. Getting this wrong shows up
 * as a status line that wraps and destroys the terminal layout — the single most
 * visible way this kind of tool can fail.
 *
 * We implement the narrow subset of UAX #11 that actually matters here rather
 * than taking a dependency: the cost of a package on the hot path is real, and
 * the ranges below cover everything a status line realistically renders.
 */

/** Ranges that occupy two terminal cells. Ordered, so lookup can binary-search. */
const WIDE_RANGES: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f], // Hangul Jamo
  [0x2e80, 0x303e], // CJK radicals, Kangxi
  [0x3041, 0x33ff], // Hiragana through CJK compatibility
  [0x3400, 0x4dbf], // CJK Extension A
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0xa000, 0xa4cf], // Yi
  [0xac00, 0xd7a3], // Hangul Syllables
  [0xf900, 0xfaff], // CJK Compatibility Ideographs
  [0xfe30, 0xfe6f], // CJK Compatibility Forms
  [0xff00, 0xff60], // Fullwidth Forms
  [0xffe0, 0xffe6], // Fullwidth signs
  [0x1f300, 0x1f64f], // Emoji: symbols, pictographs, emoticons
  [0x1f680, 0x1f6ff], // Emoji: transport and map symbols
  [0x1f900, 0x1f9ff], // Emoji: supplemental symbols and pictographs
  [0x1fa70, 0x1faff], // Emoji: symbols and pictographs extended-A
  [0x20000, 0x3fffd], // CJK Extension B and beyond
];

/** Ranges that occupy no cells: combining marks and variation selectors. */
const ZERO_WIDTH_RANGES: readonly (readonly [number, number])[] = [
  [0x0300, 0x036f], // Combining diacritical marks
  [0x200b, 0x200f], // Zero-width space through RTL mark
  [0xfe00, 0xfe0f], // Variation selectors — VS16 is what makes emoji render wide
  [0xfe20, 0xfe2f], // Combining half marks
];

function inRanges(code: number, ranges: readonly (readonly [number, number])[]): boolean {
  let low = 0;
  let high = ranges.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const range = ranges[mid];
    if (range === undefined) return false;
    if (code < range[0]) high = mid - 1;
    else if (code > range[1]) low = mid + 1;
    else return true;
  }

  return false;
}

/** Terminal cells occupied by a single code point. */
export function codePointWidth(code: number): number {
  // C0/C1 control characters render as nothing useful and should never be measured.
  if (code < 32 || (code >= 0x7f && code < 0xa0)) return 0;
  if (inRanges(code, ZERO_WIDTH_RANGES)) return 0;
  if (inRanges(code, WIDE_RANGES)) return 2;
  return 1;
}

/**
 * Terminal cells occupied by a string, ignoring any ANSI styling it carries.
 *
 * Nerd Font glyphs sit in the Private Use Area and are designed to occupy a
 * single cell, so they fall through to the default of 1 — which is correct, and
 * why the PUA is deliberately absent from `WIDE_RANGES`.
 */
export function displayWidth(text: string): number {
  const plain = stripAnsi(text);
  let width = 0;

  for (const character of plain) {
    const code = character.codePointAt(0);
    if (code !== undefined) width += codePointWidth(code);
  }

  return width;
}

/**
 * Truncates to a maximum display width, appending an ellipsis when it cuts.
 *
 * Styling is not preserved across the cut, so callers should truncate the raw
 * text before styling it rather than after.
 */
export function truncateToWidth(text: string, maxWidth: number, ellipsis = '…'): string {
  if (maxWidth <= 0) return '';
  if (displayWidth(text) <= maxWidth) return text;

  const ellipsisWidth = displayWidth(ellipsis);
  if (maxWidth <= ellipsisWidth) return ellipsis.slice(0, maxWidth);

  const budget = maxWidth - ellipsisWidth;
  let width = 0;
  let result = '';

  for (const character of stripAnsi(text)) {
    const code = character.codePointAt(0);
    const charWidth = code === undefined ? 0 : codePointWidth(code);
    if (width + charWidth > budget) break;
    result += character;
    width += charWidth;
  }

  return result + ellipsis;
}

/**
 * Shortens a filesystem path from the left, keeping the last `keep` components.
 *
 * Path is one of the least valuable things on the line but one of the longest, so
 * it is the first thing sacrificed when space runs short.
 */
export function shortenPath(path: string, keep = 2): string {
  const separator = path.includes('\\') ? '\\' : '/';
  const parts = path.split(/[\\/]/).filter((part) => part.length > 0);
  if (parts.length <= keep) return parts.join(separator);
  return `…${separator}${parts.slice(-keep).join(separator)}`;
}
