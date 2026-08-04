import { formatCost } from '../../format/duration.js';
import { costPerHour } from '../../model/metrics.js';
import type { HealthThresholds } from '../thresholds.js';
import type { HealthRule } from '../types.js';

/**
 * Rules about spend.
 *
 * `cost.total_cost_usd` is a client-side estimate, so these rules speak in terms
 * of *rate* rather than absolute billing. A rate is directional advice the number
 * can support honestly; a bill is not.
 */

/** Fires when the session is burning money faster than a normal working pace. */
export function costVelocityRule(thresholds: HealthThresholds): HealthRule {
  return {
    id: 'cost-velocity',
    description: 'Warns when the session cost per hour rises above your threshold.',
    evaluate: (snapshot) => {
      const rate = costPerHour(snapshot);
      if (rate === null || rate < thresholds.cost.warnUsdPerHour) return null;

      return {
        ruleId: 'cost-velocity',
        severity: 'info',
        title: `${formatCost(rate)}/h`,
        advice: 'spend is running high - a smaller model or tighter context would slow it',
      };
    },
  };
}
