import { describe, expect, it } from 'vitest';
import { FIXTURE_NOW, makeSnapshot } from '../testing/fixtures.js';
import {
  apiTimeShare,
  contextBurnRate,
  costPerHour,
  millisSinceLastCommit,
  millisUntilReset,
  minutesUntilContextFull,
  remainingContextTokens,
  uncommittedFileCount,
} from './metrics.js';

const minute = 60_000;

describe('contextBurnRate', () => {
  it('needs at least two samples', () => {
    expect(contextBurnRate([])).toBeNull();
    expect(contextBurnRate([{ at: FIXTURE_NOW, contextTokens: 1000 }])).toBeNull();
  });

  it('computes tokens per minute across the sampled span', () => {
    const rate = contextBurnRate([
      { at: FIXTURE_NOW, contextTokens: 10_000 },
      { at: FIXTURE_NOW + 5 * minute, contextTokens: 60_000 },
    ]);

    expect(rate).toBe(10_000);
  });

  // A span of milliseconds extrapolates to nonsense; better to say nothing.
  it('refuses to extrapolate from a span shorter than six seconds', () => {
    expect(
      contextBurnRate([
        { at: FIXTURE_NOW, contextTokens: 10_000 },
        { at: FIXTURE_NOW + 1000, contextTokens: 90_000 },
      ]),
    ).toBeNull();
  });

  it('reports zero rather than a negative rate after a compact', () => {
    expect(
      contextBurnRate([
        { at: FIXTURE_NOW, contextTokens: 150_000 },
        { at: FIXTURE_NOW + 5 * minute, contextTokens: 20_000 },
      ]),
    ).toBe(0);
  });
});

describe('minutesUntilContextFull', () => {
  it('is null when the context is not growing', () => {
    expect(minutesUntilContextFull(makeSnapshot())).toBeNull();
  });

  it('projects from the burn rate and the real window size', () => {
    const snapshot = makeSnapshot({
      input: {
        context_window: {
          context_window_size: 200_000,
          total_input_tokens: 100_000,
          total_output_tokens: 0,
        },
      },
      transcript: {
        usageTimeline: [
          { at: FIXTURE_NOW - 10 * minute, contextTokens: 0 },
          { at: FIXTURE_NOW, contextTokens: 100_000 },
        ],
      },
    });

    expect(minutesUntilContextFull(snapshot)).toBe(10);
  });

  it('is zero once the window is already full', () => {
    const snapshot = makeSnapshot({
      input: {
        context_window: {
          context_window_size: 200_000,
          total_input_tokens: 200_000,
          total_output_tokens: 5_000,
        },
      },
      transcript: {
        usageTimeline: [
          { at: FIXTURE_NOW - 10 * minute, contextTokens: 0 },
          { at: FIXTURE_NOW, contextTokens: 100_000 },
        ],
      },
    });

    expect(minutesUntilContextFull(snapshot)).toBe(0);
  });
});

describe('remainingContextTokens', () => {
  it('uses the model window rather than the fixed 200k threshold', () => {
    const snapshot = makeSnapshot({
      input: {
        context_window: {
          context_window_size: 1_000_000,
          total_input_tokens: 300_000,
          total_output_tokens: 20_000,
        },
      },
    });

    expect(remainingContextTokens(snapshot)).toBe(680_000);
  });

  it('never goes negative', () => {
    const snapshot = makeSnapshot({
      input: {
        context_window: {
          context_window_size: 200_000,
          total_input_tokens: 250_000,
          total_output_tokens: 0,
        },
      },
    });

    expect(remainingContextTokens(snapshot)).toBe(0);
  });
});

describe('millisUntilReset', () => {
  it('converts epoch seconds to a countdown', () => {
    expect(millisUntilReset({ used_percentage: 50, resets_at: 2000 }, 1_000_000)).toBe(1_000_000);
  });

  it('clamps a window that has already reset', () => {
    expect(millisUntilReset({ used_percentage: 50, resets_at: 1 }, 1_000_000)).toBe(0);
  });
});

describe('costPerHour', () => {
  it('is null before a meaningful amount of time has passed', () => {
    const snapshot = makeSnapshot({ input: { cost: { total_duration_ms: 500 } } });
    expect(costPerHour(snapshot)).toBeNull();
  });

  it('divides spend by elapsed hours', () => {
    const snapshot = makeSnapshot({
      input: { cost: { total_cost_usd: 6, total_duration_ms: 2 * 3_600_000 } },
    });

    expect(costPerHour(snapshot)).toBe(3);
  });
});

describe('apiTimeShare', () => {
  it('is the fraction of wall-clock spent waiting on the API', () => {
    const snapshot = makeSnapshot({
      input: { cost: { total_duration_ms: 1000, total_api_duration_ms: 250 } },
    });

    expect(apiTimeShare(snapshot)).toBe(0.25);
  });

  it('is zero for a session with no elapsed time', () => {
    expect(apiTimeShare(makeSnapshot({ input: { cost: { total_duration_ms: 0 } } }))).toBe(0);
  });
});

describe('git helpers', () => {
  it('counts every category of uncommitted file', () => {
    const snapshot = makeSnapshot({
      git: { staged: 1, modified: 2, untracked: 3, conflicted: 4 },
    });

    expect(uncommittedFileCount(snapshot)).toBe(10);
  });

  it('counts nothing outside a repository', () => {
    expect(uncommittedFileCount(makeSnapshot({ git: null }))).toBe(0);
  });

  it('reports null time since commit when there is no commit', () => {
    expect(millisSinceLastCommit(makeSnapshot({ git: { lastCommitAt: null } }))).toBeNull();
    expect(millisSinceLastCommit(makeSnapshot({ git: null }))).toBeNull();
  });

  it('measures time since the last commit', () => {
    const snapshot = makeSnapshot({ git: { lastCommitAt: FIXTURE_NOW - 90 * minute } });
    expect(millisSinceLastCommit(snapshot)).toBe(90 * minute);
  });
});
