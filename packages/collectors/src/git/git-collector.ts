import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { GitOperation, GitState } from '@cct/core';
import { BUDGETS, withBudget, withFallback } from '../budget.js';
import { CACHE_TTL_MS, readCache, writeCache } from '../cache.js';
import { emptyPorcelainStatus, parsePorcelainV2 } from './parse-porcelain.js';

const execFileAsync = promisify(execFile);

/**
 * Repository state.
 *
 * Deliberately built from exactly one spawned process plus a few small file
 * reads. Spawning is by far the most expensive thing this package does — on
 * Windows a single `git` invocation costs more than every filesystem operation
 * here combined — so the design pushes work onto the filesystem wherever the
 * answer is available there.
 *
 * That is why the in-progress operation is detected by looking for sentinel files
 * in the git directory rather than by asking git, and why the git directory
 * itself is found by walking up from the cwd rather than by running
 * `git rev-parse --git-dir`.
 */

/** Sentinel files git writes while an operation is in flight, in detection order. */
const OPERATION_SENTINELS: readonly (readonly [file: string, operation: GitOperation])[] = [
  ['rebase-merge', 'rebase'],
  ['rebase-apply', 'rebase'],
  ['MERGE_HEAD', 'merge'],
  ['CHERRY_PICK_HEAD', 'cherry-pick'],
  ['REVERT_HEAD', 'revert'],
  ['BISECT_LOG', 'bisect'],
];

/**
 * Locates the git directory by walking up from `startDir`.
 *
 * Handles the `.git` *file* form as well as the directory form, because linked
 * worktrees — which Claude Code creates for `--worktree` sessions — always use
 * the file form. Missing that case would silently disable operation detection in
 * exactly the sessions where it matters most.
 */
export async function findGitDir(startDir: string): Promise<string | null> {
  let current = resolve(startDir);

  for (;;) {
    const candidate = join(current, '.git');

    const found = await withFallback(async (): Promise<string | null> => {
      const stats = await stat(candidate);
      if (stats.isDirectory()) return candidate;

      if (stats.isFile()) {
        const contents = await readFile(candidate, 'utf8');
        const match = /^gitdir:\s*(.+)$/m.exec(contents);
        const target = match?.[1]?.trim();
        if (target === undefined) return null;
        return resolve(current, target);
      }

      return null;
    }, null);

    if (found !== null) return found;

    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function detectOperation(gitDir: string): Promise<GitOperation | null> {
  for (const [file, operation] of OPERATION_SENTINELS) {
    const exists = await withFallback(async () => {
      await stat(join(gitDir, file));
      return true;
    }, false);
    if (exists) return operation;
  }
  return null;
}

async function readLastCommitTime(gitDir: string): Promise<number | null> {
  // `git log` would mean a second spawn. The commit timestamp is instead taken
  // from the mtime of the ref HEAD points at, which is what git itself updates on
  // every commit. It is an approximation — a fetch touches packed refs too — but
  // it is free, and the rules that consume it only care about the order of hours.
  const headPath = join(gitDir, 'HEAD');

  const refPath = await withFallback(async () => {
    const head = await readFile(headPath, 'utf8');
    const match = /^ref:\s*(.+)$/m.exec(head);
    const ref = match?.[1]?.trim();
    return ref === undefined ? headPath : join(gitDir, ref);
  }, headPath);

  return withFallback(async () => {
    const stats = await stat(refPath);
    return stats.mtimeMs;
  }, null);
}

async function runStatus(cwd: string): Promise<string | null> {
  return withFallback(async () => {
    const { stdout } = await execFileAsync(
      'git',
      [
        // Both of these are git-level options and MUST precede the subcommand.
        // Passing `--no-optional-locks` after `status` makes git reject the whole
        // invocation, which the fallback then quietly turns into "no repository" —
        // a silent wrong answer rather than a visible error.
        '--no-optional-locks',
        '-c',
        'core.fsmonitor=false',
        'status',
        '--porcelain=v2',
        '--branch',
        // Untracked files in a large tree are the slowest part of `git status`.
        // `normal` counts a directory once rather than walking into it.
        '--untracked-files=normal',
      ],
      { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
    );
    return stdout;
  }, null);
}

export interface GitCollectOptions {
  /** Stable for the life of a session and unique across concurrent ones. Keys the cache. */
  readonly sessionId: string;
  readonly now: number;
}

/**
 * Collects repository state for `cwd`, or `null` when it is not inside a repo.
 *
 * Returns `null` rather than an empty state for the non-repo case, so that the
 * renderer can omit git segments entirely instead of drawing a row of zeros.
 *
 * Results are cached briefly. Within the TTL the working tree may be reported a
 * second or two out of date, which is an easy trade for removing a process spawn
 * from the majority of renders — and `refreshInterval` keeps the display honest
 * even while the session sits idle.
 */
export async function collectGitState(
  cwd: string,
  options?: GitCollectOptions,
): Promise<GitState | null> {
  if (options !== undefined) {
    // The cached value is wrapped so that "not in a repository" — a legitimate
    // `null` result worth caching — stays distinguishable from a cache miss,
    // which `readCache` also reports as `null`.
    const cached = await readCache<{ state: GitState | null }>(
      options.sessionId,
      'git',
      CACHE_TTL_MS.git,
      options.now,
    );
    if (cached !== null) return cached.state;
  }

  const state = await collectGitStateUncached(cwd);

  if (options !== undefined) {
    await writeCache(options.sessionId, 'git', { state }, options.now);
  }

  return state;
}

/** The uncached path, exercised directly by tests and by `cct doctor`. */
export async function collectGitStateUncached(cwd: string): Promise<GitState | null> {
  const gitDir = await findGitDir(cwd);
  if (gitDir === null) return null;

  const [statusOutput, operationInProgress, lastCommitAt] = await Promise.all([
    withBudget(runStatus(cwd), BUDGETS.git, null),
    withBudget(detectOperation(gitDir), BUDGETS.git, null),
    withBudget(readLastCommitTime(gitDir), BUDGETS.git, null),
  ]);

  const status = statusOutput === null ? emptyPorcelainStatus() : parsePorcelainV2(statusOutput);

  return { ...status, operationInProgress, lastCommitAt };
}
