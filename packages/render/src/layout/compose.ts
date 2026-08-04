import { displayWidth, truncateToWidth } from './width.js';

/**
 * Responsive composition.
 *
 * The tower has no control over how wide the user's terminal is, and a line that
 * overflows wraps — which does not merely look bad, it pushes the prompt around
 * and corrupts the whole interface. So overflow is not allowed to happen: every
 * line is fitted to the available width by shedding its least important segments.
 *
 * Priority is the mechanism. Each segment declares how much it deserves to
 * survive, and the composer drops from the bottom until the line fits. The result
 * is a status line that degrades gracefully from an ultrawide monitor to a split
 * pane, showing progressively less rather than breaking.
 */

/**
 * How strongly a segment resists being dropped.
 *
 * `critical` is reserved for segments that are the reason the line exists at all —
 * an active alarm, not a nice-to-have. Anything decorative belongs at `low`.
 */
export type SegmentPriority = 'critical' | 'high' | 'normal' | 'low';

const PRIORITY_ORDER: Readonly<Record<SegmentPriority, number>> = {
  critical: 3,
  high: 2,
  normal: 1,
  low: 0,
};

/** One rendered, self-contained piece of a line. */
export interface RenderedSegment {
  /** Stable identifier of the producing segment, for debugging and tests. */
  readonly id: string;
  /** Final text, already styled. */
  readonly text: string;
  readonly priority: SegmentPriority;
}

export interface ComposeOptions {
  /** Total cells available for the line. */
  readonly maxWidth: number;
  /** Text placed between adjacent segments. */
  readonly separator: string;
}

/**
 * Fits segments into `maxWidth`, dropping the least important first.
 *
 * Drops are by ascending priority, then by descending width within a priority —
 * shedding the widest of the equally-unimportant segments frees the most space
 * for the fewest losses.
 *
 * Segment order in the output always follows the input order, regardless of what
 * was dropped: a line whose contents reshuffle as the terminal resizes is far
 * harder to read at a glance than one that simply gets shorter.
 */
export function composeLine(segments: readonly RenderedSegment[], options: ComposeOptions): string {
  const present = segments.filter((segment) => segment.text.length > 0);
  if (present.length === 0) return '';

  const separatorWidth = displayWidth(options.separator);
  const widths = new Map(present.map((segment) => [segment.id, displayWidth(segment.text)]));

  const widthOf = (kept: readonly RenderedSegment[]): number =>
    kept.reduce((total, segment) => total + (widths.get(segment.id) ?? 0), 0) +
    Math.max(0, kept.length - 1) * separatorWidth;

  let kept = [...present];
  if (widthOf(kept) <= options.maxWidth) {
    return kept.map((segment) => segment.text).join(options.separator);
  }

  // Establish the drop order once, then walk it. Recomputing the "worst" segment
  // after every drop would be quadratic for no behavioural gain.
  const dropOrder = [...present].sort((a, b) => {
    const byPriority = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (byPriority !== 0) return byPriority;
    return (widths.get(b.id) ?? 0) - (widths.get(a.id) ?? 0);
  });

  for (const candidate of dropOrder) {
    if (widthOf(kept) <= options.maxWidth) break;
    // Never drop the last segment standing: an empty line tells the user nothing,
    // whereas one truncated segment still tells them something.
    if (kept.length === 1) break;
    kept = kept.filter((segment) => segment.id !== candidate.id);
  }

  const line = kept.map((segment) => segment.text).join(options.separator);

  // Last resort. If even the single most important segment is wider than the
  // terminal, it is truncated rather than allowed to wrap: overflowing pushes the
  // prompt around and corrupts the interface, which is worse than losing the tail
  // of one label. Truncation drops styling, which is an acceptable price at a
  // width this extreme.
  return displayWidth(line) > options.maxWidth ? truncateToWidth(line, options.maxWidth) : line;
}

/**
 * Composes a block of lines, dropping whole lines that do not fit the row budget.
 *
 * Lines are dropped from the bottom, because the layout puts the most important
 * information first. The status line shares the terminal with the actual work, so
 * consuming every available row would be rude even when it is possible.
 */
export function composeBlock(lines: readonly string[], maxLines: number): string {
  return lines
    .filter((line) => line.trim().length > 0)
    .slice(0, Math.max(1, maxLines))
    .join('\n');
}
