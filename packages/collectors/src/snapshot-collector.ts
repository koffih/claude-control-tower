import type { SessionSnapshot, StatusInput, TerminalGeometry } from '@cct/core';
import { BUDGETS, withBudget } from './budget.js';
import { collectGitState } from './git/git-collector.js';
import { collectTranscriptState } from './transcript/transcript-collector.js';

/**
 * Assembles a complete snapshot from the payload plus the outside world.
 *
 * This is the one place where I/O happens on the render path, and it is
 * deliberately shallow: fire every collector concurrently, cap the whole set with
 * a total budget, hand the result to the pure domain. Nothing here decides what
 * anything *means*.
 */

export interface CollectOptions {
  readonly input: StatusInput;
  readonly terminal: TerminalGeometry;
  /** Injected rather than read from the clock, so that renders are reproducible in tests. */
  readonly now: number;
}

export async function collectSnapshot(options: CollectOptions): Promise<SessionSnapshot> {
  const { input, terminal, now } = options;

  // Concurrent, not sequential: the collectors are independent, and running them
  // in series would make the total budget the sum of the parts rather than the
  // maximum. The outer budget then guarantees a bound even if one hangs.
  const collected = withBudget(
    Promise.all([
      collectGitState(input.workspace.current_dir, { sessionId: input.session_id, now }),
      collectTranscriptState(input.transcript_path),
    ]),
    BUDGETS.total,
    [null, null] as const,
  );

  const [git, transcript] = await collected;

  return { input, git, transcript, now, terminal };
}
