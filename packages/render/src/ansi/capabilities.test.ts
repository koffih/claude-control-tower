import { describe, expect, it } from 'vitest';
import { detectCapabilities } from './capabilities.js';
import { hex, stripAnsi, Styler } from './style.js';

describe('colour detection', () => {
  // https://no-color.org — honouring this is table stakes for a CLI.
  it('lets NO_COLOR override every positive signal', () => {
    expect(
      detectCapabilities({ NO_COLOR: '1', COLORTERM: 'truecolor', FORCE_COLOR: '3' }).colorDepth,
    ).toBe('none');
  });

  it('ignores an empty NO_COLOR, per the specification', () => {
    expect(detectCapabilities({ NO_COLOR: '', COLORTERM: 'truecolor' }).colorDepth).toBe(
      'truecolor',
    );
  });

  it.each([
    ['0', 'none'],
    ['1', 'ansi16'],
    ['2', 'ansi256'],
    ['3', 'truecolor'],
  ])('maps FORCE_COLOR=%s to %s', (force, expected) => {
    expect(detectCapabilities({ FORCE_COLOR: force }).colorDepth).toBe(expected);
  });

  it('recognises truecolor terminals', () => {
    expect(detectCapabilities({ COLORTERM: 'truecolor' }).colorDepth).toBe('truecolor');
    expect(detectCapabilities({ COLORTERM: '24bit' }).colorDepth).toBe('truecolor');
    expect(detectCapabilities({ TERM_PROGRAM: 'WezTerm' }).colorDepth).toBe('truecolor');
  });

  // Windows Terminal advertises a modest TERM but is fully truecolor capable.
  it('recognises Windows Terminal by its session variable', () => {
    expect(detectCapabilities({ WT_SESSION: 'abc' }).colorDepth).toBe('truecolor');
  });

  it('falls back through 256-colour to basic to none', () => {
    expect(detectCapabilities({ TERM: 'xterm-256color' }).colorDepth).toBe('ansi256');
    expect(detectCapabilities({ TERM: 'xterm' }).colorDepth).toBe('ansi16');
    expect(detectCapabilities({ TERM: 'dumb' }).colorDepth).toBe('none');
    expect(detectCapabilities({}).colorDepth).toBe('none');
  });
});

describe('glyph tier', () => {
  // Nerd Font presence cannot be detected from inside a process; guessing wrong
  // fills the user's terminal with tofu boxes, so it is configured explicitly.
  it('never guesses nerdfont', () => {
    expect(detectCapabilities({ TERM: 'xterm-256color' }).glyphs).toBe('unicode');
    expect(detectCapabilities({ TERM_PROGRAM: 'WezTerm' }).glyphs).toBe('unicode');
  });

  it('honours an explicit override', () => {
    expect(detectCapabilities({ CCT_GLYPHS: 'nerdfont' }).glyphs).toBe('nerdfont');
    expect(detectCapabilities({ CCT_GLYPHS: 'ascii', TERM: 'xterm' }).glyphs).toBe('ascii');
  });

  it('ignores an unrecognised override', () => {
    expect(detectCapabilities({ CCT_GLYPHS: 'emoji', TERM: 'xterm' }).glyphs).toBe('unicode');
  });

  it('drops to ASCII on a dumb terminal', () => {
    expect(detectCapabilities({ TERM: 'dumb' }).glyphs).toBe('ascii');
  });
});

describe('geometry', () => {
  // Claude Code captures stdout, so process.stdout.columns is unavailable and
  // COLUMNS/LINES are the only trustworthy source.
  it('reads COLUMNS and LINES', () => {
    const capabilities = detectCapabilities({ COLUMNS: '140', LINES: '50' });

    expect(capabilities.columns).toBe(140);
    expect(capabilities.rows).toBe(50);
  });

  it('falls back to a conservative 80x24', () => {
    expect(detectCapabilities({}).columns).toBe(80);
    expect(detectCapabilities({ COLUMNS: 'wide', LINES: '-3' }).rows).toBe(24);
  });
});

describe('Styler', () => {
  const plain = new Styler(detectCapabilities({ NO_COLOR: '1' }));
  const rich = new Styler(detectCapabilities({ COLORTERM: 'truecolor', TERM_PROGRAM: 'WezTerm' }));

  it('emits nothing when colour is unavailable', () => {
    expect(plain.apply('87%', { color: hex('#ff0000'), bold: true })).toBe('87%');
  });

  it('emits a truecolor sequence when it is', () => {
    const styled = rich.apply('87%', { color: hex('#f47067') });

    expect(styled).toContain('38;2;244;112;103');
    expect(stripAnsi(styled)).toBe('87%');
  });

  it('leaves empty text untouched', () => {
    expect(rich.apply('', { color: hex('#ffffff') })).toBe('');
  });

  // Terminals without OSC 8 support sometimes print the sequence as garbage, so
  // linking fails closed rather than open.
  it('only emits hyperlinks where they are supported', () => {
    expect(plain.link('atlas', 'https://example.com')).toBe('atlas');
    expect(rich.link('atlas', 'https://example.com')).toContain('example.com');
    expect(stripAnsi(rich.link('atlas', 'https://example.com'))).toBe('atlas');
  });
});

describe('hex', () => {
  it('parses long and short forms identically', () => {
    expect(hex('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hex('#fff')).toEqual(hex('#ffffff'));
    expect(hex('f47067')).toEqual({ r: 244, g: 112, b: 103 });
  });

  it('throws on malformed input, which is always an authoring mistake', () => {
    expect(() => hex('#gggggg')).toThrow();
    expect(() => hex('#ff')).toThrow();
  });
});
