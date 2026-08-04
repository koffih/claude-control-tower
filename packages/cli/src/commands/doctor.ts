import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { detectCapabilities } from '@cct/render';
import { findDuplicateSegmentIds } from '@cct/plugin-sdk';
import { builtinPlugins } from '@cct/plugins-builtin';
import { loadConfig, configSearchPaths } from '../config/config.js';
import { renderTower } from '../tower.js';
import { demoStatusInput } from '../demo.js';

const execFileAsync = promisify(execFile);

/**
 * `cct doctor` — answers "why does my status line look wrong".
 *
 * Every check states what it found and, when something is off, what to do about
 * it. A diagnostic that reports a problem without a next step just moves the
 * user's confusion somewhere else.
 */

type CheckStatus = 'pass' | 'warn' | 'fail';

interface Check {
  readonly name: string;
  readonly status: CheckStatus;
  readonly detail: string;
  /** What to do about it. Omitted when nothing needs doing. */
  readonly remedy?: string;
}

const MARK: Record<CheckStatus, string> = { pass: '+', warn: '!', fail: 'x' };

export interface DoctorDeps {
  readonly stdout: NodeJS.WriteStream;
  readonly env: NodeJS.ProcessEnv;
  readonly home: string;
  readonly cwd: string;
  readonly now: () => number;
}

/** The performance ceiling the status line holds itself to, in milliseconds. */
const RENDER_BUDGET_MS = 200;

async function checkClaudeCode(): Promise<Check> {
  // On Windows the npm-installed `claude` is a `.cmd` batch shim, which cannot be
  // launched without a shell. Enabling one is safe here and only here: the
  // command and its single argument are both compile-time constants, so there is
  // no user-controlled text anywhere near the shell.
  const onWindows = process.platform === 'win32';

  try {
    const { stdout } = await execFileAsync('claude', ['--version'], {
      windowsHide: true,
      shell: onWindows,
    });
    return { name: 'Claude Code', status: 'pass', detail: stdout.trim() };
  } catch {
    // Fall through to the warning below.
  }

  return {
    name: 'Claude Code',
    status: 'warn',
    detail: 'not found on PATH',
    remedy: 'The tower still works, but nothing will run it. Install Claude Code first.',
  };
}

async function checkStatusLineWired(home: string): Promise<Check> {
  const path = join(home, '.claude', 'settings.json');

  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
    const statusLine =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)['statusLine']
        : undefined;

    if (statusLine === undefined) {
      return {
        name: 'statusLine wiring',
        status: 'fail',
        detail: 'no statusLine configured',
        remedy: 'Run `cct init`.',
      };
    }

    const rawCommand =
      typeof statusLine === 'object' && statusLine !== null
        ? (statusLine as Record<string, unknown>)['command']
        : undefined;
    const command = typeof rawCommand === 'string' ? rawCommand : '';

    if (!command.includes('cct')) {
      return {
        name: 'statusLine wiring',
        status: 'warn',
        detail: `points at another command: ${command}`,
        remedy: 'Run `cct init --force` to take over the status line.',
      };
    }

    return { name: 'statusLine wiring', status: 'pass', detail: command };
  } catch {
    return {
      name: 'statusLine wiring',
      status: 'fail',
      detail: `could not read ${path}`,
      remedy: 'Run `cct init`.',
    };
  }
}

async function checkConfig(cwd: string, home: string): Promise<Check> {
  const { source } = await loadConfig(cwd, home);

  if (source === null) {
    return {
      name: 'Tower config',
      status: 'pass',
      detail: `using defaults (searched ${configSearchPaths(cwd, home).length} locations)`,
    };
  }

  return { name: 'Tower config', status: 'pass', detail: source };
}

function checkTerminal(env: NodeJS.ProcessEnv): Check {
  const capabilities = detectCapabilities(env);
  const detail = `${capabilities.colorDepth}, ${capabilities.glyphs} glyphs, ${capabilities.columns}x${capabilities.rows}`;

  if (env['COLUMNS'] === undefined) {
    return {
      name: 'Terminal',
      status: 'warn',
      detail: `${detail} (COLUMNS not set, assuming 80)`,
      remedy:
        'Claude Code sets COLUMNS itself from v2.1.153. Outside Claude Code this warning is expected.',
    };
  }

  return { name: 'Terminal', status: 'pass', detail };
}

function checkSegmentIds(): Check {
  const duplicates = findDuplicateSegmentIds(builtinPlugins());

  if (duplicates.length > 0) {
    return {
      name: 'Segment ids',
      status: 'fail',
      detail: `duplicate ids: ${duplicates.join(', ')}`,
      remedy: 'Two plugins claim the same segment id; disable one of them.',
    };
  }

  const count = builtinPlugins().reduce(
    (total, plugin) => total + (plugin.segments?.length ?? 0),
    0,
  );
  return { name: 'Segment ids', status: 'pass', detail: `${count} segments, all unique` };
}

async function checkRender(deps: DoctorDeps): Promise<readonly Check[]> {
  const { config } = await loadConfig(deps.cwd, deps.home);
  const started = performance.now();

  const result = await renderTower({
    input: demoStatusInput(deps.cwd, deps.now()),
    config,
    env: deps.env,
    now: deps.now(),
  });

  const elapsed = performance.now() - started;
  const checks: Check[] = [
    {
      name: 'Render time',
      status: elapsed <= RENDER_BUDGET_MS ? 'pass' : 'warn',
      detail: `${elapsed.toFixed(0)}ms against a ${RENDER_BUDGET_MS}ms budget`,
      ...(elapsed > RENDER_BUDGET_MS
        ? {
            remedy:
              'Claude Code cancels a status line that overruns its 300ms debounce. A large repository is the usual cause.',
          }
        : {}),
    },
  ];

  if (result.failures.length > 0) {
    checks.push({
      name: 'Segment failures',
      status: 'fail',
      detail: result.failures.map((failure) => failure.segmentId).join(', '),
      remedy: 'These segments threw and were dropped. Disable them, or report the error.',
    });
  } else {
    checks.push({ name: 'Segment failures', status: 'pass', detail: 'none' });
  }

  return checks;
}

export async function runDoctor(deps: DoctorDeps): Promise<number> {
  const checks: Check[] = [
    await checkClaudeCode(),
    await checkStatusLineWired(deps.home),
    await checkConfig(deps.cwd, deps.home),
    checkTerminal(deps.env),
    checkSegmentIds(),
    ...(await checkRender(deps)),
  ];

  deps.stdout.write('Claude Control Tower — diagnostics\n\n');

  for (const check of checks) {
    deps.stdout.write(`  [${MARK[check.status]}] ${check.name}: ${check.detail}\n`);
    if (check.remedy !== undefined) deps.stdout.write(`      -> ${check.remedy}\n`);
  }

  const failed = checks.filter((check) => check.status === 'fail').length;
  const warned = checks.filter((check) => check.status === 'warn').length;

  deps.stdout.write(
    `\n${checks.length - failed - warned} passed, ${warned} warning(s), ${failed} failure(s)\n`,
  );

  // A non-zero exit lets `cct doctor` be used as a CI or setup gate.
  return failed > 0 ? 1 : 0;
}
