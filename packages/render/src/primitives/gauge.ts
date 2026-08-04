import type { Severity } from '@cct/core';
import type { GlyphSet } from '../ansi/capabilities.js';
import type { Styler } from '../ansi/style.js';
import { gaugeGlyphs } from '../theme/icons.js';
import type { Theme } from '../theme/theme.js';

export interface GaugeOptions {
  /** Percentage filled, clamped into [0, 100]. */
  readonly percentage: number;
  /** Width in terminal cells. */
  readonly width: number;
  readonly severity: Severity;
  readonly theme: Theme;
  readonly styler: Styler;
  readonly glyphs: GlyphSet;
}

/**
 * A horizontal bar.
 *
 * The bar always occupies exactly `width` cells regardless of the value, so the
 * segments after it never shift as the percentage changes. A status line that
 * jitters as you work is a status line people turn off.
 *
 * Sub-cell precision comes from a half-block glyph, which buys roughly double the
 * apparent resolution in the same space — worth having when the whole gauge is
 * only eight cells wide.
 */
export function renderGauge(options: GaugeOptions): string {
  const { percentage, width, severity, theme, styler, glyphs } = options;
  if (width <= 0) return '';

  const glyph = gaugeGlyphs(glyphs);
  const clamped = Math.min(100, Math.max(0, percentage));
  const exactCells = (clamped / 100) * width;

  const fullCells = Math.floor(exactCells);
  // A half block earns its place only when there is a visible remainder and room
  // left to draw it; otherwise it would push the bar over its fixed width.
  const hasPartial = exactCells - fullCells >= 0.5 && fullCells < width;

  const filled = glyph.filled.repeat(fullCells);
  const partial = hasPartial ? glyph.partial : '';
  const empty = glyph.empty.repeat(Math.max(0, width - fullCells - (hasPartial ? 1 : 0)));

  const color = theme.severity(severity);
  return (
    styler.apply(filled + partial, { color }) + styler.apply(empty, { color: theme.gaugeEmpty })
  );
}

/**
 * Maps a "percentage used" onto a severity using the traffic-light contract.
 *
 * Kept here rather than in each caller so that the context gauge, the quota
 * gauges and any future gauge all break at the same visual boundaries. Thresholds
 * are passed in because the user configures them.
 */
export function severityForUsage(percentage: number, warnAt: number, criticalAt: number): Severity {
  if (percentage >= criticalAt) return 'critical';
  if (percentage >= warnAt) return 'warn';
  return 'ok';
}
