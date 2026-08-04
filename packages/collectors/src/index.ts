/**
 * `@cct/collectors` — the I/O layer of Claude Control Tower.
 *
 * Everything that touches the filesystem, spawns a process or reads the clock
 * lives here, and every one of those operations is bounded by an explicit time
 * budget. The rest of the system consumes the plain data this package produces
 * and stays testable without a repository, a transcript or a terminal.
 */

export { BUDGETS, withBudget, withFallback } from './budget.js';
export { CACHE_TTL_MS, readCache, writeCache } from './cache.js';

export type { GitCollectOptions } from './git/git-collector.js';
export { collectGitState, collectGitStateUncached, findGitDir } from './git/git-collector.js';
export type { PorcelainStatus } from './git/parse-porcelain.js';
export { emptyPorcelainStatus, parsePorcelainV2 } from './git/parse-porcelain.js';

export { collectTranscriptState, emptyTranscriptState } from './transcript/transcript-collector.js';

export type { CollectOptions } from './snapshot-collector.js';
export { collectSnapshot } from './snapshot-collector.js';
