import type { HealthReport, HealthRule, SessionSnapshot } from '@cct/core';
import type {
  GlyphSet,
  IconName,
  SegmentPriority,
  Styler,
  TerminalCapabilities,
  Theme,
} from '@cct/render';

/**
 * The public plugin contract.
 *
 * This is the API the project promises to contributors, and the one place where
 * breaking a signature breaks other people's work. It is therefore deliberately
 * small: a plugin contributes *segments* (things to draw) and *rules* (things to
 * say), and nothing else.
 *
 * Three constraints are load-bearing, and every one of them exists to protect the
 * user's terminal from a plugin the maintainers have never seen:
 *
 *  - **Segments are synchronous.** A plugin cannot perform I/O during rendering.
 *    Anything a plugin needs from the outside world must already be in the
 *    snapshot. This is what makes the render path's time budget enforceable
 *    rather than aspirational.
 *
 *  - **Segments return text, not escape sequences.** Colour is applied through
 *    the provided `Styler`, so a plugin automatically inherits theme support,
 *    colour degradation and `NO_COLOR` without knowing any of it exists.
 *
 *  - **Failure is contained.** A segment that throws is dropped; it never blanks
 *    the line. The host guarantees this, so plugin authors are free to write
 *    direct code rather than defensive code.
 */

/** Everything a segment is given at render time. */
export interface SegmentContext {
  readonly snapshot: SessionSnapshot;
  /**
   * The evaluated health report for this frame.
   *
   * Rules run before segments precisely so that a segment can render *what the
   * tower concluded* rather than re-deriving it. Two components computing the
   * same severity from the same data is how a dashboard ends up contradicting
   * itself.
   */
  readonly health: HealthReport;
  readonly theme: Theme;
  readonly styler: Styler;
  readonly capabilities: TerminalCapabilities;
  /** Resolves an icon for the active glyph tier. Always prefer this to a literal glyph. */
  readonly icon: (name: IconName) => string;
  /** The active glyph tier, for the rare segment that needs to branch on it. */
  readonly glyphs: GlyphSet;
}

/**
 * Which row of the tower a segment belongs to.
 *
 * The four rows are a fixed information architecture rather than a free-form
 * canvas: identity, then session health, then development activity, then agents
 * and infrastructure. A user's eye learns where to look once, and every plugin
 * respects that map.
 */
export type LineId = 'identity' | 'health' | 'activity' | 'infra';

export const LINE_ORDER: readonly LineId[] = ['identity', 'health', 'activity', 'infra'];

/** One contributed piece of a line. */
export interface Segment {
  /** Stable, unique, kebab-case. Used in config to reorder or disable, so it is API. */
  readonly id: string;
  readonly line: LineId;
  /** How strongly this resists being dropped when the terminal is narrow. */
  readonly priority: SegmentPriority;
  /**
   * Renders the segment, or returns `null` to draw nothing this frame.
   *
   * Returning `null` is the normal way to express "not applicable" — no PR open,
   * not in a repo, no quota data. Never render a placeholder for absent data.
   *
   * Declared as a function-typed property rather than a method: a segment never
   * needs `this`, and the property form makes it safe for the registry to hold
   * and call the function detached from its object.
   */
  readonly render: (context: SegmentContext) => string | null;
}

/**
 * A plugin: a named bundle of segments and rules.
 *
 * Bundling them is intentional. A plugin that draws a quota gauge should also own
 * the rule that advises on quota, so that enabling or disabling the plugin moves
 * both together and the tower never advises about something it is not showing.
 */
export interface Plugin {
  /** Stable, unique, kebab-case. */
  readonly id: string;
  /** One sentence, shown by `cct plugins`. */
  readonly description: string;
  readonly segments?: readonly Segment[];
  readonly rules?: readonly HealthRule[];
}

/** Identity function that pins a plugin to the contract without widening its type. */
export function definePlugin<const T extends Plugin>(plugin: T): T {
  return plugin;
}

/** Identity function that pins a segment to the contract without widening its type. */
export function defineSegment<const T extends Segment>(segment: T): T {
  return segment;
}
