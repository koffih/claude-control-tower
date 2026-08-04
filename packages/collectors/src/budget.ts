/**
 * Time budgeting.
 *
 * Claude Code debounces status line updates at 300ms and *kills* the script if a
 * new update arrives while the previous run is still going. A collector that
 * blocks on a slow `git status` in a huge repository does not merely make the
 * line late — it can stop the line from ever rendering at all.
 *
 * So no collector is trusted with unbounded time. Each one gets a budget, and
 * exceeding it degrades that single segment rather than the whole tower.
 */

/** Budgets in milliseconds, sized so that the full set still fits inside one debounce window. */
export const BUDGETS = {
  /** `git status` in a large repository is the usual worst case. */
  git: 120,
  /** Reading the tail of a transcript file. */
  transcript: 60,
  /** Everything, end to end. Leaves headroom under Claude Code's 300ms debounce. */
  total: 220,
} as const;

/**
 * Resolves to `fallback` if `work` has not settled within `millis`.
 *
 * The losing promise is abandoned rather than cancelled, because neither a
 * filesystem read nor a spawned process can be truly cancelled mid-flight in
 * Node. Callers must therefore make sure the abandoned work has no side effects —
 * every collector here is read-only, which is what makes that safe.
 */
export async function withBudget<T>(work: Promise<T>, millis: number, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  const expiry = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      resolve(fallback);
    }, millis);
    // Do not hold the event loop open on account of the budget timer alone.
    timer.unref();
  });

  try {
    return await Promise.race([work, expiry]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Runs work and swallows any failure into `fallback`.
 *
 * Collectors touch the outside world, where absolutely anything can fail: a repo
 * mid-rebase, a transcript being rotated, a permission error. None of that is
 * worth a blank status line, and none of it is actionable at the render site.
 */
export async function withFallback<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work();
  } catch {
    return fallback;
  }
}
