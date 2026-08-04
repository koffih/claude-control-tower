import { describe, expect, it } from 'vitest';
import { PLAIN_CAPABILITIES } from '../ansi/capabilities.js';
import { Styler, stripAnsi } from '../ansi/style.js';
import { displayWidth } from '../layout/width.js';
import { TOWER_DARK } from '../theme/theme.js';
import { renderGauge, severityForUsage } from './gauge.js';

const styler = new Styler(PLAIN_CAPABILITIES);

const gauge = (percentage: number, width = 10, glyphs: 'unicode' | 'ascii' = 'unicode'): string =>
  stripAnsi(renderGauge({ percentage, width, severity: 'ok', theme: TOWER_DARK, styler, glyphs }));

describe('renderGauge', () => {
  // Fixed width is what stops the segments after it shifting as the value changes.
  it('always occupies exactly the requested width', () => {
    for (const percentage of [0, 1, 12.5, 33, 50, 66.6, 87, 99.9, 100]) {
      expect(displayWidth(gauge(percentage))).toBe(10);
    }
  });

  it('is empty at zero and full at a hundred', () => {
    expect(gauge(0)).toBe('░░░░░░░░░░');
    expect(gauge(100)).toBe('██████████');
  });

  it('uses a half block for sub-cell precision', () => {
    expect(gauge(55)).toBe('█████▌░░░░');
  });

  it('clamps values outside the range', () => {
    expect(gauge(-20)).toBe(gauge(0));
    expect(gauge(400)).toBe(gauge(100));
  });

  it('falls back to ASCII glyphs when that is all the terminal has', () => {
    expect(gauge(50, 10, 'ascii')).toBe('=====.....');
  });

  it('draws nothing at zero width', () => {
    expect(gauge(50, 0)).toBe('');
  });
});

describe('severityForUsage', () => {
  it('follows the traffic-light contract', () => {
    expect(severityForUsage(10, 75, 90)).toBe('ok');
    expect(severityForUsage(74.9, 75, 90)).toBe('ok');
    expect(severityForUsage(75, 75, 90)).toBe('warn');
    expect(severityForUsage(89.9, 75, 90)).toBe('warn');
    expect(severityForUsage(90, 75, 90)).toBe('critical');
    expect(severityForUsage(100, 75, 90)).toBe('critical');
  });
});
