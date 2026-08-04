import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_THRESHOLDS, type HealthThresholds } from '@cct/core';
import type { GlyphSet } from '@cct/render';
import type { LineId } from '@cct/plugin-sdk';

/**
 * User configuration.
 *
 * Config is entirely optional — the tower is designed to be excellent with an
 * empty file — and it is read from disk on the render path, so it is small and
 * parsed defensively. A malformed config degrades to defaults rather than
 * blanking the status line, on the same reasoning as the stdin parser.
 */

export interface TowerConfig {
  readonly theme: string;
  readonly glyphs: GlyphSet | 'auto';
  /** Lines to draw, in order. Dropping one is how a user asks for a shorter tower. */
  readonly lines: readonly LineId[];
  readonly disabledSegments: readonly string[];
  readonly disabledPlugins: readonly string[];
  /** Health rule ids to silence. */
  readonly mutedRules: readonly string[];
  readonly thresholds: HealthThresholds;
}

export const DEFAULT_CONFIG: TowerConfig = {
  theme: 'tower-dark',
  glyphs: 'auto',
  lines: ['identity', 'health', 'activity', 'infra'],
  disabledSegments: [],
  disabledPlugins: [],
  mutedRules: [],
  thresholds: DEFAULT_THRESHOLDS,
};

/** Search order. The first file found wins; they are not merged. */
export function configSearchPaths(cwd: string, home = homedir()): readonly string[] {
  return [
    join(cwd, '.cct.json'),
    join(cwd, '.claude', 'cct.json'),
    join(home, '.claude', 'cct.json'),
    join(home, '.cct.json'),
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown, fallback: readonly string[]): readonly string[] {
  if (!Array.isArray(value)) return fallback;
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

const VALID_LINES: readonly LineId[] = ['identity', 'health', 'activity', 'infra'];

function parseLines(value: unknown, fallback: readonly LineId[]): readonly LineId[] {
  if (!Array.isArray(value)) return fallback;
  const lines = value.filter(
    (entry): entry is LineId =>
      typeof entry === 'string' && (VALID_LINES as readonly string[]).includes(entry),
  );
  return lines.length === 0 ? fallback : lines;
}

function parseThresholds(value: unknown): HealthThresholds {
  if (!isRecord(value)) return DEFAULT_THRESHOLDS;

  const context = isRecord(value['context']) ? value['context'] : {};
  const quota = isRecord(value['quota']) ? value['quota'] : {};
  const git = isRecord(value['git']) ? value['git'] : {};
  const cost = isRecord(value['cost']) ? value['cost'] : {};

  return {
    context: {
      warnPercentage: positiveNumber(
        context['warnPercentage'],
        DEFAULT_THRESHOLDS.context.warnPercentage,
      ),
      criticalPercentage: positiveNumber(
        context['criticalPercentage'],
        DEFAULT_THRESHOLDS.context.criticalPercentage,
      ),
      warnMinutesToFull: positiveNumber(
        context['warnMinutesToFull'],
        DEFAULT_THRESHOLDS.context.warnMinutesToFull,
      ),
    },
    quota: {
      warnPercentage: positiveNumber(
        quota['warnPercentage'],
        DEFAULT_THRESHOLDS.quota.warnPercentage,
      ),
      criticalPercentage: positiveNumber(
        quota['criticalPercentage'],
        DEFAULT_THRESHOLDS.quota.criticalPercentage,
      ),
    },
    git: {
      warnUncommittedFiles: positiveNumber(
        git['warnUncommittedFiles'],
        DEFAULT_THRESHOLDS.git.warnUncommittedFiles,
      ),
      warnMinutesSinceCommit: positiveNumber(
        git['warnMinutesSinceCommit'],
        DEFAULT_THRESHOLDS.git.warnMinutesSinceCommit,
      ),
    },
    cost: {
      warnUsdPerHour: positiveNumber(
        cost['warnUsdPerHour'],
        DEFAULT_THRESHOLDS.cost.warnUsdPerHour,
      ),
    },
  };
}

/** Narrows parsed JSON into a config, filling anything missing or invalid from defaults. */
export function parseConfig(raw: unknown): TowerConfig {
  if (!isRecord(raw)) return DEFAULT_CONFIG;

  const glyphs = raw['glyphs'];
  const validGlyphs =
    glyphs === 'ascii' || glyphs === 'unicode' || glyphs === 'nerdfont' || glyphs === 'auto'
      ? glyphs
      : DEFAULT_CONFIG.glyphs;

  return {
    theme: typeof raw['theme'] === 'string' ? raw['theme'] : DEFAULT_CONFIG.theme,
    glyphs: validGlyphs,
    lines: parseLines(raw['lines'], DEFAULT_CONFIG.lines),
    disabledSegments: stringArray(raw['disabledSegments'], DEFAULT_CONFIG.disabledSegments),
    disabledPlugins: stringArray(raw['disabledPlugins'], DEFAULT_CONFIG.disabledPlugins),
    mutedRules: stringArray(raw['mutedRules'], DEFAULT_CONFIG.mutedRules),
    thresholds: parseThresholds(raw['thresholds']),
  };
}

export interface LoadedConfig {
  readonly config: TowerConfig;
  /** Path the config came from, or `null` when defaults were used. */
  readonly source: string | null;
}

/** Loads the first config file found, or the defaults. Never throws. */
export async function loadConfig(cwd: string, home = homedir()): Promise<LoadedConfig> {
  for (const path of configSearchPaths(cwd, home)) {
    try {
      const text = await readFile(path, 'utf8');
      return { config: parseConfig(JSON.parse(text)), source: path };
    } catch {
      // Missing is the common case and not worth distinguishing from malformed
      // here; `cct doctor` reports the difference, where it is actionable.
      continue;
    }
  }

  return { config: DEFAULT_CONFIG, source: null };
}
