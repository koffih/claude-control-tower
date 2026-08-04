import { loadConfig } from '../config/config.js';
import { DEMO_SCENARIOS, demoInput, type DemoScenario } from '../demo.js';
import { renderTower } from '../tower.js';

/**
 * `cct status` — renders the tower outside Claude Code.
 *
 * Two uses: previewing a theme or config change without restarting Claude Code,
 * and generating the README screenshots. `--demo all` prints every scenario in
 * turn, which is what makes the documentation reproducible.
 */

export interface StatusDeps {
  readonly stdout: NodeJS.WriteStream;
  readonly env: NodeJS.ProcessEnv;
  readonly cwd: string;
  readonly now: () => number;
}

export interface StatusOptions {
  /** A single scenario, or `all` to render each in sequence. */
  readonly scenario: DemoScenario | 'all';
}

export async function runStatus(options: StatusOptions, deps: StatusDeps): Promise<number> {
  const { config } = await loadConfig(deps.cwd);
  const scenarios = options.scenario === 'all' ? DEMO_SCENARIOS : [options.scenario];

  for (const scenario of scenarios) {
    if (scenarios.length > 1) deps.stdout.write(`\n${scenario}\n\n`);

    const { text } = await renderTower({
      input: demoInput(scenario, deps.cwd, deps.now()),
      config,
      env: deps.env,
      now: deps.now(),
    });

    deps.stdout.write(`${text}\n`);
  }

  return 0;
}
