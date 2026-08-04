import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';

/**
 * `cct init` — one command from install to a working tower.
 *
 * This command edits a file the user did not write and depends on, so it follows
 * three rules without exception:
 *
 *  1. **Never clobber silently.** An existing `statusLine` is reported and
 *     requires explicit confirmation to replace.
 *  2. **Always back up first.** The previous settings file is copied beside
 *     itself before a single byte is written.
 *  3. **Preserve everything else.** The file is parsed, one key is set, and the
 *     rest is written back untouched — including keys this version has never
 *     heard of.
 */

export interface InitOptions {
  readonly glyphs: 'ascii' | 'unicode' | 'nerdfont';
  readonly theme: string;
  /** Skip the confirmation prompt. Intended for scripted installs. */
  readonly assumeYes: boolean;
  /** Replace an existing statusLine without asking. */
  readonly force: boolean;
  readonly home: string;
}

export interface InitDeps {
  readonly stdout: NodeJS.WriteStream;
  readonly stderr: NodeJS.WriteStream;
  readonly stdin: NodeJS.ReadStream;
}

export const DEFAULT_INIT_OPTIONS: Omit<InitOptions, 'home'> = {
  glyphs: 'unicode',
  theme: 'tower-dark',
  assumeYes: false,
  force: false,
};

interface SettingsFile {
  readonly path: string;
  readonly contents: Record<string, unknown>;
  readonly existed: boolean;
}

async function readSettings(home: string): Promise<SettingsFile> {
  const path = join(home, '.claude', 'settings.json');

  try {
    const text = await readFile(path, 'utf8');
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('settings.json does not contain a JSON object');
    }
    return { path, contents: parsed as Record<string, unknown>, existed: true };
  } catch (error) {
    // A missing file is the normal first-run case. A *malformed* one is not, and
    // must not be silently replaced — that would destroy the user's settings.
    if (isNotFound(error)) return { path, contents: {}, existed: false };
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}

/**
 * The `statusLine` block written into settings.json.
 *
 * `refreshInterval` is set because several segments are time-based — quota reset
 * countdowns, session duration, the burn-rate projection — and Claude Code's
 * event-driven updates go quiet while the session is idle. Five seconds keeps
 * those honest without running the command needlessly often.
 */
function buildStatusLineConfig(): Record<string, unknown> {
  return {
    type: 'command',
    command: 'cct statusline',
    padding: 0,
    refreshInterval: 5,
  };
}

export async function runInit(options: InitOptions, deps: InitDeps): Promise<number> {
  const settings = await readSettings(options.home);
  const existing = settings.contents['statusLine'];

  if (existing !== undefined && !options.force) {
    deps.stdout.write('A statusLine is already configured in your settings:\n\n');
    deps.stdout.write(`${JSON.stringify(existing, null, 2)}\n\n`);

    const replace = options.assumeYes
      ? true
      : await confirm('Replace it with Claude Control Tower?', deps);

    if (!replace) {
      deps.stdout.write('Left unchanged. Re-run with --force to replace it.\n');
      return 0;
    }
  } else if (!options.assumeYes) {
    deps.stdout.write(`This will add a statusLine entry to ${settings.path}\n`);
    const proceed = await confirm('Continue?', deps);
    if (!proceed) {
      deps.stdout.write('Cancelled. Nothing was written.\n');
      return 0;
    }
  }

  if (settings.existed) {
    const backup = `${settings.path}.cct-backup`;
    await copyFile(settings.path, backup);
    deps.stdout.write(`Backed up your settings to ${backup}\n`);
  }

  const updated = { ...settings.contents, statusLine: buildStatusLineConfig() };
  await mkdir(dirname(settings.path), { recursive: true });
  await writeFile(settings.path, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');

  await writeTowerConfig(options, deps);

  deps.stdout.write('\nClaude Control Tower is configured.\n');
  deps.stdout.write('Restart Claude Code to see it.\n');
  return 0;
}

/**
 * Writes the tower's own config, so that `cct init --glyphs nerdfont` takes effect.
 *
 * Merges into any existing file rather than replacing it: re-running `init` to
 * change the glyph tier must not silently discard thresholds or muted rules the
 * user tuned by hand.
 */
async function writeTowerConfig(options: InitOptions, deps: InitDeps): Promise<void> {
  const path = join(options.home, '.claude', 'cct.json');

  let existing: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      existing = parsed as Record<string, unknown>;
    }
  } catch {
    // No existing config, or one we cannot read. Either way, start from empty
    // rather than failing the whole init over an optional file.
  }

  const config = { ...existing, theme: options.theme, glyphs: options.glyphs };

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  deps.stdout.write(`Wrote tower config to ${path}\n`);
}

async function confirm(question: string, deps: InitDeps): Promise<boolean> {
  // A non-interactive stdin cannot answer, and defaulting to "yes" would mean a
  // piped install silently rewrites settings. Refuse instead.
  if (!deps.stdin.isTTY) {
    deps.stderr.write('Not a terminal — re-run with --yes to confirm non-interactively.\n');
    return false;
  }

  const rl = createInterface({ input: deps.stdin, output: deps.stdout });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

/** Resolves the home directory, allowing tests to point it somewhere harmless. */
export function defaultHome(): string {
  return homedir();
}
