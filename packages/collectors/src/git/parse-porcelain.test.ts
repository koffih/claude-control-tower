import { describe, expect, it } from 'vitest';
import { parsePorcelainV2 } from './parse-porcelain.js';

/**
 * Fixtures are verbatim `git status --porcelain=v2 --branch` output. Hand-edited
 * approximations would test the parser against a format git does not actually
 * emit, which is the failure mode this parser most needs protection from.
 */

const CLEAN = `# branch.oid a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0
# branch.head main
# branch.upstream origin/main
# branch.ab +0 -0
`;

const BUSY = `# branch.oid a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0
# branch.head feature/auth
# branch.upstream origin/feature/auth
# branch.ab +3 -2
1 M. N... 100644 100644 100644 aaa bbb src/staged.ts
1 .M N... 100644 100644 100644 ccc ddd src/modified.ts
1 MM N... 100644 100644 100644 eee fff src/both.ts
2 R. N... 100644 100644 100644 111 222 R100 src/new.ts\0src/old.ts
u UU N... 100644 100644 100644 100644 aaa bbb ccc src/conflict.ts
? src/untracked.ts
? notes.md
`;

describe('parsePorcelainV2', () => {
  it('reads a clean repository', () => {
    const status = parsePorcelainV2(CLEAN);

    expect(status.branch).toBe('main');
    expect(status.head).toBe('a1b2c3d');
    expect(status.ahead).toBe(0);
    expect(status.behind).toBe(0);
    expect(status.staged).toBe(0);
    expect(status.modified).toBe(0);
    expect(status.untracked).toBe(0);
    expect(status.conflicted).toBe(0);
  });

  it('counts every category in a busy repository', () => {
    const status = parsePorcelainV2(BUSY);

    expect(status.branch).toBe('feature/auth');
    expect(status.ahead).toBe(3);
    expect(status.behind).toBe(2);
    // staged.ts, both.ts and the rename are staged; modified.ts and both.ts are dirty.
    expect(status.staged).toBe(3);
    expect(status.modified).toBe(2);
    expect(status.untracked).toBe(2);
    expect(status.conflicted).toBe(1);
  });

  it('reports a detached HEAD as a null branch', () => {
    const status = parsePorcelainV2('# branch.oid abc123def456\n# branch.head (detached)\n');

    expect(status.branch).toBeNull();
    expect(status.head).toBe('abc123d');
  });

  it('reports a repository with no commits yet', () => {
    const status = parsePorcelainV2('# branch.oid (initial)\n# branch.head main\n');

    expect(status.head).toBeNull();
    expect(status.branch).toBe('main');
  });

  // No upstream means ahead/behind are unknown, which is different from zero and
  // is why the segment hides rather than showing a confident "0".
  it('leaves ahead and behind null when there is no upstream', () => {
    const status = parsePorcelainV2('# branch.oid abc123def\n# branch.head solo\n');

    expect(status.ahead).toBeNull();
    expect(status.behind).toBeNull();
  });

  it('survives empty and malformed output', () => {
    expect(parsePorcelainV2('')).toEqual({
      branch: null,
      head: null,
      staged: 0,
      modified: 0,
      untracked: 0,
      conflicted: 0,
      ahead: null,
      behind: null,
    });

    expect(() => parsePorcelainV2('garbage\n# branch.ab nonsense\n! ??')).not.toThrow();
  });

  it('handles branch names containing spaces in the ref line', () => {
    const status = parsePorcelainV2('# branch.head feature/a b c\n');
    expect(status.branch).toBe('feature/a b c');
  });
});
