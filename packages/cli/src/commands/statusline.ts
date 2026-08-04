import { parseStatusInputText } from '@cct/core';
import { loadConfig } from '../config/config.js';
import { renderTower } from '../tower.js';

/**
 * `cct statusline` — the hot path.
 *
 * Claude Code runs this on every render, debounces at 300ms, and kills the
 * process if a new update arrives while it is still going. Everything in this
 * file is written for that constraint: read stdin once, do the work, print, exit.
 *
 * There is no logging, no telemetry and no network access here, by design. The
 * status line runs on a developer's machine dozens of times a minute, and the
 * only thing it is allowed to cost them is a few milliseconds.
 */

/** Reads all of stdin. Resolves to an empty string when nothing is piped in. */
async function readStdin(stream: NodeJS.ReadStream): Promise<string> {
  if (stream.isTTY) return '';

  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export interface StatuslineDeps {
  readonly stdin: NodeJS.ReadStream;
  readonly stdout: NodeJS.WriteStream;
  readonly env: NodeJS.ProcessEnv;
  readonly now: () => number;
}

export async function runStatusline(deps: StatuslineDeps): Promise<number> {
  const raw = await readStdin(deps.stdin);
  const input = parseStatusInputText(raw);

  const cwd = input.workspace.current_dir === '' ? process.cwd() : input.workspace.current_dir;
  const { config } = await loadConfig(cwd);

  const { text } = await renderTower({
    input,
    config,
    env: deps.env,
    now: deps.now(),
  });

  deps.stdout.write(`${text}\n`);
  return 0;
}
