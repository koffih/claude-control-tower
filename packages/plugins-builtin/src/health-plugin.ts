import {
  DEFAULT_THRESHOLDS,
  formatCost,
  formatCountdown,
  formatDuration,
  formatPercentage,
  formatTokens,
  millisUntilReset,
  minutesUntilContextFull,
  remainingContextTokens,
  type HealthThresholds,
} from '@cct/core';
import { definePlugin, type Segment } from '@cct/plugin-sdk';
import { renderGauge, severityForUsage } from '@cct/render';

/**
 * Line 2 — session health.
 *
 * The reason the project exists. Everything on this line is a resource that runs
 * out: context, quota, money, time. Each is drawn with a gauge or a number *and*
 * a colour, never colour alone, so the line stays readable in a monochrome
 * terminal and to a colour-blind reader.
 */

/** Gauge width in cells. Wide enough to read a trend, narrow enough to survive a split pane. */
const CONTEXT_GAUGE_WIDTH = 10;
const QUOTA_GAUGE_WIDTH = 6;

/**
 * The context gauge.
 *
 * Marked `critical` priority because it is the single most useful thing on the
 * whole tower: it is the resource that ends sessions, and the one Claude Code
 * itself surfaces least.
 */
function contextSegment(thresholds: HealthThresholds): Segment {
  return {
    id: 'context',
    line: 'health',
    priority: 'critical',
    render: ({ snapshot, styler, theme, glyphs, icon }) => {
      const used = snapshot.input.context_window.used_percentage;
      const severity = severityForUsage(
        used,
        thresholds.context.warnPercentage,
        thresholds.context.criticalPercentage,
      );

      const gauge = renderGauge({
        percentage: used,
        width: CONTEXT_GAUGE_WIDTH,
        severity,
        theme,
        styler,
        glyphs,
      });

      const label = styler.apply(formatPercentage(used), { color: theme.severity(severity) });
      const remaining = styler.apply(`${formatTokens(remainingContextTokens(snapshot))} left`, {
        color: theme.muted,
      });

      return `${styler.apply(icon('context'), { color: theme.muted })} ${gauge} ${label} ${remaining}`;
    },
  };
}

/**
 * Projected time until the context window fills.
 *
 * Only drawn once the projection is short enough to act on. A permanent "full in
 * 4h" readout would be noise; "full in 6m" is a decision.
 */
function contextEtaSegment(thresholds: HealthThresholds): Segment {
  return {
    id: 'context-eta',
    line: 'health',
    priority: 'normal',
    render: ({ snapshot, styler, theme }) => {
      const minutes = minutesUntilContextFull(snapshot);
      if (minutes === null || minutes > thresholds.context.warnMinutesToFull * 3) return null;

      const severity = minutes <= thresholds.context.warnMinutesToFull ? 'warn' : 'info';
      return styler.apply(`full in ${formatDuration(minutes * 60_000)}`, {
        color: theme.severity(severity),
      });
    },
  };
}

/**
 * A rate-limit gauge.
 *
 * `rate_limits` is absent for users without a Claude.ai subscription and until
 * the first API response of a session, so this renders nothing rather than an
 * empty gauge. Drawing a permanently-zero bar to users who have no quota would be
 * both wrong and mildly insulting.
 */
function quotaSegment(
  id: string,
  label: string,
  select: (
    snapshot: Parameters<Segment['render']>[0]['snapshot'],
  ) => { used_percentage: number; resets_at: number } | undefined,
  thresholds: HealthThresholds,
): Segment {
  return {
    id,
    line: 'health',
    priority: 'high',
    render: ({ snapshot, styler, theme, glyphs }) => {
      const window = select(snapshot);
      if (window === undefined) return null;

      const severity = severityForUsage(
        window.used_percentage,
        thresholds.quota.warnPercentage,
        thresholds.quota.criticalPercentage,
      );

      const gauge = renderGauge({
        percentage: window.used_percentage,
        width: QUOTA_GAUGE_WIDTH,
        severity,
        theme,
        styler,
        glyphs,
      });

      const parts = [
        styler.apply(label, { color: theme.muted }),
        gauge,
        styler.apply(formatPercentage(window.used_percentage), {
          color: theme.severity(severity),
        }),
      ];

      // The reset time only matters once the window is actually under pressure.
      if (severity !== 'ok') {
        parts.push(
          styler.apply(formatCountdown(millisUntilReset(window, snapshot.now)), {
            color: theme.muted,
          }),
        );
      }

      return parts.join(' ');
    },
  };
}

const costSegment: Segment = {
  id: 'cost',
  line: 'health',
  priority: 'normal',
  render: ({ snapshot, styler, theme, icon }) => {
    const { total_cost_usd } = snapshot.input.cost;
    if (total_cost_usd <= 0) return null;

    return `${styler.apply(icon('cost'), { color: theme.muted })}${styler.apply(
      formatCost(total_cost_usd).replace('$', ''),
      { color: theme.text },
    )}`;
  },
};

const durationSegment: Segment = {
  id: 'duration',
  line: 'health',
  priority: 'low',
  render: ({ snapshot, styler, theme, icon }) => {
    const { total_duration_ms } = snapshot.input.cost;
    if (total_duration_ms <= 0) return null;

    return `${styler.apply(icon('clock'), { color: theme.muted })}${styler.apply(
      formatDuration(total_duration_ms),
      { color: theme.muted },
    )}`;
  },
};

/** Builds the health plugin against a threshold set, so the user's config reaches the gauges. */
export function createHealthPlugin(thresholds: HealthThresholds = DEFAULT_THRESHOLDS) {
  return definePlugin({
    id: 'health',
    description: 'Context window, rate limits, cost and session duration.',
    segments: [
      contextSegment(thresholds),
      contextEtaSegment(thresholds),
      quotaSegment(
        'quota-5h',
        '5h',
        (snapshot) => snapshot.input.rate_limits?.five_hour,
        thresholds,
      ),
      quotaSegment(
        'quota-7d',
        '7d',
        (snapshot) => snapshot.input.rate_limits?.seven_day,
        thresholds,
      ),
      costSegment,
      durationSegment,
    ],
  });
}

export const healthPlugin = createHealthPlugin();
