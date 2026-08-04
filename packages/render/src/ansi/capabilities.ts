/**
 * Terminal capability detection.
 *
 * The tower renders into whatever terminal the user happens to have, and the same
 * output must stay legible from a truecolor WezTerm down to a CI log with colour
 * stripped entirely. Rather than probe at render time, we resolve capabilities
 * once into this value object and let every downstream component branch on it.
 */

/** How much colour the terminal can express. */
export type ColorDepth = 'none' | 'ansi16' | 'ansi256' | 'truecolor';

/** Which glyph vocabulary is safe to draw with. */
export type GlyphSet = 'ascii' | 'unicode' | 'nerdfont';

export interface TerminalCapabilities {
  readonly colorDepth: ColorDepth;
  readonly glyphs: GlyphSet;
  /** OSC 8 hyperlink support. Off unless we positively recognise the terminal. */
  readonly hyperlinks: boolean;
  readonly columns: number;
  readonly rows: number;
}

/** The subset of the environment that affects rendering. Passed in, never read globally. */
export interface RenderEnvironment {
  readonly NO_COLOR?: string | undefined;
  readonly FORCE_COLOR?: string | undefined;
  readonly TERM?: string | undefined;
  readonly COLORTERM?: string | undefined;
  readonly TERM_PROGRAM?: string | undefined;
  readonly WT_SESSION?: string | undefined;
  readonly COLUMNS?: string | undefined;
  readonly LINES?: string | undefined;
  readonly CCT_GLYPHS?: string | undefined;
}

const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 24;

/** Terminals known to render Nerd Font glyphs and OSC 8 links correctly. */
const RICH_TERMINALS = new Set(['iTerm.app', 'WezTerm', 'vscode', 'ghostty', 'kitty', 'Hyper']);

function detectColorDepth(env: RenderEnvironment): ColorDepth {
  // https://no-color.org — any non-empty value disables colour, and it outranks
  // every positive signal below. Honouring it is table stakes for a CLI.
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return 'none';

  if (env.FORCE_COLOR !== undefined) {
    switch (env.FORCE_COLOR) {
      case '0':
        return 'none';
      case '1':
        return 'ansi16';
      case '2':
        return 'ansi256';
      case '3':
        return 'truecolor';
      default:
        return 'truecolor';
    }
  }

  if (env.TERM === 'dumb') return 'none';

  const colorterm = env.COLORTERM ?? '';
  if (colorterm === 'truecolor' || colorterm === '24bit') return 'truecolor';

  // Windows Terminal reports a modest TERM but has full truecolor support.
  if (env.WT_SESSION !== undefined) return 'truecolor';
  if (env.TERM_PROGRAM !== undefined && RICH_TERMINALS.has(env.TERM_PROGRAM)) return 'truecolor';

  const term = env.TERM ?? '';
  if (term.includes('256color')) return 'ansi256';
  if (term === '') return 'none';
  return 'ansi16';
}

function detectGlyphs(env: RenderEnvironment): GlyphSet {
  // Nerd Font presence cannot be detected from inside a process, so it is an
  // explicit opt-in written by `cct init` after asking the user. Guessing wrong
  // here produces a status line full of tofu boxes, which is the worst possible
  // first impression.
  const override = env.CCT_GLYPHS;
  if (override === 'ascii' || override === 'unicode' || override === 'nerdfont') return override;

  // Only a genuinely dumb terminal gets ASCII. An unset TERM usually means our
  // output is being captured rather than that the terminal is limited — which is
  // exactly what Claude Code does — and box-drawing characters are safe there.
  if (env.TERM === 'dumb') return 'ascii';
  return 'unicode';
}

function detectHyperlinks(env: RenderEnvironment, colorDepth: ColorDepth): boolean {
  // NO_COLOR speaks about colour, not hyperlinks. We extend it to links anyway:
  // someone who disables ANSI decoration is almost always piping the output
  // somewhere, and OSC 8 sequences in a log file are exactly the noise they were
  // trying to avoid. Treating "no colour" as "no decoration" matches the intent.
  if (colorDepth === 'none') return false;

  if (env.TERM_PROGRAM !== undefined && RICH_TERMINALS.has(env.TERM_PROGRAM)) return true;
  return env.WT_SESSION !== undefined;
}

function parseDimension(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Resolves capabilities from the environment.
 *
 * Claude Code captures our stdout rather than attaching it to the terminal, so
 * `tput cols` and `process.stdout.columns` both read as unavailable from inside a
 * status line script. Claude Code sets `COLUMNS`/`LINES` for exactly this reason
 * (v2.1.153+), and they are the only trustworthy source of geometry here.
 */
export function detectCapabilities(env: RenderEnvironment): TerminalCapabilities {
  const colorDepth = detectColorDepth(env);

  return {
    colorDepth,
    glyphs: detectGlyphs(env),
    hyperlinks: detectHyperlinks(env, colorDepth),
    columns: parseDimension(env.COLUMNS, DEFAULT_COLUMNS),
    rows: parseDimension(env.LINES, DEFAULT_ROWS),
  };
}

/** Capabilities for a plain, colourless sink. Used by tests and by `--no-color`. */
export const PLAIN_CAPABILITIES: TerminalCapabilities = {
  colorDepth: 'none',
  glyphs: 'ascii',
  hyperlinks: false,
  columns: DEFAULT_COLUMNS,
  rows: DEFAULT_ROWS,
};
