import type { StatusInput } from '../contract/status-input.js';
import type { GitState, SessionSnapshot, TranscriptState } from '../model/snapshot.js';

/**
 * Snapshot builders for tests and for `cct status --demo`.
 *
 * Tests that construct a full `StatusInput` by hand drown the assertion in
 * ceremony, and every added contract field breaks them all at once. These
 * builders take a deep-partial override and fill the rest, so a test states only
 * the thing it is actually about.
 *
 * This lives in `src/` rather than a test folder because the CLI's demo mode
 * renders real fixtures — the same data path users see is the one tests cover.
 */

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[] | string | number | boolean | null | undefined
    ? T[K]
    : DeepPartial<T[K]>;
};

/** A mid-session, entirely healthy baseline. Every rule stays silent against it. */
export function baseStatusInput(): StatusInput {
  return {
    cwd: '/home/dev/project',
    session_id: 'session-fixture-0001',
    transcript_path: '/home/dev/.claude/projects/project/session.jsonl',
    model: { id: 'claude-opus-5', display_name: 'Opus' },
    workspace: {
      current_dir: '/home/dev/project',
      project_dir: '/home/dev/project',
      added_dirs: [],
      repo: { host: 'github.com', owner: 'acme', name: 'project' },
    },
    version: '2.1.221',
    output_style: { name: 'default' },
    cost: {
      total_cost_usd: 0.42,
      total_duration_ms: 15 * 60_000,
      total_api_duration_ms: 3 * 60_000,
      total_lines_added: 120,
      total_lines_removed: 18,
    },
    context_window: {
      total_input_tokens: 40_000,
      total_output_tokens: 4_000,
      context_window_size: 200_000,
      used_percentage: 22,
      remaining_percentage: 78,
      current_usage: {
        input_tokens: 1_200,
        output_tokens: 800,
        cache_creation_input_tokens: 4_000,
        cache_read_input_tokens: 34_000,
      },
    },
    exceeds_200k_tokens: false,
    fast_mode: false,
    thinking: { enabled: true },
    effort: { level: 'high' },
  };
}

export function baseGitState(): GitState {
  return {
    branch: 'main',
    head: 'a1b2c3d',
    staged: 0,
    modified: 2,
    untracked: 1,
    conflicted: 0,
    ahead: 0,
    behind: 0,
    lastCommitAt: null,
    operationInProgress: null,
  };
}

export function baseTranscriptState(): TranscriptState {
  return {
    subagentTurns: 0,
    recentSubagents: 0,
    cumulative: {
      input: 2_000,
      output: 8_000,
      cacheRead: 180_000,
      cacheCreation: 20_000,
    },
    usageTimeline: [],
  };
}

const FIXED_NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

/**
 * Builds a snapshot from a healthy baseline plus overrides.
 *
 * `now` is fixed rather than `Date.now()` so that every duration-dependent
 * assertion is deterministic.
 */
export function makeSnapshot(overrides: DeepPartial<SessionSnapshot> = {}): SessionSnapshot {
  const input = mergeDeep(baseStatusInput(), overrides.input ?? {});
  const git = overrides.git === null ? null : mergeDeep(baseGitState(), overrides.git ?? {});
  const transcript =
    overrides.transcript === null
      ? null
      : mergeDeep(baseTranscriptState(), overrides.transcript ?? {});

  return {
    input,
    git,
    transcript,
    now: overrides.now ?? FIXED_NOW,
    terminal: {
      columns: overrides.terminal?.columns ?? 120,
      rows: overrides.terminal?.rows ?? 40,
    },
  };
}

/** Epoch milliseconds of the fixed clock used by `makeSnapshot`. */
export const FIXTURE_NOW = FIXED_NOW;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Recursive merge over untyped values.
 *
 * The recursion is genuinely untyped — `DeepPartial<T>` cannot describe the shape
 * of an arbitrary nested branch — so the traversal works in `unknown` and the
 * single cast happens at the boundary in `mergeDeep`, where the caller's type is
 * still known. Confining the unsoundness to one line beats scattering casts
 * through the walk.
 */
function mergeValues(base: unknown, override: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === undefined ? base : override;
  }

  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    result[key] = mergeValues(result[key], value);
  }
  return result;
}

function mergeDeep<T>(base: T, override: DeepPartial<T>): T {
  return mergeValues(base, override) as T;
}
