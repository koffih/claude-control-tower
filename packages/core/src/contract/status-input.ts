/**
 * The wire contract between Claude Code and any status line command.
 *
 * Claude Code writes this JSON object to our stdin on every render. These types
 * mirror the official schema documented at https://code.claude.com/docs/en/statusline
 * as of Claude Code 2.1.221.
 *
 * Two properties of this contract drive most of the design decisions downstream:
 *
 * 1. Many fields are *absent*, not null. `rate_limits` only exists for Claude.ai
 *    subscribers and only after the first API response; `pr` only exists while a
 *    PR is open. Optionality here is load-bearing, so it is modelled precisely
 *    and every consumer is forced by the type system to handle absence.
 *
 * 2. `context_window.current_usage` is genuinely nullable: it is `null` before
 *    the first API call and again after `/compact`. That is a different state
 *    from "absent" and is modelled as such.
 */

/** Identifies the model driving the session. */
export interface ModelInfo {
  readonly id: string;
  readonly display_name: string;
}

/** Repository identity parsed by Claude Code from the `origin` remote. */
export interface RepoInfo {
  readonly host: string;
  readonly owner: string;
  readonly name: string;
}

export interface WorkspaceInfo {
  readonly current_dir: string;
  readonly project_dir: string;
  readonly added_dirs: readonly string[];
  /** Present only when the current directory sits inside a linked git worktree. */
  readonly git_worktree?: string;
  /** Present only inside a git repository that has an `origin` remote. */
  readonly repo?: RepoInfo;
}

export interface CostInfo {
  /** Client-side estimate in USD. Resets to 0 when `/clear` starts a new session. */
  readonly total_cost_usd: number;
  readonly total_duration_ms: number;
  readonly total_api_duration_ms: number;
  readonly total_lines_added: number;
  readonly total_lines_removed: number;
}

/** Token counts from the most recent API call. Null before the first call and after `/compact`. */
export interface CurrentUsage {
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_creation_input_tokens: number;
  readonly cache_read_input_tokens: number;
}

export interface ContextWindowInfo {
  readonly total_input_tokens: number;
  readonly total_output_tokens: number;
  /** 200_000 by default, 1_000_000 for extended-context models. */
  readonly context_window_size: number;
  readonly used_percentage: number;
  readonly remaining_percentage: number;
  readonly current_usage: CurrentUsage | null;
}

/** One rate-limit window. Each window may be independently absent. */
export interface RateLimitWindow {
  readonly used_percentage: number;
  /** Unix epoch *seconds* when the window resets. */
  readonly resets_at: number;
}

export interface RateLimits {
  readonly five_hour?: RateLimitWindow;
  readonly seven_day?: RateLimitWindow;
}

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type VimMode = 'NORMAL' | 'INSERT' | 'VISUAL' | 'VISUAL LINE';

export type PullRequestReviewState = 'approved' | 'pending' | 'changes_requested' | 'draft';

export interface PullRequestInfo {
  readonly number: number;
  readonly url: string;
  /** May be absent even when the rest of `pr` is present. */
  readonly review_state?: PullRequestReviewState;
}

/** Present only during `--worktree` sessions. */
export interface WorktreeInfo {
  readonly name: string;
  readonly path: string;
  /** Absent for hook-based worktrees. */
  readonly branch?: string;
  readonly original_cwd: string;
  /** Absent for hook-based worktrees. */
  readonly original_branch?: string;
}

/**
 * The complete stdin payload.
 *
 * Treat every optional member as genuinely optional: Claude Code adds fields over
 * time, and a status line that assumes presence is a status line that breaks on
 * upgrade. `parseStatusInput` narrows unknown JSON into this shape defensively.
 */
export interface StatusInput {
  readonly cwd: string;
  readonly session_id: string;
  /** Custom `--name`/`/rename` value, or the AI-generated title. Absent when neither exists. */
  readonly session_name?: string;
  /** UUID of the prompt being processed. Absent until the first user input. */
  readonly prompt_id?: string;
  readonly transcript_path: string;
  readonly model: ModelInfo;
  readonly workspace: WorkspaceInfo;
  readonly version: string;
  readonly output_style: { readonly name: string };
  readonly cost: CostInfo;
  readonly context_window: ContextWindowInfo;
  /** Fixed 200k threshold, regardless of the actual context window size. */
  readonly exceeds_200k_tokens: boolean;
  readonly fast_mode: boolean;
  /** Absent when the current model does not support the effort parameter. */
  readonly effort?: { readonly level: EffortLevel };
  readonly thinking: { readonly enabled: boolean };
  /** Absent for non-subscribers and before the first API response of the session. */
  readonly rate_limits?: RateLimits;
  /** Absent unless vim mode is enabled. */
  readonly vim?: { readonly mode: VimMode };
  /** Absent unless running with `--agent` or configured agent settings. */
  readonly agent?: { readonly name: string };
  /** Absent until an open PR is found for the branch; removed once it merges or closes. */
  readonly pr?: PullRequestInfo;
  /** Absent outside `--worktree` sessions. */
  readonly worktree?: WorktreeInfo;
}
