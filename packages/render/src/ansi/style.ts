import type { ColorDepth, TerminalCapabilities } from './capabilities.js';

/**
 * ANSI styling, degraded to whatever the terminal can express.
 *
 * Colours are authored once in RGB and downsampled on the way out. That keeps the
 * themes readable as design documents — `#f0b429` rather than `\u001B[38;5;214m` —
 * while still producing correct output on a 16-colour terminal.
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * Escape sequences are written as explicit unicode escapes rather than raw
 * control bytes. A literal ESC or BEL in source survives neither copy-paste nor
 * most diff tools, and a status line whose escapes were silently mangled is
 * miserable to debug.
 */
/** Control Sequence Introducer. */
const CSI = '\u001B[';
/** Operating System Command — the prefix for an OSC 8 hyperlink. */
const OSC = '\u001B]';
/** Terminates an OSC sequence. The BEL form is the more widely understood of the two. */
const BEL = '\u0007';
const RESET = `${CSI}0m`;

/** Parses `#rrggbb` or `#rgb`. Throws on malformed input, which is always an authoring bug. */
export function hex(value: string): Rgb {
  const normalised = value.startsWith('#') ? value.slice(1) : value;
  // Shorthand `#rgb` expands to `#rrggbb`. The input is ASCII hex (enforced just
  // below), so a plain regex replace is both correct and free of the surrogate
  // pair hazards that come with spreading a string.
  const expanded =
    normalised.length === 3 ? normalised.replace(/./g, (char) => char + char) : normalised;

  if (expanded.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(expanded)) {
    throw new Error(`Invalid hex colour: ${value}`);
  }

  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  };
}

/**
 * Maps RGB onto the xterm-256 cube.
 *
 * The 6×6×6 colour cube starts at index 16; the greyscale ramp at 232 gives far
 * better results for near-grey colours than the cube does, so it is checked first.
 */
function toAnsi256(color: Rgb): number {
  const { r, g, b } = color;

  if (Math.abs(r - g) < 8 && Math.abs(g - b) < 8) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round(((r - 8) / 247) * 24) + 232;
  }

  const channel = (value: number): number => Math.round((value / 255) * 5);
  return 16 + 36 * channel(r) + 6 * channel(g) + channel(b);
}

/** Maps RGB onto the 8 basic colours, brightening when the source is light. */
function toAnsi16(color: Rgb): number {
  const { r, g, b } = color;
  const threshold = 128;
  const code = (b > threshold ? 4 : 0) | (g > threshold ? 2 : 0) | (r > threshold ? 1 : 0);
  const isBright = Math.max(r, g, b) > 200;
  return (isBright ? 90 : 30) + code;
}

function foregroundSequence(color: Rgb, depth: ColorDepth): string {
  switch (depth) {
    case 'none':
      return '';
    case 'truecolor':
      return `${CSI}38;2;${color.r};${color.g};${color.b}m`;
    case 'ansi256':
      return `${CSI}38;5;${toAnsi256(color)}m`;
    case 'ansi16':
      return `${CSI}${toAnsi16(color)}m`;
  }
}

export interface StyleOptions {
  readonly color?: Rgb;
  readonly bold?: boolean;
  readonly dim?: boolean;
  readonly italic?: boolean;
}

/**
 * A styler bound to one set of capabilities.
 *
 * Binding once rather than threading capabilities through every call site keeps
 * segment code free of presentation plumbing, and makes it trivial to render the
 * same segment twice — once coloured for the terminal, once plain for a test.
 */
export class Styler {
  private readonly depth: ColorDepth;
  private readonly supportsHyperlinks: boolean;

  constructor(capabilities: TerminalCapabilities) {
    this.depth = capabilities.colorDepth;
    this.supportsHyperlinks = capabilities.hyperlinks;
  }

  /** Applies styling, or returns the text untouched when colour is unavailable. */
  apply(text: string, options: StyleOptions): string {
    if (this.depth === 'none' || text === '') return text;

    let prefix = '';
    if (options.bold === true) prefix += `${CSI}1m`;
    if (options.dim === true) prefix += `${CSI}2m`;
    if (options.italic === true) prefix += `${CSI}3m`;
    if (options.color !== undefined) prefix += foregroundSequence(options.color, this.depth);

    return prefix === '' ? text : `${prefix}${text}${RESET}`;
  }

  /**
   * Wraps text in an OSC 8 hyperlink when the terminal supports it.
   *
   * Terminals that do not support OSC 8 mostly ignore it, but a meaningful
   * minority print the escape sequence as literal garbage. Since a status line
   * that renders garbage is worse than one without links, this fails closed.
   */
  link(text: string, url: string): string {
    if (!this.supportsHyperlinks) return text;
    return `${OSC}8;;${url}${BEL}${text}${OSC}8;;${BEL}`;
  }
}

/** Removes every ANSI escape sequence. Used for width measurement and snapshot tests. */
export function stripAnsi(text: string): string {
  // Matches CSI sequences and OSC 8 hyperlink wrappers, which is the full set we emit.
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001B\[[0-9;]*m|\u001B\]8;;[^\u0007\u001B]*(?:\u0007|\u001B\\)/g, '');
}
