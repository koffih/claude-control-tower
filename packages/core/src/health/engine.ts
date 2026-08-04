import type { SessionSnapshot } from '../model/snapshot.js';
import {
  cacheEfficiencyRule,
  contextPressureRule,
  contextVelocityRule,
} from './rules/context-rules.js';
import { costVelocityRule } from './rules/cost-rules.js';
import {
  detachedHeadRule,
  gitOperationRule,
  mergeConflictRule,
  uncommittedWorkRule,
} from './rules/git-rules.js';
import { fiveHourQuotaRule, sevenDayQuotaRule } from './rules/quota-rules.js';
import { DEFAULT_THRESHOLDS, type HealthThresholds } from './thresholds.js';
import {
  maxSeverity,
  severityRank,
  type Finding,
  type HealthReport,
  type HealthRule,
} from './types.js';

/** The rule set shipped by default, in no particular order — the engine sorts the output. */
export function builtinRules(thresholds: HealthThresholds = DEFAULT_THRESHOLDS): HealthRule[] {
  return [
    contextPressureRule(thresholds),
    contextVelocityRule(thresholds),
    cacheEfficiencyRule(),
    fiveHourQuotaRule(thresholds),
    sevenDayQuotaRule(thresholds),
    uncommittedWorkRule(thresholds),
    gitOperationRule(),
    mergeConflictRule(),
    detachedHeadRule(),
    costVelocityRule(thresholds),
  ];
}

export interface EvaluateOptions {
  /** Rule ids the user has silenced. */
  readonly muted?: readonly string[];
}

/**
 * Runs every rule against a snapshot and collates the findings.
 *
 * A rule that throws is skipped rather than allowed to take down the render. This
 * matters more than it looks: third-party plugins contribute rules through the
 * same interface, and one buggy community rule must never blank a user's status
 * line. Isolation here is what makes the plugin system safe to open up.
 */
export function evaluateHealth(
  snapshot: SessionSnapshot,
  rules: readonly HealthRule[] = builtinRules(),
  options: EvaluateOptions = {},
): HealthReport {
  const muted = new Set(options.muted ?? []);
  const findings: Finding[] = [];

  for (const rule of rules) {
    if (muted.has(rule.id)) continue;
    try {
      const finding = rule.evaluate(snapshot);
      if (finding !== null) findings.push(finding);
    } catch {
      // Intentionally swallowed: see the note above. `cct doctor` surfaces
      // misbehaving rules where the diagnosis belongs.
    }
  }

  findings.sort(
    (a, b) =>
      severityRank(b.severity) - severityRank(a.severity) || a.ruleId.localeCompare(b.ruleId),
  );

  const overall = findings.reduce<HealthReport['overall']>(
    (worst, finding) => maxSeverity(worst, finding.severity),
    'ok',
  );

  return { findings, overall };
}

/**
 * The single most useful thing to tell the user right now, or `null` when all is well.
 *
 * The status line has room for exactly one line of advice. Showing the most severe
 * finding and nothing else is a deliberate constraint: a list of five suggestions
 * is a list nobody reads.
 */
export function primaryAdvice(report: HealthReport): Finding | null {
  return report.findings[0] ?? null;
}
