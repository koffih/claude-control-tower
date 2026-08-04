/**
 * `@cct/render` — the presentation layer of Claude Control Tower.
 *
 * This package turns domain values into terminal text. It owns colour, glyphs,
 * width and layout, and nothing else: it never decides *what* is worth showing,
 * only how to show it once something else has decided.
 */

export type {
  ColorDepth,
  GlyphSet,
  RenderEnvironment,
  TerminalCapabilities,
} from './ansi/capabilities.js';
export { detectCapabilities, PLAIN_CAPABILITIES } from './ansi/capabilities.js';

export type { Rgb, StyleOptions } from './ansi/style.js';
export { hex, stripAnsi, Styler } from './ansi/style.js';

export type { GaugeGlyphs, IconName } from './theme/icons.js';
export { gaugeGlyphs, icon, separator } from './theme/icons.js';

export type { Theme } from './theme/theme.js';
export { BUILTIN_THEMES, themeByName, TOWER_DARK, TOWER_LIGHT, TOWER_MONO } from './theme/theme.js';

export type { GaugeOptions } from './primitives/gauge.js';
export { renderGauge, severityForUsage } from './primitives/gauge.js';

export type { ComposeOptions, RenderedSegment, SegmentPriority } from './layout/compose.js';
export { composeBlock, composeLine } from './layout/compose.js';

export { codePointWidth, displayWidth, shortenPath, truncateToWidth } from './layout/width.js';
