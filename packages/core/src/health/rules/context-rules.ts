import { formatDuration, formatPercentage, formatTokens } from '../../format/duration.js';
import { minutesUntilContextFull, remainingContextTokens } from '../../model/metrics.js';
import { cacheHitRatio } from '../../model/snapshot.js';
import type { HealthThresholds } from '../thresholds.js';
import type { HealthRule } from '../types.js';

/**
 * Rules about the context window — the resource that most often ends a session
 * badly, and the one users have the least visibility into.
 */

/** Fires on how full the window is right now. */
export function contextPressureRule(thresholds: HealthThresholds): HealthRule {
  return {
    id: 'context-pressure',
    description: 'Warns as the context window fills, and tells you when to compact.',
    evaluate: (snapshot) => {
      const used = snapshot.input.context_window.used_percentage;
      const remaining = remainingContextTokens(snapshot);
      const title = `context ${formatPercentage(used)}`;

      if (used >= thresholds.context.criticalPercentage) {
        return {
          ruleId: 'context-pressure',
          severity: 'critical',
          title,
          advice: `run /compact now - only ${formatTokens(remaining)} tokens left`,
        };
      }

      if (used >= thresholds.context.warnPercentage) {
        return {
          ruleId: 'context-pressure',
          severity: 'warn',
          title,
          advice: `wrap up the current step, then /compact (${formatTokens(remaining)} left)`,
        };
      }

      return null;
    },
  };
}

/**
 * Fires on how *fast* the window is filling.
 *
 * This is the rule that earns its keep: a session at 40% that is climbing 12k
 * tokens a minute is in more trouble than one parked at 80%, and no raw gauge
 * shows that.
 */
export function contextVelocityRule(thresholds: HealthThresholds): HealthRule {
  return {
    id: 'context-velocity',
    description: 'Warns when the context window is on track to fill within minutes.',
    evaluate: (snapshot) => {
      const minutes = minutesUntilContextFull(snapshot);
      if (minutes === null) return null;

      // Once the window is already critically full, `context-pressure` owns the
      // message. Two rules shouting about the same problem is noise.
      if (snapshot.input.context_window.used_percentage >= thresholds.context.criticalPercentage) {
        return null;
      }

      if (minutes > thresholds.context.warnMinutesToFull) return null;

      const humanised = formatDuration(minutes * 60_000);
      return {
        ruleId: 'context-velocity',
        severity: minutes <= thresholds.context.warnMinutesToFull / 2 ? 'warn' : 'info',
        title: `full in ${humanised}`,
        advice: `context is filling fast - finish this task before it forces a compact`,
      };
    },
  };
}

/**
 * Fires when cached input collapses.
 *
 * A healthy long session reads most of its input from cache. When that ratio
 * falls away the same conversation suddenly costs several times more, and the
 * usual cause is something the user can actually fix.
 */
export function cacheEfficiencyRule(): HealthRule {
  const MINIMUM_TOKENS_TO_JUDGE = 50_000;
  const POOR_RATIO = 0.5;

  return {
    id: 'cache-efficiency',
    description: 'Warns when little of the input is served from cache, inflating cost.',
    evaluate: (snapshot) => {
      const transcript = snapshot.transcript;
      if (transcript === null) return null;

      const { cumulative } = transcript;
      const total = cumulative.input + cumulative.cacheRead + cumulative.cacheCreation;
      // Early in a session the ratio is meaningless — there is nothing to cache yet.
      if (total < MINIMUM_TOKENS_TO_JUDGE) return null;

      const ratio = cacheHitRatio(cumulative);
      if (ratio >= POOR_RATIO) return null;

      return {
        ruleId: 'cache-efficiency',
        severity: 'info',
        title: `cache ${formatPercentage(ratio * 100)}`,
        advice: 'cache reuse is low - avoid editing files already in context to keep it warm',
      };
    },
  };
}
