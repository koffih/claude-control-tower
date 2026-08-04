import { definePlugin, type Segment } from '@cct/plugin-sdk';
import { truncateToWidth } from '@cct/render';

/**
 * Line 3 — development activity.
 *
 * What has actually changed on disk since the session started. This is the line
 * that answers "is it safe to let this keep running", which is a different
 * question from "is the session healthy".
 */

const MAX_BRANCH_WIDTH = 28;

const branchSegment: Segment = {
  id: 'branch',
  line: 'activity',
  priority: 'high',
  render: ({ snapshot, styler, theme, icon }) => {
    const git = snapshot.git;
    if (git === null) return null;

    // A detached HEAD is a state worth colouring, not just a missing branch name.
    if (git.branch === null) {
      const label = git.head === null ? 'no commits' : `detached ${git.head}`;
      return `${styler.apply(icon('branch'), { color: theme.muted })} ${styler.apply(label, {
        color: theme.severity('warn'),
      })}`;
    }

    return `${styler.apply(icon('branch'), { color: theme.muted })} ${styler.apply(
      truncateToWidth(git.branch, MAX_BRANCH_WIDTH),
      { color: theme.text, bold: true },
    )}`;
  },
};

/**
 * Working tree counts.
 *
 * Each counter is omitted when zero. A row of zeros is visual noise that trains
 * the eye to skip the whole segment, including on the day one of them is not zero.
 */
const worktreeStatusSegment: Segment = {
  id: 'worktree-status',
  line: 'activity',
  priority: 'high',
  render: ({ snapshot, styler, theme, icon }) => {
    const git = snapshot.git;
    if (git === null) return null;

    const parts: string[] = [];
    if (git.staged > 0) {
      parts.push(styler.apply(`${icon('staged')}${git.staged}`, { color: theme.severity('ok') }));
    }
    if (git.modified > 0) {
      parts.push(
        styler.apply(`${icon('modified')}${git.modified}`, { color: theme.severity('warn') }),
      );
    }
    if (git.untracked > 0) {
      parts.push(styler.apply(`${icon('untracked')}${git.untracked}`, { color: theme.muted }));
    }
    if (git.conflicted > 0) {
      parts.push(
        styler.apply(`${icon('conflict')}${git.conflicted}`, {
          color: theme.severity('critical'),
          bold: true,
        }),
      );
    }

    return parts.length === 0 ? null : parts.join(' ');
  },
};

/** Divergence from upstream. Absent entirely when the branch has no upstream configured. */
const upstreamSegment: Segment = {
  id: 'upstream',
  line: 'activity',
  priority: 'normal',
  render: ({ snapshot, styler, theme, icon }) => {
    const git = snapshot.git;
    // No upstream configured means ahead/behind are null rather than zero, and
    // there is nothing meaningful to draw.
    if (git?.ahead == null || git.behind === null) return null;
    if (git.ahead === 0 && git.behind === 0) return null;

    const parts: string[] = [];
    if (git.ahead > 0) {
      parts.push(styler.apply(`${icon('ahead')}${git.ahead}`, { color: theme.severity('info') }));
    }
    if (git.behind > 0) {
      parts.push(styler.apply(`${icon('behind')}${git.behind}`, { color: theme.severity('warn') }));
    }

    return parts.join(' ');
  },
};

/** Lines added and removed by the session, which is the clearest measure of its blast radius. */
const diffSegment: Segment = {
  id: 'diff',
  line: 'activity',
  priority: 'normal',
  render: ({ snapshot, styler, theme }) => {
    const { total_lines_added, total_lines_removed } = snapshot.input.cost;
    if (total_lines_added === 0 && total_lines_removed === 0) return null;

    return [
      styler.apply(`+${total_lines_added}`, { color: theme.severity('ok') }),
      styler.apply(`-${total_lines_removed}`, { color: theme.severity('critical') }),
    ].join(' ');
  },
};

/**
 * The open pull request for this branch, as a clickable badge.
 *
 * Colour follows review state rather than a fixed hue: an approved PR and one
 * with changes requested are different situations, and the difference is exactly
 * what you want to notice without opening a browser.
 */
const pullRequestSegment: Segment = {
  id: 'pull-request',
  line: 'activity',
  priority: 'low',
  render: ({ snapshot, styler, theme, icon }) => {
    const pr = snapshot.input.pr;
    if (pr === undefined) return null;

    const color =
      pr.review_state === 'approved'
        ? theme.severity('ok')
        : pr.review_state === 'changes_requested'
          ? theme.severity('critical')
          : pr.review_state === 'draft'
            ? theme.muted
            : theme.severity('info');

    const label = styler.apply(`${icon('pullRequest')}${pr.number}`, { color });
    return styler.link(label, pr.url);
  },
};

export const activityPlugin = definePlugin({
  id: 'activity',
  description: 'Git branch, working tree state, upstream divergence, diff size and open PR.',
  segments: [
    branchSegment,
    worktreeStatusSegment,
    upstreamSegment,
    diffSegment,
    pullRequestSegment,
  ],
});
