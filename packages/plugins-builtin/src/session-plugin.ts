import { definePlugin, defineSegment } from '@cct/plugin-sdk';
import { shortenPath, truncateToWidth } from '@cct/render';
import { basename } from 'node:path';

/**
 * Line 1 — identity.
 *
 * Answers "where am I and what am I talking to", which is the question that
 * matters when several Claude Code sessions are open across several projects.
 * Nothing on this line changes minute to minute, so nothing on it moves.
 */

const MAX_SESSION_NAME_WIDTH = 24;

const modelSegment = defineSegment({
  id: 'model',
  line: 'identity',
  priority: 'high',
  render: ({ snapshot, styler, theme, icon }) => {
    const { display_name } = snapshot.input.model;
    return `${styler.apply(icon('model'), { color: theme.muted })} ${styler.apply(display_name, {
      color: theme.accent,
      bold: true,
    })}`;
  },
});

/**
 * Reasoning effort, extended thinking and fast mode, as compact badges.
 *
 * Only non-default states are drawn. A badge that is always present carries no
 * information and costs width that a narrow terminal cannot spare.
 */
const modeSegment = defineSegment({
  id: 'mode',
  line: 'identity',
  priority: 'low',
  render: ({ snapshot, styler, theme, icon }) => {
    const badges: string[] = [];
    const { effort, thinking, fast_mode, output_style } = snapshot.input;

    if (effort !== undefined && effort.level !== 'medium') {
      badges.push(styler.apply(effort.level, { color: theme.muted }));
    }
    if (thinking.enabled) {
      badges.push(styler.apply(icon('thinking'), { color: theme.accent }));
    }
    if (fast_mode) {
      badges.push(styler.apply(icon('fast'), { color: theme.severity('warn') }));
    }
    if (output_style.name !== 'default') {
      badges.push(styler.apply(output_style.name, { color: theme.muted }));
    }

    return badges.length === 0 ? null : badges.join(' ');
  },
});

/**
 * Project location.
 *
 * Prefers the repository name when there is one, because `acme/api` is more
 * meaningful than the last path component of wherever the user happens to have
 * cloned it. Falls back to a shortened path otherwise.
 */
const projectSegment = defineSegment({
  id: 'project',
  line: 'identity',
  priority: 'high',
  render: ({ snapshot, styler, theme }) => {
    const { workspace } = snapshot.input;
    const repo = workspace.repo;

    if (repo !== undefined) {
      const label = `${repo.owner}/${repo.name}`;
      const styled = styler.apply(label, { color: theme.text, bold: true });
      return styler.link(styled, `https://${repo.host}/${repo.owner}/${repo.name}`);
    }

    const directory = workspace.project_dir === '' ? workspace.current_dir : workspace.project_dir;
    if (directory === '') return null;

    return styler.apply(shortenPath(directory), { color: theme.text, bold: true });
  },
});

/** Shown only when the working directory has moved away from where the session started. */
const subdirectorySegment = defineSegment({
  id: 'subdirectory',
  line: 'identity',
  priority: 'low',
  render: ({ snapshot, styler, theme }) => {
    const { current_dir, project_dir } = snapshot.input.workspace;
    if (current_dir === project_dir || current_dir === '') return null;

    return styler.apply(`/${basename(current_dir)}`, { color: theme.muted });
  },
});

const sessionNameSegment = defineSegment({
  id: 'session-name',
  line: 'identity',
  priority: 'normal',
  render: ({ snapshot, styler, theme }) => {
    const name = snapshot.input.session_name;
    if (name === undefined) return null;

    return styler.apply(truncateToWidth(name, MAX_SESSION_NAME_WIDTH), {
      color: theme.muted,
      italic: true,
    });
  },
});

export const sessionPlugin = definePlugin({
  id: 'session',
  description: 'Model, project, session name and the modes the session is running in.',
  segments: [modelSegment, projectSegment, subdirectorySegment, sessionNameSegment, modeSegment],
});
