import { formatCountdown, formatPercentage } from '../../format/duration.js';
import { millisUntilReset } from '../../model/metrics.js';
import type { RateLimitWindow } from '../../contract/status-input.js';
import type { HealthThresholds } from '../thresholds.js';
import type { Finding, HealthRule } from '../types.js';

/**
 * Rules about subscription rate limits.
 *
 * `rate_limits` is absent for non-subscribers and before the first API response
 * of a session, so both rules treat absence as "nothing to say" rather than as an
 * error. Silence is the correct output for a user who has no quota to track.
 */

function evaluateWindow(
  ruleId: string,
  label: string,
  window: RateLimitWindow | undefined,
  now: number,
  thresholds: HealthThresholds,
  criticalAdvice: (resetIn: string) => string,
  warnAdvice: (resetIn: string) => string,
): Finding | null {
  if (window === undefined) return null;

  const used = window.used_percentage;
  if (used < thresholds.quota.warnPercentage) return null;

  const resetIn = formatCountdown(millisUntilReset(window, now));
  const title = `${label} ${formatPercentage(used)}`;

  return {
    ruleId,
    severity: used >= thresholds.quota.criticalPercentage ? 'critical' : 'warn',
    title,
    advice:
      used >= thresholds.quota.criticalPercentage ? criticalAdvice(resetIn) : warnAdvice(resetIn),
  };
}

/** The window that actually interrupts people mid-task. */
export function fiveHourQuotaRule(thresholds: HealthThresholds): HealthRule {
  return {
    id: 'quota-five-hour',
    description: 'Warns as the 5-hour rate limit fills, with the time it resets.',
    evaluate: (snapshot) => {
      return evaluateWindow(
        'quota-five-hour',
        '5h',
        snapshot.input.rate_limits?.five_hour,
        snapshot.now,
        thresholds,
        (resetIn) => `5h limit nearly spent - it resets ${resetIn}, save the heavy work for then`,
        (resetIn) => `5h limit is filling - resets ${resetIn}, consider a lighter model meanwhile`,
      );
    },
  };
}

/** The window that ends weeks rather than afternoons, so its advice is about pacing. */
export function sevenDayQuotaRule(thresholds: HealthThresholds): HealthRule {
  return {
    id: 'quota-seven-day',
    description: 'Warns as the 7-day rate limit fills, with the time it resets.',
    evaluate: (snapshot) => {
      return evaluateWindow(
        'quota-seven-day',
        '7d',
        snapshot.input.rate_limits?.seven_day,
        snapshot.now,
        thresholds,
        (resetIn) => `7d limit nearly spent - it resets ${resetIn}, ration what is left`,
        (resetIn) => `7d limit is filling - resets ${resetIn}, pace the rest of the week`,
      );
    },
  };
}
