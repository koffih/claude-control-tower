import { describe, expect, it } from 'vitest';
import { composeBlock, composeLine, type RenderedSegment } from './compose.js';
import { displayWidth } from './width.js';

const segment = (
  id: string,
  text: string,
  priority: RenderedSegment['priority'],
): RenderedSegment => ({ id, text, priority });

const SEGMENTS: readonly RenderedSegment[] = [
  segment('context', 'context 87%', 'critical'),
  segment('branch', 'branch main', 'high'),
  segment('cost', '$1.24', 'normal'),
  segment('duration', '42m', 'low'),
];

const options = (maxWidth: number) => ({ maxWidth, separator: ' | ' });

describe('composeLine', () => {
  it('keeps everything when it fits', () => {
    const line = composeLine(SEGMENTS, options(200));

    expect(line).toBe('context 87% | branch main | $1.24 | 42m');
  });

  it('never exceeds the available width', () => {
    for (const width of [10, 15, 20, 25, 30, 35, 40]) {
      expect(displayWidth(composeLine(SEGMENTS, options(width)))).toBeLessThanOrEqual(width);
    }
  });

  it('sheds the lowest priority first', () => {
    const line = composeLine(SEGMENTS, options(30));

    expect(line).not.toContain('42m');
    expect(line).toContain('context 87%');
  });

  it('protects critical segments longest', () => {
    const line = composeLine(SEGMENTS, options(12));

    expect(line).toBe('context 87%');
  });

  // A line that reshuffles as the terminal resizes is much harder to read than
  // one that simply gets shorter.
  it('preserves declaration order after dropping', () => {
    const line = composeLine(SEGMENTS, options(28));
    const contextAt = line.indexOf('context');
    const branchAt = line.indexOf('branch');

    if (contextAt !== -1 && branchAt !== -1) expect(contextAt).toBeLessThan(branchAt);
  });

  it('drops the widest segment first among equals', () => {
    const equals = [
      segment('a', 'aaaaaaaaaaaaaaaaaaaa', 'low'),
      segment('b', 'bb', 'low'),
      segment('c', 'cc', 'critical'),
    ];

    const line = composeLine(equals, options(10));
    expect(line).not.toContain('aaaa');
    expect(line).toContain('cc');
  });

  it('keeps one segment rather than rendering an empty line', () => {
    expect(composeLine(SEGMENTS, options(1))).not.toBe('');
  });

  it('skips empty segments entirely', () => {
    const withBlank = [segment('blank', '', 'critical'), segment('real', 'here', 'low')];

    expect(composeLine(withBlank, options(50))).toBe('here');
  });

  it('returns an empty string when there is nothing to draw', () => {
    expect(composeLine([], options(80))).toBe('');
  });
});

describe('composeBlock', () => {
  it('joins lines with newlines', () => {
    expect(composeBlock(['one', 'two'], 4)).toBe('one\ntwo');
  });

  it('drops blank lines', () => {
    expect(composeBlock(['one', '', '  ', 'two'], 4)).toBe('one\ntwo');
  });

  it('respects the row budget, keeping the most important lines', () => {
    expect(composeBlock(['one', 'two', 'three'], 2)).toBe('one\ntwo');
  });

  it('always keeps at least one line', () => {
    expect(composeBlock(['one', 'two'], 0)).toBe('one');
  });
});
