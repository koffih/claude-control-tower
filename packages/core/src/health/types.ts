import type { SessionSnapshot } from '../model/snapshot.js';

/**
 * Severity ordering is the product's core promise: a glance at colour alone must
 * tell you whether to keep typing or to stop and act.
 *
 * - `ok`       nothing to say
 * - `info`     worth knowing, costs nothing to ignore
 * - `warn`     act soon, on your own terms
 * - `critical` act now, or the session degrades
 */
export type Severity = 'ok' | 'info' | 'warn' | 'critical';

const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  ok: 0,
  info: 1,
  warn: 2,
  critical: 3,
};

export function severityRank(severity: Severity): number {
  return SEVERITY_RANK[severity];
}

/** Returns the more urgent of two severities. */
export function maxSeverity(a: Severity, b: Severity): Severity {
  return severityRank(a) >= severityRank(b) ? a : b;
}

/**
 * A single actionable observation.
 *
 * `advice` is the reason this project exists. Any dashboard can show that context
 * is at 87%; the tower tells you what to do about it, in one line, without making
 * you think. Rules that cannot offer advice should not fire at all.
 */
export interface Finding {
  readonly ruleId: string;
  readonly severity: Severity;
  /** Two or three words for the compact badge, e.g. `context 87%`. */
  readonly title: string;
  /** One imperative line. No trailing period, no hedging. */
  readonly advice: string;
}

/**
 * A health rule maps a snapshot to at most one finding.
 *
 * Rules are pure and independent: they never read the filesystem, never depend on
 * each other's output, and never mutate the snapshot. That is what makes the set
 * safely extensible by contributors — adding a rule cannot break an existing one.
 */
export interface HealthRule {
  /** Stable kebab-case identifier. Used for muting in user config, so it is API. */
  readonly id: string;
  /** One sentence, shown by `cct doctor --rules`. */
  readonly description: string;
  /** Function-typed property, not a method: a rule never needs `this`. */
  readonly evaluate: (snapshot: SessionSnapshot) => Finding | null;
}

/** The outcome of running every rule against one snapshot. */
export interface HealthReport {
  /** Findings sorted by descending severity, then by rule id for stable output. */
  readonly findings: readonly Finding[];
  /** The highest severity present, or `ok` when nothing fired. */
  readonly overall: Severity;
}
