import { describe, expect, it } from 'vitest';
import { __testing, collectTranscriptState } from './transcript-collector.js';

const { parseTranscript } = __testing;

/** Lines shaped exactly like the entries Claude Code appends to a session transcript. */
function assistantLine(options: {
  at: string;
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheCreation?: number;
  sidechain?: boolean;
  parentUuid?: string;
}): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: options.at,
    ...(options.sidechain === true ? { isSidechain: true } : {}),
    ...(options.parentUuid !== undefined ? { parentUuid: options.parentUuid } : {}),
    message: {
      role: 'assistant',
      usage: {
        input_tokens: options.input ?? 0,
        output_tokens: options.output ?? 0,
        cache_read_input_tokens: options.cacheRead ?? 0,
        cache_creation_input_tokens: options.cacheCreation ?? 0,
      },
    },
  });
}

describe('parseTranscript', () => {
  it('sums token usage across the window', () => {
    const text = [
      assistantLine({ at: '2026-01-15T12:00:00Z', input: 10, output: 20, cacheRead: 30, cacheCreation: 40 }),
      assistantLine({ at: '2026-01-15T12:05:00Z', input: 1, output: 2, cacheRead: 3, cacheCreation: 4 }),
    ].join('\n');

    const state = parseTranscript(text);

    expect(state.cumulative).toEqual({ input: 11, output: 22, cacheRead: 33, cacheCreation: 44 });
  });

  it('builds a usage timeline in order', () => {
    const text = [
      assistantLine({ at: '2026-01-15T12:00:00Z', input: 100 }),
      assistantLine({ at: '2026-01-15T12:05:00Z', input: 200 }),
    ].join('\n');

    const timeline = parseTranscript(text).usageTimeline;

    expect(timeline).toHaveLength(2);
    expect(timeline[0]?.at).toBeLessThan(timeline[1]?.at ?? 0);
    expect(timeline[1]?.contextTokens).toBe(200);
  });

  it('counts distinct subagent conversations, not turns', () => {
    const text = [
      assistantLine({ at: '2026-01-15T12:00:00Z', sidechain: true, parentUuid: 'agent-a' }),
      assistantLine({ at: '2026-01-15T12:01:00Z', sidechain: true, parentUuid: 'agent-a' }),
      assistantLine({ at: '2026-01-15T12:02:00Z', sidechain: true, parentUuid: 'agent-b' }),
      assistantLine({ at: '2026-01-15T12:03:00Z' }),
    ].join('\n');

    const state = parseTranscript(text);

    expect(state.subagentTurns).toBe(3);
    expect(state.recentSubagents).toBe(2);
  });

  // The last line of a file being appended to concurrently is routinely
  // half-written, and it must not discard everything read before it.
  it('skips malformed lines without losing the rest', () => {
    const text = [
      assistantLine({ at: '2026-01-15T12:00:00Z', input: 50 }),
      '{ this is not json',
      assistantLine({ at: '2026-01-15T12:01:00Z', input: 60 }),
      '{"partial":',
    ].join('\n');

    const state = parseTranscript(text);

    expect(state.cumulative.input).toBe(110);
    expect(state.usageTimeline).toHaveLength(2);
  });

  it('ignores entries with no usage block', () => {
    const text = [
      JSON.stringify({ type: 'mode', mode: 'normal' }),
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'hello' } }),
    ].join('\n');

    const state = parseTranscript(text);

    expect(state.cumulative.input).toBe(0);
    expect(state.usageTimeline).toEqual([]);
  });

  it('ignores entries with an unparseable timestamp', () => {
    const line = JSON.stringify({
      type: 'assistant',
      timestamp: 'not-a-date',
      message: { usage: { input_tokens: 10 } },
    });

    const state = parseTranscript(line);

    // The tokens still count; only the timeline sample is dropped.
    expect(state.cumulative.input).toBe(10);
    expect(state.usageTimeline).toEqual([]);
  });

  it('caps the retained sample set', () => {
    const lines = Array.from({ length: 120 }, (_, index) =>
      assistantLine({ at: new Date(Date.UTC(2026, 0, 15, 12, index)).toISOString(), input: index }),
    );

    expect(parseTranscript(lines.join('\n')).usageTimeline.length).toBeLessThanOrEqual(40);
  });

  it('returns a zeroed state for empty input', () => {
    const state = parseTranscript('');

    expect(state.subagentTurns).toBe(0);
    expect(state.recentSubagents).toBe(0);
    expect(state.usageTimeline).toEqual([]);
  });
});

describe('collectTranscriptState', () => {
  // `null` means "we do not know", which keeps transcript-dependent rules silent
  // instead of having them report a confident zero.
  it('reports null rather than an empty state when there is no transcript', async () => {
    await expect(collectTranscriptState('')).resolves.toBeNull();
    await expect(collectTranscriptState('/does/not/exist.jsonl')).resolves.toBeNull();
  });
});
