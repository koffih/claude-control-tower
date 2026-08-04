import { builtinRules, evaluateHealth, type SessionSnapshot, type StatusInput } from '@cct/core';
import { collectSnapshot } from '@cct/collectors';
import {
  composeBlock,
  composeLine,
  detectCapabilities,
  icon as resolveIcon,
  separator,
  Styler,
  themeByName,
  type RenderEnvironment,
  type TerminalCapabilities,
} from '@cct/render';
import {
  PluginRegistry,
  type LineId,
  type SegmentContext,
  type SegmentFailure,
} from '@cct/plugin-sdk';
import { builtinPlugins } from '@cct/plugins-builtin';
import type { TowerConfig } from './config/config.js';

/**
 * Orchestration: payload in, status line out.
 *
 * The pipeline is fixed and one-directional — collect, judge, draw, fit — and
 * each stage lives in a different package. Nothing here contains logic of its
 * own; if a decision is being made in this file, it is in the wrong place.
 */

export interface RenderTowerOptions {
  readonly input: StatusInput;
  readonly config: TowerConfig;
  readonly env: RenderEnvironment;
  readonly now: number;
}

export interface TowerRender {
  readonly text: string;
  readonly snapshot: SessionSnapshot;
  readonly capabilities: TerminalCapabilities;
  /** Segments that threw while rendering. Reported by `cct doctor`, ignored otherwise. */
  readonly failures: readonly SegmentFailure[];
}

/**
 * Resolves the glyph tier.
 *
 * Config wins over detection because Nerd Font presence is genuinely undetectable
 * from inside a process — `cct init` asks the user and writes the answer down.
 */
function resolveEnvironment(config: TowerConfig, env: RenderEnvironment): RenderEnvironment {
  if (config.glyphs === 'auto') return env;
  return { ...env, CCT_GLYPHS: config.glyphs };
}

export async function renderTower(options: RenderTowerOptions): Promise<TowerRender> {
  const { input, config, now } = options;

  const capabilities = detectCapabilities(resolveEnvironment(config, options.env));

  const snapshot = await collectSnapshot({
    input,
    terminal: { columns: capabilities.columns, rows: capabilities.rows },
    now,
  });

  const plugins = builtinPlugins(config.thresholds);
  const registry = new PluginRegistry(plugins, {
    disabledSegments: config.disabledSegments,
    disabledPlugins: config.disabledPlugins,
  });

  // Rules run before segments so that the advice segment renders the tower's
  // conclusion rather than deriving a second, possibly contradictory one.
  const health = evaluateHealth(
    snapshot,
    [...builtinRules(config.thresholds), ...registry.rules()],
    {
      muted: config.mutedRules,
    },
  );

  const styler = new Styler(capabilities);
  const context: SegmentContext = {
    snapshot,
    health,
    theme: themeByName(config.theme),
    styler,
    capabilities,
    glyphs: capabilities.glyphs,
    icon: (name) => resolveIcon(name, capabilities.glyphs),
  };

  const { byLine, failures } = registry.render(context);
  const gap = separator(capabilities.glyphs);

  const lines = config.lines
    .map((line: LineId) =>
      composeLine(byLine.get(line) ?? [], {
        maxWidth: capabilities.columns,
        separator: gap,
      }),
    )
    .filter((line) => line.length > 0);

  return {
    // Never occupy more than half the terminal height, however much the user has
    // enabled. The status line shares the screen with the actual work.
    text: composeBlock(lines, Math.max(1, Math.floor(capabilities.rows / 2))),
    snapshot,
    capabilities,
    failures,
  };
}
