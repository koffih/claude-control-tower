import { formatDuration } from '../../format/duration.js';
import { millisSinceLastCommit, uncommittedFileCount } from '../../model/metrics.js';
import type { HealthThresholds } from '../thresholds.js';
import type { HealthRule } from '../types.js';

/**
 * Rules about the working tree.
 *
 * An agent that edits dozens of files is easy to love and hard to undo. These
 * rules exist to make "you have not saved a checkpoint in a while" impossible to
 * miss, before the session gets to a point where unwinding is painful.
 */

/** Fires when a lot of work is sitting uncommitted for a long time. */
export function uncommittedWorkRule(thresholds: HealthThresholds): HealthRule {
  return {
    id: 'uncommitted-work',
    description: 'Reminds you to commit when many files have been changed without a checkpoint.',
    evaluate: (snapshot) => {
      if (snapshot.git === null) return null;

      const files = uncommittedFileCount(snapshot);
      if (files === 0) return null;

      const sinceCommit = millisSinceLastCommit(snapshot);
      const staleMinutes = sinceCommit === null ? Number.POSITIVE_INFINITY : sinceCommit / 60_000;

      const manyFiles = files >= thresholds.git.warnUncommittedFiles;
      const longTime = staleMinutes >= thresholds.git.warnMinutesSinceCommit;

      // Either signal alone is normal working rhythm. Together they mean a large
      // amount of unprotected work, which is the state worth interrupting for.
      if (!manyFiles || !longTime) return null;

      const elapsed = sinceCommit === null ? 'ever' : formatDuration(sinceCommit);

      return {
        ruleId: 'uncommitted-work',
        severity: 'warn',
        title: `${files} uncommitted`,
        advice:
          sinceCommit === null
            ? `${files} files changed and nothing committed yet - make a first checkpoint`
            : `${files} files changed, nothing committed for ${elapsed} - commit a checkpoint`,
      };
    },
  };
}

/** Fires while git is mid-operation, where an agent editing files is genuinely dangerous. */
export function gitOperationRule(): HealthRule {
  return {
    id: 'git-operation',
    description: 'Flags an in-progress merge, rebase, cherry-pick, revert or bisect.',
    evaluate: (snapshot) => {
      const operation = snapshot.git?.operationInProgress;
      if (operation == null) return null;

      return {
        ruleId: 'git-operation',
        severity: 'warn',
        title: `${operation} in progress`,
        advice: `finish or abort the ${operation} before letting the agent edit further`,
      };
    },
  };
}

/** Fires on unresolved merge conflicts, which silently poison every subsequent edit. */
export function mergeConflictRule(): HealthRule {
  return {
    id: 'merge-conflict',
    description: 'Flags files left in a conflicted state.',
    evaluate: (snapshot) => {
      const conflicted = snapshot.git?.conflicted ?? 0;
      if (conflicted === 0) return null;

      return {
        ruleId: 'merge-conflict',
        severity: 'critical',
        title: `${conflicted} conflicted`,
        advice: `resolve ${conflicted} conflicted file${conflicted === 1 ? '' : 's'} before continuing`,
      };
    },
  };
}

/** Fires on detached HEAD, where commits are easy to make and easy to lose. */
export function detachedHeadRule(): HealthRule {
  return {
    id: 'detached-head',
    description: 'Warns when HEAD is detached, where new commits are easily lost.',
    evaluate: (snapshot) => {
      // Detached HEAD is the one case where a null branch is the signal itself,
      // so absence of a repository and presence of a branch both mean "silent".
      if (snapshot.git?.branch !== null) return null;

      return {
        ruleId: 'detached-head',
        severity: 'warn',
        title: 'detached HEAD',
        advice: 'create a branch before committing, or the work becomes unreachable',
      };
    },
  };
}
