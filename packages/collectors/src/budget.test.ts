import { describe, expect, it } from 'vitest';
import { withBudget, withFallback } from './budget.js';

const delay = <T>(millis: number, value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => { resolve(value); }, millis));

/**
 * The budget primitives are what keep a slow repository from stopping the status
 * line from rendering at all. Claude Code kills a script that overruns its 300ms
 * debounce, so "slow" and "broken" are the same outcome to the user.
 */

describe('withBudget', () => {
  it('returns the real value when work finishes in time', async () => {
    await expect(withBudget(delay(5, 'done'), 200, 'fallback')).resolves.toBe('done');
  });

  it('returns the fallback when work overruns', async () => {
    await expect(withBudget(delay(200, 'done'), 10, 'fallback')).resolves.toBe('fallback');
  });

  it('bounds its own runtime to roughly the budget', async () => {
    const started = performance.now();
    await withBudget(delay(1000, 'never'), 20, 'fallback');

    expect(performance.now() - started).toBeLessThan(500);
  });

  it('propagates a rejection rather than masking it as a timeout', async () => {
    await expect(withBudget(Promise.reject(new Error('boom')), 100, 'fallback')).rejects.toThrow(
      'boom',
    );
  });
});

describe('withFallback', () => {
  it('returns the value on success', async () => {
    await expect(withFallback(async () => 'ok', 'fallback')).resolves.toBe('ok');
  });

  // Collectors touch the outside world, where a mid-rebase repo or a rotating
  // transcript can fail in ways that are not actionable at the render site.
  it('swallows any failure into the fallback', async () => {
    await expect(
      withFallback(async () => {
        throw new Error('permission denied');
      }, 'fallback'),
    ).resolves.toBe('fallback');
  });

  it('swallows synchronous throws too', async () => {
    await expect(
      withFallback(() => {
        throw new Error('sync');
      }, 'fallback'),
    ).resolves.toBe('fallback');
  });
});
