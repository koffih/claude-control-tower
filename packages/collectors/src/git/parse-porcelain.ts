import type { GitState } from '@cct/core';

/**
 * Parser for `git status --porcelain=v2 --branch`.
 *
 * Porcelain v2 is chosen over v1 because it carries branch, upstream and
 * ahead/behind in the same output as the file states. That is the difference
 * between one spawned process and three, and process spawning is the dominant
 * cost of this collector on Windows.
 *
 * The format is documented as stable and machine-readable, which is exactly the
 * guarantee needed for something on a render hot path.
 */

/** Everything the parser can learn from status output alone. */
export type PorcelainStatus = Omit<GitState, 'lastCommitAt' | 'operationInProgress'>;

const EMPTY: PorcelainStatus = {
  branch: null,
  head: null,
  staged: 0,
  modified: 0,
  untracked: 0,
  conflicted: 0,
  ahead: null,
  behind: null,
};

/** Git reports a detached HEAD with this literal branch name. */
const DETACHED = '(detached)';
/** And this literal oid before the first commit. */
const NO_COMMITS = '(initial)';

const SHORT_SHA_LENGTH = 7;

export function parsePorcelainV2(output: string): PorcelainStatus {
  let branch: string | null = null;
  let head: string | null = null;
  let staged = 0;
  let modified = 0;
  let untracked = 0;
  let conflicted = 0;
  let ahead: number | null = null;
  let behind: number | null = null;

  for (const line of output.split('\n')) {
    if (line.length === 0) continue;

    if (line.startsWith('# ')) {
      const [, key, ...rest] = line.split(' ');
      const value = rest.join(' ');

      if (key === 'branch.head') {
        branch = value === DETACHED ? null : value;
      } else if (key === 'branch.oid') {
        head = value === NO_COMMITS ? null : value.slice(0, SHORT_SHA_LENGTH);
      } else if (key === 'branch.ab') {
        // Format is `+N -M`. Absent entirely when no upstream is configured,
        // which is why ahead/behind default to null rather than to zero.
        const match = /^\+(\d+) -(\d+)$/.exec(value);
        if (match?.[1] !== undefined && match[2] !== undefined) {
          ahead = Number.parseInt(match[1], 10);
          behind = Number.parseInt(match[2], 10);
        }
      }
      continue;
    }

    const kind = line[0];

    if (kind === '?') {
      untracked += 1;
      continue;
    }

    if (kind === 'u') {
      conflicted += 1;
      continue;
    }

    // `1` is an ordinary change, `2` a rename or copy. Both carry an XY field at
    // the same offset: X is the staged state, Y the working-tree state.
    if (kind === '1' || kind === '2') {
      const xy = line.slice(2, 4);
      const stagedFlag = xy[0];
      const worktreeFlag = xy[1];

      // A file can be both staged and dirty, and it genuinely counts once in each
      // column — that is the distinction the two counters exist to draw.
      if (stagedFlag !== undefined && stagedFlag !== '.') staged += 1;
      if (worktreeFlag !== undefined && worktreeFlag !== '.') modified += 1;
    }
  }

  return { branch, head, staged, modified, untracked, conflicted, ahead, behind };
}

/** The zero value, used when git is unavailable or the command failed. */
export function emptyPorcelainStatus(): PorcelainStatus {
  return EMPTY;
}
