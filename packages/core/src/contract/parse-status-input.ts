import type {
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
} from './status-input.js';

/**
 * Defensive narrowing of the stdin payload.
 *
 * We deliberately hand-roll this instead of pulling in a schema library. Two
 * reasons, in order of importance:
 *
 *  - **Resilience over validation.** A status line must never blank out because
 *    Claude Code shipped a field we did not expect, or dropped one we did. A
 *    strict validator fails closed; this parser fails *soft*, keeping every field
 *    it understands and defaulting the rest. Unknown extra fields are ignored.
 *
 *  - **Cost.** This runs on every render inside a 300ms budget. Importing and
 *    compiling a schema costs more than the parse itself saves.
 *
 * The trade-off is that this file must be kept in step with `status-input.ts` by
 * hand. The round-trip tests in `parse-status-input.test.ts` are what enforce it.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (value: unknown, fallback: string): string =>
  typeof value === 'string' ? value : fallback;

/** Coerces to a finite number; rejects NaN and Infinity, which would poison every downstream calculation. */
const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

const optionalStr = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;

const EFFORT_LEVELS: readonly EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];
const VIM_MODES: readonly VimMode[] = ['NORMAL', 'INSERT', 'VISUAL', 'VISUAL LINE'];
const REVIEW_STATES: readonly PullRequestReviewState[] = [
  'approved',
  'pending',
  'changes_requested',
  'draft',
];

const DEFAULT_CONTEXT_WINDOW_SIZE = 200_000;

function parseModel(raw: unknown): ModelInfo {
  const source = isRecord(raw) ? raw : {};
  const id = str(source['id'], 'unknown');
  return { id, display_name: str(source['display_name'], id) };
}

function parseRepo(raw: unknown): RepoInfo | undefined {
  if (!isRecord(raw)) return undefined;
  const host = optionalStr(raw['host']);
  const owner = optionalStr(raw['owner']);
  const name = optionalStr(raw['name']);
  // A partial repo identity is worse than none: it would render a broken link.
  if (host === undefined || owner === undefined || name === undefined) return undefined;
  return { host, owner, name };
}

function parseWorkspace(raw: unknown, cwd: string): WorkspaceInfo {
  const source = isRecord(raw) ? raw : {};
  const currentDir = str(source['current_dir'], cwd);
  const addedDirs = Array.isArray(source['added_dirs'])
    ? source['added_dirs'].filter((entry): entry is string => typeof entry === 'string')
    : [];

  const gitWorktree = optionalStr(source['git_worktree']);
  const repo = parseRepo(source['repo']);

  return {
    current_dir: currentDir,
    project_dir: str(source['project_dir'], currentDir),
    added_dirs: addedDirs,
    ...(gitWorktree !== undefined ? { git_worktree: gitWorktree } : {}),
    ...(repo !== undefined ? { repo } : {}),
  };
}

function parseCost(raw: unknown): CostInfo {
  const source = isRecord(raw) ? raw : {};
  return {
    total_cost_usd: num(source['total_cost_usd'], 0),
    total_duration_ms: num(source['total_duration_ms'], 0),
    total_api_duration_ms: num(source['total_api_duration_ms'], 0),
    total_lines_added: num(source['total_lines_added'], 0),
    total_lines_removed: num(source['total_lines_removed'], 0),
  };
}

function parseCurrentUsage(raw: unknown): CurrentUsage | null {
  if (!isRecord(raw)) return null;
  return {
    input_tokens: num(raw['input_tokens'], 0),
    output_tokens: num(raw['output_tokens'], 0),
    cache_creation_input_tokens: num(raw['cache_creation_input_tokens'], 0),
    cache_read_input_tokens: num(raw['cache_read_input_tokens'], 0),
  };
}

function parseContextWindow(raw: unknown): ContextWindowInfo {
  const source = isRecord(raw) ? raw : {};
  const size = Math.max(1, num(source['context_window_size'], DEFAULT_CONTEXT_WINDOW_SIZE));
  const totalInput = num(source['total_input_tokens'], 0);
  const totalOutput = num(source['total_output_tokens'], 0);

  // Claude Code pre-calculates the percentages, but older versions did not and a
  // future one might drop them. Deriving the fallback keeps the gauge truthful
  // rather than pinning it at zero.
  const derivedUsed = clampPercentage(((totalInput + totalOutput) / size) * 100);
  const used = clampPercentage(num(source['used_percentage'], derivedUsed));
  const remaining = clampPercentage(num(source['remaining_percentage'], 100 - used));

  return {
    total_input_tokens: totalInput,
    total_output_tokens: totalOutput,
    context_window_size: size,
    used_percentage: used,
    remaining_percentage: remaining,
    current_usage: parseCurrentUsage(source['current_usage']),
  };
}

function parseRateLimitWindow(raw: unknown): RateLimitWindow | undefined {
  if (!isRecord(raw)) return undefined;
  const usedPercentage = raw['used_percentage'];
  if (typeof usedPercentage !== 'number' || !Number.isFinite(usedPercentage)) return undefined;
  return {
    used_percentage: clampPercentage(usedPercentage),
    resets_at: num(raw['resets_at'], 0),
  };
}

function parseRateLimits(raw: unknown): RateLimits | undefined {
  if (!isRecord(raw)) return undefined;
  const fiveHour = parseRateLimitWindow(raw['five_hour']);
  const sevenDay = parseRateLimitWindow(raw['seven_day']);
  if (fiveHour === undefined && sevenDay === undefined) return undefined;
  return {
    ...(fiveHour !== undefined ? { five_hour: fiveHour } : {}),
    ...(sevenDay !== undefined ? { seven_day: sevenDay } : {}),
  };
}

function parsePullRequest(raw: unknown): PullRequestInfo | undefined {
  if (!isRecord(raw)) return undefined;
  const number = raw['number'];
  const url = optionalStr(raw['url']);
  if (typeof number !== 'number' || !Number.isFinite(number) || url === undefined) return undefined;
  const reviewState = oneOf(raw['review_state'], REVIEW_STATES);
  return {
    number,
    url,
    ...(reviewState !== undefined ? { review_state: reviewState } : {}),
  };
}

function parseWorktree(raw: unknown): WorktreeInfo | undefined {
  if (!isRecord(raw)) return undefined;
  const name = optionalStr(raw['name']);
  const path = optionalStr(raw['path']);
  if (name === undefined || path === undefined) return undefined;
  const branch = optionalStr(raw['branch']);
  const originalBranch = optionalStr(raw['original_branch']);
  return {
    name,
    path,
    original_cwd: str(raw['original_cwd'], ''),
    ...(branch !== undefined ? { branch } : {}),
    ...(originalBranch !== undefined ? { original_branch: originalBranch } : {}),
  };
}

/** Clamps into [0, 100]. Percentages feed gauge widths, where an out-of-range value corrupts the layout. */
export function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * Narrows arbitrary parsed JSON into a `StatusInput`.
 *
 * Never throws. A completely unusable payload yields a well-formed object full of
 * safe defaults, so the renderer always has something coherent to draw.
 */
export function parseStatusInput(raw: unknown): StatusInput {
  const source = isRecord(raw) ? raw : {};

  const cwd = str(source['cwd'], '');
  const sessionName = optionalStr(source['session_name']);
  const promptId = optionalStr(source['prompt_id']);
  const effortLevel = isRecord(source['effort'])
    ? oneOf(source['effort']['level'], EFFORT_LEVELS)
    : undefined;
  const vimMode = isRecord(source['vim']) ? oneOf(source['vim']['mode'], VIM_MODES) : undefined;
  const agentName = isRecord(source['agent']) ? optionalStr(source['agent']['name']) : undefined;
  const rateLimits = parseRateLimits(source['rate_limits']);
  const pr = parsePullRequest(source['pr']);
  const worktree = parseWorktree(source['worktree']);
  const outputStyleName = isRecord(source['output_style'])
    ? str(source['output_style']['name'], 'default')
    : 'default';
  const thinkingEnabled = isRecord(source['thinking'])
    ? bool(source['thinking']['enabled'], false)
    : false;

  return {
    cwd,
    session_id: str(source['session_id'], ''),
    transcript_path: str(source['transcript_path'], ''),
    model: parseModel(source['model']),
    workspace: parseWorkspace(source['workspace'], cwd),
    version: str(source['version'], '0.0.0'),
    output_style: { name: outputStyleName },
    cost: parseCost(source['cost']),
    context_window: parseContextWindow(source['context_window']),
    exceeds_200k_tokens: bool(source['exceeds_200k_tokens'], false),
    fast_mode: bool(source['fast_mode'], false),
    thinking: { enabled: thinkingEnabled },
    ...(sessionName !== undefined ? { session_name: sessionName } : {}),
    ...(promptId !== undefined ? { prompt_id: promptId } : {}),
    ...(effortLevel !== undefined ? { effort: { level: effortLevel } } : {}),
    ...(rateLimits !== undefined ? { rate_limits: rateLimits } : {}),
    ...(vimMode !== undefined ? { vim: { mode: vimMode } } : {}),
    ...(agentName !== undefined ? { agent: { name: agentName } } : {}),
    ...(pr !== undefined ? { pr } : {}),
    ...(worktree !== undefined ? { worktree } : {}),
  };
}

/** Parses raw stdin text. Returns safe defaults rather than throwing on malformed JSON. */
export function parseStatusInputText(text: string): StatusInput {
  try {
    return parseStatusInput(JSON.parse(text));
  } catch {
    return parseStatusInput({});
  }
}
