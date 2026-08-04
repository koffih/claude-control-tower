import { primaryAdvice } from '@cct/core';
import { definePlugin, type Segment } from '@cct/plugin-sdk';
import { truncateToWidth } from '@cct/render';

/**
 * Line 4 — agents, infrastructure, and the advice.
 *
 * The advice segment is the payload of the entire product. Everything above it
 * reports state; this is the only part that tells you what to do about it.
 */

const MIN_ADVICE_WIDTH = 24;

/**
 * The one-line recommendation.
 *
 * Deliberately the only segment allowed to consume the width it needs, and marked
 * `critical` so it is the last thing dropped. If the tower can render exactly one
 * thing, it should be the sentence that saves the session — not a gauge.
 *
 * Exactly one finding is shown, never a list. A status line offering five
 * suggestions is a status line nobody reads.
 */
const adviceSegment: Segment = {
  id: 'advice',
  line: 'infra',
  priority: 'critical',
  render: ({ health, styler, theme, capabilities, icon }) => {
    const finding = primaryAdvice(health);
    if (finding === null) return null;

    // Reserve room for the rest of the line before deciding how much advice fits.
    const available = Math.max(MIN_ADVICE_WIDTH, capabilities.columns - 24);
    const text = truncateToWidth(finding.advice, available);

    const marker = styler.apply(icon(finding.severity === 'info' ? 'info' : finding.severity), {
      color: theme.severity(finding.severity),
      bold: finding.severity === 'critical',
    });

    return `${marker} ${styler.apply(text, { color: theme.severity(finding.severity) })}`;
  },
};

/**
 * Subagent activity seen in the sampled window of the transcript.
 *
 * Labelled "recent" rather than "active" on purpose: the transcript records that
 * subagents ran, not whether they are still running, and the segment says only
 * what the data supports.
 */
const subagentsSegment: Segment = {
  id: 'subagents',
  line: 'infra',
  priority: 'normal',
  render: ({ snapshot, styler, theme, icon }) => {
    const transcript = snapshot.transcript;
    if (transcript === null || transcript.recentSubagents === 0) return null;

    return `${styler.apply(icon('agents'), { color: theme.muted })}${styler.apply(
      String(transcript.recentSubagents),
      { color: theme.severity('info') },
    )}`;
  },
};

/** The active `--worktree`, which is easy to forget you are inside. */
const worktreeSegment: Segment = {
  id: 'worktree',
  line: 'infra',
  priority: 'normal',
  render: ({ snapshot, styler, theme, icon }) => {
    const name = snapshot.input.worktree?.name ?? snapshot.input.workspace.git_worktree;
    if (name === undefined) return null;

    return `${styler.apply(icon('worktree'), { color: theme.muted })} ${styler.apply(
      truncateToWidth(name, 20),
      { color: theme.accent },
    )}`;
  },
};

/** The named agent persona, when the session runs under `--agent`. */
const agentSegment: Segment = {
  id: 'agent',
  line: 'infra',
  priority: 'low',
  render: ({ snapshot, styler, theme }) => {
    const name = snapshot.input.agent?.name;
    if (name === undefined) return null;

    return styler.apply(truncateToWidth(name, 20), { color: theme.accent, italic: true });
  },
};

/** Vim mode, for users who have it enabled and rely on knowing which mode they are in. */
const vimSegment: Segment = {
  id: 'vim',
  line: 'infra',
  priority: 'low',
  render: ({ snapshot, styler, theme }) => {
    const mode = snapshot.input.vim?.mode;
    if (mode === undefined) return null;

    return styler.apply(mode, {
      color: mode === 'INSERT' ? theme.severity('ok') : theme.muted,
      bold: true,
    });
  },
};

export const infraPlugin = definePlugin({
  id: 'infra',
  description: 'The health recommendation, subagent activity, worktree, agent and vim mode.',
  segments: [adviceSegment, subagentsSegment, worktreeSegment, agentSegment, vimSegment],
});
