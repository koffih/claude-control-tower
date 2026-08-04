/**
 * `@cct/core` — the domain layer of Claude Control Tower.
 *
 * This package knows what a session *is* and what is worth saying about it. It
 * performs no I/O, spawns no processes and prints nothing; it is a set of pure
 * functions over plain data. Everything you can reach from here is safe to call
 * in a test with a literal object.
 */

export type {
  ContextWindowInfo,
  CostInfo,
  CurrentUsage,
  EffortLevel,
  ModelInfo,
  PullRequestInfo,
  PullRequestReviewState,
  RateLimits,
  RateLimitWindow,
  RepoInfo,
  StatusInput,
  VimMode,
  WorkspaceInfo,
  WorktreeInfo,
} from './contract/status-input.js';
export {
  clampPercentage,
  parseStatusInput,
  parseStatusInputText,
} from './contract/parse-status-input.js';

export type {
  CumulativeTokens,
  GitOperation,
  GitState,
  SessionSnapshot,
  TerminalGeometry,
  TranscriptState,
  UsageSample,
} from './model/snapshot.js';
export { cacheHitRatio, totalInputTokens } from './model/snapshot.js';

export {
  apiTimeShare,
  contextBurnRate,
  costPerHour,
  millisSinceLastCommit,
  millisUntilReset,
  minutesUntilContextFull,
  remainingContextTokens,
  uncommittedFileCount,
} from './model/metrics.js';

export {
  formatCost,
  formatCountdown,
  formatDuration,
  formatPercentage,
  formatTokens,
} from './format/duration.js';

export type { Finding, HealthReport, HealthRule, Severity } from './health/types.js';
export { maxSeverity, severityRank } from './health/types.js';
export type { HealthThresholds } from './health/thresholds.js';
export { DEFAULT_THRESHOLDS } from './health/thresholds.js';
export type { EvaluateOptions } from './health/engine.js';
export { builtinRules, evaluateHealth, primaryAdvice } from './health/engine.js';

/**
 * Snapshot builders.
 *
 * Exported deliberately rather than confined to the test folder: plugin authors
 * need a realistic `SessionSnapshot` to test a segment against, and asking them
 * to hand-write one would mean every plugin's tests break whenever Claude Code
 * adds a payload field.
 */
export {
  baseGitState,
  baseStatusInput,
  baseTranscriptState,
  FIXTURE_NOW,
  makeSnapshot,
} from './testing/fixtures.js';
