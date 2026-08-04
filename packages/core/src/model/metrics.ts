import type { RateLimitWindow } from '../contract/status-input.js';
import type { SessionSnapshot, UsageSample } from './snapshot.js';

/**
 * Derived quantities.
 *
 * These are the numbers the tower reasons about but Claude Code does not provide:
 * how fast context is being consumed, how long until it runs out, how long until
 * a quota window resets. Everything here is a pure function of a snapshot, which
 * is what makes the health rules deterministic and cheap to test.
 */

/** Tokens consumed per minute, or `null` when there is not enough signal to say. */
export function contextBurnRate(samples: readonly UsageSample[]): number | null {
  if (samples.length < 2) return null;

  const first = samples[0];
  const last = samples[samples.length - 1];
  if (first === undefined || last === undefined) return null;

  const elapsedMinutes = (last.at - first.at) / 60_000;
  // Under ~6 seconds of span the rate is dominated by noise and produces wild
  // extrapolations. Reporting nothing is more useful than reporting a fantasy.
  if (elapsedMinutes < 0.1) return null;

  const growth = last.contextTokens - first.contextTokens;
  if (growth <= 0) return 0;

  return growth / elapsedMinutes;
}

/**
 * Minutes until the context window fills at the current rate.
 *
 * `null` when the rate is unknown or non-positive — a stable context has no
 * meaningful time-to-full, and pretending otherwise would produce a scary
 * countdown out of a perfectly healthy session.
 */
export function minutesUntilContextFull(snapshot: SessionSnapshot): number | null {
  const rate = snapshot.transcript ? contextBurnRate(snapshot.transcript.usageTimeline) : null;
  if (rate === null || rate <= 0) return null;

  const { context_window_size, total_input_tokens, total_output_tokens } =
    snapshot.input.context_window;
  const remaining = context_window_size - (total_input_tokens + total_output_tokens);
  if (remaining <= 0) return 0;

  return remaining / rate;
}

/** Milliseconds until a rate-limit window resets. Negative values are clamped to zero. */
export function millisUntilReset(window: RateLimitWindow, now: number): number {
  return Math.max(0, window.resets_at * 1000 - now);
}

/**
 * Tokens still available in the context window.
 *
 * Uses `context_window_size` rather than the fixed 200k of `exceeds_200k_tokens`,
 * so that 1M-context models report the truth instead of a permanent overflow.
 */
export function remainingContextTokens(snapshot: SessionSnapshot): number {
  const cw = snapshot.input.context_window;
  return Math.max(0, cw.context_window_size - (cw.total_input_tokens + cw.total_output_tokens));
}

/** Session cost divided by elapsed hours, or `null` before enough time has passed to be meaningful. */
export function costPerHour(snapshot: SessionSnapshot): number | null {
  const hours = snapshot.input.cost.total_duration_ms / 3_600_000;
  if (hours < 1 / 60) return null;
  return snapshot.input.cost.total_cost_usd / hours;
}

/**
 * Share of session wall-clock spent waiting on the API, in [0, 1].
 *
 * Low values mean the human is the bottleneck; high values mean the model is.
 */
export function apiTimeShare(snapshot: SessionSnapshot): number {
  const { total_duration_ms, total_api_duration_ms } = snapshot.input.cost;
  if (total_duration_ms <= 0) return 0;
  return Math.min(1, total_api_duration_ms / total_duration_ms);
}

/** Milliseconds since the last commit, or `null` outside a repo or before the first commit. */
export function millisSinceLastCommit(snapshot: SessionSnapshot): number | null {
  const lastCommitAt = snapshot.git?.lastCommitAt;
  if (lastCommitAt == null) return null;
  return Math.max(0, snapshot.now - lastCommitAt);
}

/** Total uncommitted files: staged, modified, untracked and conflicted. */
export function uncommittedFileCount(snapshot: SessionSnapshot): number {
  const git = snapshot.git;
  if (git === null) return 0;
  return git.staged + git.modified + git.untracked + git.conflicted;
}
