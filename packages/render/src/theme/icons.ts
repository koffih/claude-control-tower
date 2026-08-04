import type { GlyphSet } from '../ansi/capabilities.js';

/**
 * Glyph vocabulary, in three tiers.
 *
 * Every icon is defined once with a Nerd Font form, a plain Unicode fallback and
 * an ASCII last resort. Nerd Font presence cannot be detected from inside a
 * process, so the tier is chosen by configuration — and the fallbacks are not
 * decoration, they are what stops the status line degrading into a row of tofu
 * boxes for the large fraction of users who have not installed a patched font.
 *
 * Rule for contributors adding an icon: the ASCII form must be readable on its
 * own. If it needs the icon to make sense, the label is wrong.
 */
export type IconName =
  | 'model'
  | 'context'
  | 'cost'
  | 'clock'
  | 'branch'
  | 'staged'
  | 'modified'
  | 'untracked'
  | 'conflict'
  | 'ahead'
  | 'behind'
  | 'agents'
  | 'quota'
  | 'pullRequest'
  | 'worktree'
  | 'thinking'
  | 'fast'
  | 'advice'
  | 'ok'
  | 'info'
  | 'warn'
  | 'critical';

type IconTable = Readonly<
  Record<IconName, readonly [nerdfont: string, unicode: string, ascii: string]>
>;

const ICONS: IconTable = {
  model: ['', '◆', '*'],
  context: ['', '▣', '#'],
  cost: ['', '$', '$'],
  clock: ['', '◷', 't'],
  branch: ['', '⑂', 'br'],
  staged: ['', '+', '+'],
  modified: ['', '~', '~'],
  untracked: ['', '?', '?'],
  conflict: ['', '!', '!'],
  ahead: ['', '↑', '^'],
  behind: ['', '↓', 'v'],
  agents: ['', '⚇', 'ag'],
  quota: ['', '◔', 'q'],
  pullRequest: ['', '⇄', 'pr'],
  worktree: ['', '⑃', 'wt'],
  thinking: ['', '✳', '*'],
  fast: ['', '⚡', '>'],
  advice: ['', '→', '->'],
  ok: ['', '✓', 'ok'],
  info: ['', 'i', 'i'],
  warn: ['', '▲', '!'],
  critical: ['', '■', '!!'],
};

const TIER_INDEX: Readonly<Record<GlyphSet, 0 | 1 | 2>> = {
  nerdfont: 0,
  unicode: 1,
  ascii: 2,
};

/** Resolves an icon for the active glyph tier. */
export function icon(name: IconName, glyphs: GlyphSet): string {
  return ICONS[name][TIER_INDEX[glyphs]];
}

/** Characters used to draw the context and quota gauges, per tier. */
export interface GaugeGlyphs {
  readonly filled: string;
  readonly partial: string;
  readonly empty: string;
}

const GAUGES: Readonly<Record<GlyphSet, GaugeGlyphs>> = {
  nerdfont: { filled: '█', partial: '▌', empty: '░' },
  unicode: { filled: '█', partial: '▌', empty: '░' },
  ascii: { filled: '=', partial: '-', empty: '.' },
};

export function gaugeGlyphs(glyphs: GlyphSet): GaugeGlyphs {
  return GAUGES[glyphs];
}

/** Separator drawn between segments on a line. */
export function separator(glyphs: GlyphSet): string {
  return glyphs === 'ascii' ? ' | ' : '  ';
}
