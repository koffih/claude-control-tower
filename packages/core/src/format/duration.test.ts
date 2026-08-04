import { describe, expect, it } from 'vitest';
import {
  formatCost,
  formatCountdown,
  formatDuration,
  formatPercentage,
  formatTokens,
} from './duration.js';

/**
 * Formatters are load-bearing for layout: their output width determines whether a
 * line fits. These tests pin both the text and, implicitly, how wide it gets.
 */

describe('formatDuration', () => {
  it.each([
    [0, '0s'],
    [999, '0s'],
    [48_000, '48s'],
    [60_000, '1m'],
    [9 * 60_000, '9m'],
    [3_600_000, '1h'],
    [(2 * 60 + 14) * 60_000, '2h14'],
    [(3 * 60 + 5) * 60_000, '3h05'],
    [24 * 3_600_000, '1d'],
    [(24 + 3) * 3_600_000, '1d3h'],
  ])('formats %ims as %s', (millis, expected) => {
    expect(formatDuration(millis)).toBe(expected);
  });

  it('refuses nonsense rather than printing NaN into the terminal', () => {
    expect(formatDuration(Number.NaN)).toBe('—');
    expect(formatDuration(-1)).toBe('—');
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('—');
  });

  // Minutes are zero-padded so the segment does not change width minute to minute.
  it('keeps hour:minute output a stable width', () => {
    expect(formatDuration((2 * 60 + 5) * 60_000)).toHaveLength(
      formatDuration((2 * 60 + 55) * 60_000).length,
    );
  });
});

describe('formatCountdown', () => {
  it('reads as a countdown', () => {
    expect(formatCountdown(45 * 60_000)).toBe('in 45m');
  });

  it('collapses a window that has already reset', () => {
    expect(formatCountdown(0)).toBe('now');
    expect(formatCountdown(-5)).toBe('now');
  });
});

describe('formatTokens', () => {
  it.each([
    [0, '0'],
    [840, '840'],
    [1_000, '1.0k'],
    [12_400, '12k'],
    [999_000, '999k'],
    [1_200_000, '1.2M'],
    [15_000_000, '15M'],
  ])('formats %i as %s', (count, expected) => {
    expect(formatTokens(count)).toBe(expected);
  });

  it('refuses nonsense', () => {
    expect(formatTokens(Number.NaN)).toBe('—');
    expect(formatTokens(-1)).toBe('—');
  });
});

describe('formatCost', () => {
  it('shows cents for ordinary sessions', () => {
    expect(formatCost(1.239)).toBe('$1.24');
    expect(formatCost(0)).toBe('$0.00');
  });

  // Four decimals would imply a precision a client-side estimate does not have.
  it('rounds sub-cent amounts to zero rather than implying false precision', () => {
    expect(formatCost(0.0004)).toBe('$0.00');
  });

  it('drops the decimals once they stop mattering', () => {
    expect(formatCost(142.7)).toBe('$143');
  });
});

describe('formatPercentage', () => {
  it('rounds to a whole number', () => {
    expect(formatPercentage(86.6)).toBe('87%');
    expect(formatPercentage(0)).toBe('0%');
  });

  it('refuses nonsense', () => {
    expect(formatPercentage(Number.NaN)).toBe('—');
  });
});
