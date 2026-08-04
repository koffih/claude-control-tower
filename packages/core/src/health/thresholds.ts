/**
 * Every number a health rule compares against lives here.
 *
 * Thresholds are configuration, not logic. Hoisting them out of the rules means a
 * user can retune the tower to their own tolerance without forking a rule, and it
 * keeps the rules themselves readable as statements of intent rather than as
 * arithmetic.
 */
export interface HealthThresholds {
  readonly context: {
    /** Percentage of the context window at which to start warning. */
    readonly warnPercentage: number;
    readonly criticalPercentage: number;
    /** Warn when the window will fill within this many minutes at the current rate. */
    readonly warnMinutesToFull: number;
  };
  readonly quota: {
    readonly warnPercentage: number;
    readonly criticalPercentage: number;
  };
  readonly git: {
    /** Warn once this many files are uncommitted. */
    readonly warnUncommittedFiles: number;
    /** Warn once this long has passed since the last commit, in minutes. */
    readonly warnMinutesSinceCommit: number;
  };
  readonly cost: {
    /** Warn above this burn rate in USD per hour. */
    readonly warnUsdPerHour: number;
  };
}

/**
 * Defaults tuned for a working session, not for a demo.
 *
 * The context warning sits at 75% rather than a rounder 80% because `/compact`
 * itself needs headroom: being told to compact when there is no room left to do
 * it comfortably is advice that arrives too late to use.
 */
export const DEFAULT_THRESHOLDS: HealthThresholds = {
  context: {
    warnPercentage: 75,
    criticalPercentage: 90,
    warnMinutesToFull: 10,
  },
  quota: {
    warnPercentage: 80,
    criticalPercentage: 95,
  },
  git: {
    warnUncommittedFiles: 12,
    warnMinutesSinceCommit: 90,
  },
  cost: {
    warnUsdPerHour: 15,
  },
};
