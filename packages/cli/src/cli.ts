import { homedir } from 'node:os';
import { builtinPlugins } from '@cct/plugins-builtin';
import { DEFAULT_INIT_OPTIONS, runInit } from './commands/init.js';
import { runDoctor } from './commands/doctor.js';
import { runStatus } from './commands/status.js';
import { runStatusline } from './commands/statusline.js';
import { DEMO_SCENARIOS, type DemoScenario } from './demo.js';

/**
 * Argument parsing and dispatch.
 *
 * Hand-rolled rather than delegated to a framework, for one reason: `cct
 * statusline` runs on every render, and a CLI framework's import cost is paid on
 * every one of those runs before a single useful byte is computed. The surface is
 * six commands and a handful of flags — small enough that the parser is cheaper
 * to maintain than the dependency would be.
 */

export const VERSION = '0.1.0';

const HELP = `Claude Control Tower — mission control for Claude Code

Usage
  cct <command> [options]

Commands
  statusline          Render the status line. Reads the Claude Code payload on stdin.
  init                Configure Claude Code to use the tower. Backs up your settings first.
  doctor              Diagnose the installation and report what to fix.
  status              Render a sample tower without a live session.
  plugins             List the installed plugins and their segments.
  help                Show this message.

Options
  --demo <scenario>   For \`status\`: healthy | pressured | critical | all  (default: healthy)
  --glyphs <tier>     For \`init\`: ascii | unicode | nerdfont              (default: unicode)
  --theme <name>      For \`init\`: tower-dark | tower-light | tower-mono   (default: tower-dark)
  --yes               Skip confirmation prompts.
  --force             Replace an existing statusLine without asking.
  --version           Print the version.

Learn more
  https://github.com/OWNER/claude-control-tower
`;

interface ParsedArgs {
  readonly command: string;
  readonly flags: ReadonlyMap<string, string | boolean>;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const flags = new Map<string, string | boolean>();
  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg.startsWith('--')) {
      const name = arg.slice(2);
      const next = argv[index + 1];

      // A flag takes the following token as its value only when that token is not
      // itself a flag, so `--yes --force` parses as two booleans rather than one
      // flag with the string value "--force".
      if (next !== undefined && !next.startsWith('--')) {
        flags.set(name, next);
        index += 1;
      } else {
        flags.set(name, true);
      }
      continue;
    }

    positional.push(arg);
  }

  return { command: positional[0] ?? '', flags };
}

function flagString(
  flags: ReadonlyMap<string, string | boolean>,
  name: string,
): string | undefined {
  const value = flags.get(name);
  return typeof value === 'string' ? value : undefined;
}

function isDemoScenario(value: string): value is DemoScenario {
  return (DEMO_SCENARIOS as readonly string[]).includes(value);
}

export interface CliDeps {
  readonly argv: readonly string[];
  readonly stdin: NodeJS.ReadStream;
  readonly stdout: NodeJS.WriteStream;
  readonly stderr: NodeJS.WriteStream;
  readonly env: NodeJS.ProcessEnv;
  readonly cwd: () => string;
  readonly now: () => number;
}

function listPlugins(stdout: NodeJS.WriteStream): number {
  stdout.write('Installed plugins\n\n');

  for (const plugin of builtinPlugins()) {
    stdout.write(`  ${plugin.id}\n`);
    stdout.write(`    ${plugin.description}\n`);

    const segments = plugin.segments ?? [];
    if (segments.length > 0) {
      const ids = segments.map((segment) => segment.id).join(', ');
      stdout.write(`    segments: ${ids}\n`);
    }
    stdout.write('\n');
  }

  stdout.write('Disable any of them by id in ~/.claude/cct.json under "disabledSegments".\n');
  return 0;
}

export async function runCli(deps: CliDeps): Promise<number> {
  const { command, flags } = parseArgs(deps.argv);

  if (flags.has('version')) {
    deps.stdout.write(`${VERSION}\n`);
    return 0;
  }

  switch (command) {
    case 'statusline':
      return runStatusline({
        stdin: deps.stdin,
        stdout: deps.stdout,
        env: deps.env,
        now: deps.now,
      });

    case 'init':
      return runInit(
        {
          ...DEFAULT_INIT_OPTIONS,
          glyphs: resolveGlyphs(flagString(flags, 'glyphs')),
          theme: flagString(flags, 'theme') ?? DEFAULT_INIT_OPTIONS.theme,
          assumeYes: flags.get('yes') === true,
          force: flags.get('force') === true,
          home: homedir(),
        },
        { stdout: deps.stdout, stderr: deps.stderr, stdin: deps.stdin },
      );

    case 'doctor':
      return runDoctor({
        stdout: deps.stdout,
        env: deps.env,
        home: homedir(),
        cwd: deps.cwd(),
        now: deps.now,
      });

    case 'status': {
      const requested = flagString(flags, 'demo') ?? 'healthy';
      const scenario =
        requested === 'all' ? 'all' : isDemoScenario(requested) ? requested : 'healthy';

      return runStatus(
        { scenario },
        { stdout: deps.stdout, env: deps.env, cwd: deps.cwd(), now: deps.now },
      );
    }

    case 'plugins':
      return listPlugins(deps.stdout);

    case '':
    case 'help':
      deps.stdout.write(HELP);
      return 0;

    default:
      deps.stderr.write(
        `Unknown command: ${command}\n\nRun \`cct help\` to see what is available.\n`,
      );
      return 2;
  }
}

function resolveGlyphs(value: string | undefined): 'ascii' | 'unicode' | 'nerdfont' {
  return value === 'ascii' || value === 'nerdfont' || value === 'unicode'
    ? value
    : DEFAULT_INIT_OPTIONS.glyphs;
}
