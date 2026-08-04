#!/usr/bin/env node
/**
 * Executable entry point.
 *
 * Kept to the bare minimum of work before dispatch, because Claude Code runs this
 * on every status line render.
 */
// The bundle, not `dist/index.js`: one file instead of ~45 removes roughly a
// third of the cold-start cost, which Claude Code pays on every render.
import { runCli } from '../dist/cct.bundle.js';

try {
  process.exitCode = await runCli({
    argv: process.argv.slice(2),
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
    env: process.env,
    cwd: () => process.cwd(),
    now: () => Date.now(),
  });
} catch (error) {
  // A status line that crashes must not take the terminal down with it. Claude
  // Code renders whatever reaches stdout, so a bare stack trace there would be
  // printed into the user's interface; stderr keeps it out of the way while
  // remaining visible to `cct doctor` and to anyone running the command directly.
  process.stderr.write(
    `cct: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
}
