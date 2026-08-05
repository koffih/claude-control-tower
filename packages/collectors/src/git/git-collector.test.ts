import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { collectGitStateUncached, findGitDir } from './git-collector.js';

/**
 * Whether HEAD points at a branch rather than straight at a commit.
 *
 * The release workflow checks out a tag, which leaves HEAD detached, and a
 * detached HEAD has no branch to report. Asking git directly keeps the
 * assertion below honest in both situations instead of encoding an assumption
 * about how the tests happen to be checked out.
 */
function isOnBranch(): boolean {
  try {
    execFileSync('git', ['symbolic-ref', '--quiet', 'HEAD'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Integration tests against the real `git` binary in this repository.
 *
 * These exist because of a bug the unit tests could not see. `--no-optional-locks`
 * is a git-level option, and passing it *after* `status` makes git reject the
 * whole invocation. The collector's fallback then turned that rejection into an
 * empty status, so every render silently reported "no commits" instead of the
 * real branch — a wrong answer with no error anywhere.
 *
 * Parsing tests cannot catch a malformed command line. Only actually running it
 * can, which is what these do.
 */

describe('collectGitStateUncached', () => {
  it('reads real state from this repository', async () => {
    const state = await collectGitStateUncached(process.cwd());

    expect(state).not.toBeNull();
    // The specific assertion that would have failed: a repository with commits
    // must report a HEAD, not the empty fallback. This one holds however the
    // checkout was made, which is what makes it the real regression guard.
    expect(state?.head).toMatch(/^[0-9a-f]{7}$/);
    // A branch is only owed when there is one. Reporting null on a detached
    // HEAD is deliberate and covered in parse-porcelain.test.ts.
    if (isOnBranch()) {
      expect(state?.branch).not.toBeNull();
    } else {
      expect(state?.branch).toBeNull();
    }
  });

  it('reports counts as numbers rather than leaving them undefined', async () => {
    const state = await collectGitStateUncached(process.cwd());

    expect(typeof state?.staged).toBe('number');
    expect(typeof state?.modified).toBe('number');
    expect(typeof state?.untracked).toBe('number');
    expect(typeof state?.conflicted).toBe('number');
  });

  it('returns null outside a repository', async () => {
    // The system temp directory is the one path reliably not inside a checkout.
    await expect(collectGitStateUncached(tmpdir())).resolves.toBeNull();
  });

  it('does not throw on a path that does not exist', async () => {
    await expect(collectGitStateUncached('/no/such/directory/anywhere')).resolves.toBeDefined();
  });
});

describe('findGitDir', () => {
  it('finds the git directory from a nested path', async () => {
    const found = await findGitDir(process.cwd());

    expect(found).not.toBeNull();
    expect(found).toMatch(/\.git$/);
  });

  it('returns null when there is no repository above the path', async () => {
    await expect(findGitDir(tmpdir())).resolves.toBeNull();
  });
});
