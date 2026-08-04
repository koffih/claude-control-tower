import type { StatusInput } from '../contract/status-input.js';

/**
 * Everything the tower knows at one instant.
 *
 * A snapshot is the single input to rendering and to the health engine. It is a
 * plain, fully-resolved value: assembling it is the collectors' job, reasoning
 * about it is the domain's. Keeping that seam sharp is what lets every rule in
 * `health/` be tested with a literal object and no filesystem in sight.
 */
export interface SessionSnapshot {
  /** The verbatim payload Claude Code handed us. */
  readonly input: StatusInput;
  /** Repository state, or `null` when we are not inside a git repo. */
  readonly git: GitState | null;
  /** Facts derived from the session transcript. `null` when it could not be read in budget. */
  readonly transcript: TranscriptState | null;
  /** Wall-clock instant the snapshot was taken, in epoch milliseconds. */
  readonly now: number;
  /** Terminal geometry, read from the COLUMNS/LINES environment variables. */
  readonly terminal: TerminalGeometry;
}

export interface TerminalGeometry {
  readonly columns: number;
  readonly rows: number;
}

export interface GitState {
  /** Branch name, or `null` when HEAD is detached. */
  readonly branch: string | null;
  /** Short SHA of HEAD. `null` in a repository with no commits yet. */
  readonly head: string | null;
  readonly staged: number;
  readonly modified: number;
  readonly untracked: number;
  readonly conflicted: number;
  /** Commits ahead of the upstream branch. `null` when no upstream is configured. */
  readonly ahead: number | null;
  readonly behind: number | null;
  /** Epoch milliseconds of the last commit. `null` when there are no commits. */
  readonly lastCommitAt: number | null;
  /** True while a merge, rebase, cherry-pick or bisect is in progress. */
  readonly operationInProgress: GitOperation | null;
}

export type GitOperation = 'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'bisect';

/**
 * Facts read from the session transcript.
 *
 * Every figure here describes a **sampling window** — the tail of the transcript —
 * not the session as a whole. Reading a multi-megabyte transcript in full on
 * every render is not affordable, so the collector reads only the end of it. The
 * naming reflects that honestly, because a number labelled "total" that is not
 * one is worse than no number at all.
 */
export interface TranscriptState {
  /** Sidechain (subagent) turns seen in the sampled window. */
  readonly subagentTurns: number;
  /** Distinct subagent conversations seen in the sampled window. */
  readonly recentSubagents: number;
  /** Token counts summed over the sampled window. */
  readonly cumulative: CumulativeTokens;
  /** Samples used to compute burn rate, oldest first. */
  readonly usageTimeline: readonly UsageSample[];
}

export interface CumulativeTokens {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheCreation: number;
}

export interface UsageSample {
  readonly at: number;
  readonly contextTokens: number;
}

/** Total tokens billed as input, including both cache paths. */
export function totalInputTokens(tokens: CumulativeTokens): number {
  return tokens.input + tokens.cacheRead + tokens.cacheCreation;
}

/**
 * Share of input tokens served from cache, in [0, 1].
 *
 * A high ratio is the single clearest sign that a long session is still cheap;
 * a collapsing ratio usually means the context was just invalidated.
 */
export function cacheHitRatio(tokens: CumulativeTokens): number {
  const total = totalInputTokens(tokens);
  return total === 0 ? 0 : tokens.cacheRead / total;
}
