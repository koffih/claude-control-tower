import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { collectGitStateUncached, findGitDir } from './git-collector.js';

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
    // must report a branch and a HEAD, not the empty fallback.
    expect(state?.branch).not.toBeNull();
    expect(state?.head).toMatch(/^[0-9a-f]{7}$/);
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
