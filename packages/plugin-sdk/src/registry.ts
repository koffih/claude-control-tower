import type { HealthRule } from '@cct/core';
import type { RenderedSegment } from '@cct/render';
import type { LineId, Plugin, Segment, SegmentContext } from './contract.js';

/**
 * The plugin registry: resolves a set of plugins into renderable segments.
 *
 * Isolation is the whole job here. Third-party code runs inside this boundary and
 * a failure in it must cost the user one segment, never the status line. The
 * registry is what makes "plugins cannot break your terminal" a property of the
 * system rather than a hope about plugin authors.
 */

export interface RegistryOptions {
  /** Segment ids the user has disabled. */
  readonly disabledSegments?: readonly string[];
  /** Plugin ids the user has disabled. */
  readonly disabledPlugins?: readonly string[];
}

export interface SegmentFailure {
  readonly segmentId: string;
  readonly error: unknown;
}

export interface RenderResult {
  /** Rendered segments grouped by the line they belong to, in declaration order. */
  readonly byLine: ReadonlyMap<LineId, readonly RenderedSegment[]>;
  /** Segments that threw. Surfaced by `cct doctor`, silent during normal rendering. */
  readonly failures: readonly SegmentFailure[];
}

export class PluginRegistry {
  private readonly plugins: readonly Plugin[];
  private readonly disabledSegments: ReadonlySet<string>;

  constructor(plugins: readonly Plugin[], options: RegistryOptions = {}) {
    const disabledPlugins = new Set(options.disabledPlugins ?? []);
    this.plugins = plugins.filter((plugin) => !disabledPlugins.has(plugin.id));
    this.disabledSegments = new Set(options.disabledSegments ?? []);
  }

  /** Every enabled segment, in plugin declaration order. */
  segments(): readonly Segment[] {
    return this.plugins.flatMap((plugin) =>
      (plugin.segments ?? []).filter((segment) => !this.disabledSegments.has(segment.id)),
    );
  }

  /** Every rule contributed by an enabled plugin. */
  rules(): readonly HealthRule[] {
    return this.plugins.flatMap((plugin) => plugin.rules ?? []);
  }

  /**
   * Renders every segment, grouping by line.
   *
   * A segment that throws is recorded and skipped. A segment that returns `null`
   * or an empty string is omitted silently — that is its normal way of saying
   * "nothing to show", not a failure.
   */
  render(context: SegmentContext): RenderResult {
    const byLine = new Map<LineId, RenderedSegment[]>();
    const failures: SegmentFailure[] = [];

    for (const segment of this.segments()) {
      let text: string | null;

      try {
        text = segment.render(context);
      } catch (error) {
        failures.push({ segmentId: segment.id, error });
        continue;
      }

      if (text === null || text === '') continue;

      const existing = byLine.get(segment.line);
      const rendered: RenderedSegment = {
        id: segment.id,
        text,
        priority: segment.priority,
      };

      if (existing === undefined) byLine.set(segment.line, [rendered]);
      else existing.push(rendered);
    }

    return { byLine, failures };
  }
}

/**
 * Reports duplicate segment ids across a plugin set.
 *
 * Ids are how users disable and reorder segments, so a collision silently makes
 * configuration ambiguous. `cct doctor` calls this; the render path does not,
 * because a duplicate is a setup problem, not a per-frame one.
 */
export function findDuplicateSegmentIds(plugins: readonly Plugin[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const plugin of plugins) {
    for (const segment of plugin.segments ?? []) {
      if (seen.has(segment.id)) duplicates.add(segment.id);
      else seen.add(segment.id);
    }
  }

  return [...duplicates];
}
