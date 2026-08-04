import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withFallback } from './budget.js';

/**
 * A tiny on-disk cache for expensive collector results.
 *
 * Spawning `git` costs roughly 40ms of the render budget, and it is spawned again
 * on every keystroke-triggered update even though the working tree almost never
 * changed in between. Caching that result for a couple of seconds is the single
 * largest remaining saving on the hot path — and it is what the Claude Code
 * documentation itself recommends for exactly this reason.
 *
 * Two details make it correct rather than merely fast:
 *
 *  - **Keyed by session, not by process.** `process.pid` changes on every
 *    invocation, which would defeat the cache entirely. The `session_id` from the
 *    payload is stable for the life of a session and unique across concurrent
 *    sessions, so two Claude Code windows in different repositories never read
 *    each other's state.
 *
 *  - **Written atomically.** A status line reading a half-written cache file
 *    would render garbage, so writes go to a temporary file and are renamed into
 *    place, which is atomic on every platform we target.
 */

interface CacheEnvelope<T> {
  readonly storedAt: number;
  readonly value: T;
}

function cacheDirectory(): string {
  return join(tmpdir(), 'claude-control-tower');
}

function cachePath(sessionId: string, key: string): string {
  // Session ids come from Claude Code and are uuid-shaped, but this is a path, so
  // anything unexpected is stripped rather than trusted.
  const safeSession = sessionId.replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
  return join(cacheDirectory(), `${safeSession}.${key}.json`);
}

/**
 * Reads a cached value, or `null` when absent, unreadable or older than `maxAgeMs`.
 *
 * `T` describes what the caller expects to find, not what is verified to be
 * there: cached JSON is trusted because we wrote it ourselves, one release ago at
 * the oldest. The TTL is the real safeguard — a stale entry from an older shape
 * expires within seconds rather than being read back.
 */
export async function readCache<T>(
  sessionId: string,
  key: string,
  maxAgeMs: number,
  now: number,
): Promise<T | null> {
  return withFallback(async () => {
    const text = await readFile(cachePath(sessionId, key), 'utf8');
    const envelope = JSON.parse(text) as CacheEnvelope<T>;

    if (typeof envelope.storedAt !== 'number') return null;
    // A clock that moved backwards would otherwise pin a stale entry forever.
    const age = now - envelope.storedAt;
    if (age < 0 || age > maxAgeMs) return null;

    return envelope.value;
  }, null);
}

/**
 * Writes a value to the cache. Failures are ignored: a cache miss is never worth an error.
 *
 * Takes `unknown` rather than a type parameter — nothing here inspects the value,
 * it is only serialised, and `readCache` is where the caller states what shape to
 * expect on the way back out.
 */
export async function writeCache(
  sessionId: string,
  key: string,
  value: unknown,
  now: number,
): Promise<void> {
  await withFallback(async () => {
    const path = cachePath(sessionId, key);
    await mkdir(cacheDirectory(), { recursive: true });

    const envelope: CacheEnvelope<unknown> = { storedAt: now, value };
    // Unique temporary name so that concurrent sessions cannot collide mid-write.
    const temporary = `${path}.${String(process.pid)}.tmp`;

    await writeFile(temporary, JSON.stringify(envelope), 'utf8');
    await rename(temporary, path);
  }, undefined);
}

/** How long each cached result stays usable. */
export const CACHE_TTL_MS = {
  /** Short enough that a commit shows up almost immediately, long enough to skip most spawns. */
  git: 2_000,
} as const;
