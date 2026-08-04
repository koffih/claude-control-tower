import { open, stat } from 'node:fs/promises';
import type { CumulativeTokens, TranscriptState, UsageSample } from '@cct/core';
import { BUDGETS, withBudget, withFallback } from '../budget.js';

/**
 * Facts derived from the session transcript.
 *
 * The transcript is a JSONL file that Claude Code appends to for the life of a
 * session, and in a long session it reaches tens of megabytes. Reading it whole
 * on every render is not an option — it would blow the entire debounce budget on
 * its own — so this collector reads only the **tail**.
 *
 * That choice is the reason the numbers here are described as a sampling window
 * rather than as session totals. It is a deliberate trade: an exact figure that
 * arrives too late to render is worth less than a close one that arrives now, and
 * everything downstream (burn rate, cache ratio, subagent activity) is about
 * recent behaviour anyway.
 */

/**
 * How much of the tail to read.
 *
 * 256 KiB comfortably covers the last few dozen turns of a busy session — enough
 * for a stable burn-rate slope — while staying a single fast read even on a
 * spinning disk.
 */
const TAIL_BYTES = 256 * 1024;

/** Cap on retained samples, so the burn-rate slope is computed over a bounded set. */
const MAX_SAMPLES = 40;

const EMPTY_TOKENS: CumulativeTokens = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };

interface TranscriptAccumulator {
  subagentTurns: number;
  sidechainIds: Set<string>;
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  samples: UsageSample[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberAt(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Reads the last `TAIL_BYTES` of a file.
 *
 * The first line of the slice is almost always a partial record, so it is
 * discarded by the caller rather than fed to `JSON.parse`. Reading UTF-8 from an
 * arbitrary byte offset can also split a multi-byte character; the resulting
 * replacement character only ever lands in that same discarded first line.
 */
async function readTail(path: string): Promise<string | null> {
  return withFallback(async () => {
    const stats = await stat(path);
    if (stats.size === 0) return null;

    const start = Math.max(0, stats.size - TAIL_BYTES);
    const length = stats.size - start;
    const handle = await open(path, 'r');

    try {
      const buffer = Buffer.allocUnsafe(length);
      await handle.read(buffer, 0, length, start);
      return { text: buffer.toString('utf8'), truncated: start > 0 };
    } finally {
      await handle.close();
    }
  }, null).then((result) => {
    if (result === null) return null;
    if (!result.truncated) return result.text;
    const firstBreak = result.text.indexOf('\n');
    return firstBreak === -1 ? '' : result.text.slice(firstBreak + 1);
  });
}

function accumulate(entry: Record<string, unknown>, acc: TranscriptAccumulator): void {
  const isSidechain = entry['isSidechain'] === true;

  if (isSidechain) {
    acc.subagentTurns += 1;
    // Sidechain turns carry the parent uuid that spawned them; it is the only
    // stable handle on "which subagent" a turn belongs to.
    const parent = entry['parentUuid'];
    if (typeof parent === 'string') acc.sidechainIds.add(parent);
  }

  const message = entry['message'];
  if (!isRecord(message)) return;

  const usage = message['usage'];
  if (!isRecord(usage)) return;

  const input = numberAt(usage, 'input_tokens');
  const output = numberAt(usage, 'output_tokens');
  const cacheRead = numberAt(usage, 'cache_read_input_tokens');
  const cacheCreation = numberAt(usage, 'cache_creation_input_tokens');

  acc.input += input;
  acc.output += output;
  acc.cacheRead += cacheRead;
  acc.cacheCreation += cacheCreation;

  const timestamp = entry['timestamp'];
  if (typeof timestamp !== 'string') return;

  const at = Date.parse(timestamp);
  if (Number.isNaN(at)) return;

  // The context size at this turn is everything the model was sent plus what it
  // produced. Sampling that over time is what yields the burn rate.
  acc.samples.push({ at, contextTokens: input + cacheRead + cacheCreation + output });
}

function parseTranscript(text: string): TranscriptState {
  const acc: TranscriptAccumulator = {
    subagentTurns: 0,
    sidechainIds: new Set(),
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheCreation: 0,
    samples: [],
  };

  for (const line of text.split('\n')) {
    if (line.length === 0) continue;
    // One malformed line must not discard the whole tail — the last line of a
    // file being appended to concurrently is routinely half-written.
    try {
      const entry: unknown = JSON.parse(line);
      if (isRecord(entry)) accumulate(entry, acc);
    } catch {
      continue;
    }
  }

  const samples = acc.samples.slice(-MAX_SAMPLES);

  return {
    subagentTurns: acc.subagentTurns,
    recentSubagents: acc.sidechainIds.size,
    cumulative: {
      input: acc.input,
      output: acc.output,
      cacheRead: acc.cacheRead,
      cacheCreation: acc.cacheCreation,
    },
    usageTimeline: samples,
  };
}

/** The zero value, used when the transcript is unreadable or absent. */
export function emptyTranscriptState(): TranscriptState {
  return {
    subagentTurns: 0,
    recentSubagents: 0,
    cumulative: EMPTY_TOKENS,
    usageTimeline: [],
  };
}

/**
 * Collects transcript state, or `null` when it could not be read in budget.
 *
 * `null` is distinct from an empty state: it means "we do not know", and the
 * rules that depend on transcript data stay silent rather than reporting zero.
 */
export async function collectTranscriptState(
  transcriptPath: string,
): Promise<TranscriptState | null> {
  if (transcriptPath === '') return null;

  const text = await withBudget(readTail(transcriptPath), BUDGETS.transcript, null);
  if (text === null) return null;

  return parseTranscript(text);
}

/** Exposed for tests, which exercise the parser without touching the filesystem. */
export const __testing = { parseTranscript };
