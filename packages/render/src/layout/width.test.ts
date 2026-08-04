import { describe, expect, it } from 'vitest';
import { Styler } from '../ansi/style.js';
import { PLAIN_CAPABILITIES } from '../ansi/capabilities.js';
import { displayWidth, shortenPath, truncateToWidth } from './width.js';

/**
 * Width measurement decides whether the status line wraps, and a wrapped status
 * line corrupts the terminal layout. These are the tests that keep that from
 * happening.
 */

const truecolor = new Styler({ ...PLAIN_CAPABILITIES, colorDepth: 'truecolor', hyperlinks: true });

describe('displayWidth', () => {
  it('measures plain ASCII by character', () => {
    expect(displayWidth('context 87%')).toBe(11);
    expect(displayWidth('')).toBe(0);
  });

  it('ignores ANSI colour, which occupies no cells', () => {
    const styled = truecolor.apply('87%', { color: { r: 255, g: 0, b: 0 }, bold: true });

    expect(styled.length).toBeGreaterThan(3);
    expect(displayWidth(styled)).toBe(3);
  });

  it('ignores OSC 8 hyperlink wrappers', () => {
    const linked = truecolor.link('acme/atlas', 'https://github.com/acme/atlas');

    expect(linked.length).toBeGreaterThan(10);
    expect(displayWidth(linked)).toBe(10);
  });

  it('counts CJK and emoji as two cells', () => {
    expect(displayWidth('日本語')).toBe(6);
    expect(displayWidth('🚀')).toBe(2);
  });

  it('counts combining marks as zero', () => {
    // "e" followed by a combining acute renders in one cell, not two.
    expect(displayWidth('e\u0301')).toBe(1);
  });

  // Nerd Font glyphs live in the Private Use Area and are drawn single-width.
  it('counts a Nerd Font glyph as one cell', () => {
    expect(displayWidth('\uE0A0')).toBe(1);
  });

  it('counts control characters as zero', () => {
    expect(displayWidth('a\u0007b')).toBe(2);
  });
});

describe('truncateToWidth', () => {
  it('leaves text that already fits', () => {
    expect(truncateToWidth('main', 10)).toBe('main');
  });

  it('cuts to the budget including the ellipsis', () => {
    const result = truncateToWidth('feature/a-very-long-branch-name', 12);

    expect(displayWidth(result)).toBeLessThanOrEqual(12);
    expect(result.endsWith('…')).toBe(true);
  });

  // Cutting a wide character in half would leave the terminal a cell short.
  it('never splits a double-width character across the boundary', () => {
    const result = truncateToWidth('日本語日本語', 5);
    expect(displayWidth(result)).toBeLessThanOrEqual(5);
  });

  it('degrades sensibly at absurdly small budgets', () => {
    expect(truncateToWidth('anything', 0)).toBe('');
    expect(displayWidth(truncateToWidth('anything', 1))).toBeLessThanOrEqual(1);
  });
});

describe('shortenPath', () => {
  it('keeps the trailing components', () => {
    expect(shortenPath('/home/dev/work/atlas', 2)).toBe('…/work/atlas');
  });

  it('leaves short paths alone', () => {
    expect(shortenPath('/home/dev', 2)).toBe('home/dev');
  });

  it('preserves the platform separator', () => {
    expect(shortenPath('C:\\dev\\websites\\atlas', 2)).toBe('…\\websites\\atlas');
  });
});
