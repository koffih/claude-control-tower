import type { Severity } from '@cct/core';
import { hex, type Rgb } from '../ansi/style.js';

/**
 * A theme is a semantic palette, not a set of colours.
 *
 * Segments ask for `theme.severity('warn')` or `theme.muted`, never for orange.
 * That indirection is what lets a contributor add a theme without touching a
 * single segment, and what guarantees the traffic-light contract holds across
 * every theme: green means keep going, amber means act soon, red means act now.
 */
export interface Theme {
  readonly name: string;
  /** Primary text. */
  readonly text: Rgb;
  /** Secondary text: labels, units, separators. */
  readonly muted: Rgb;
  /** Identity accent, used for the model and session name. */
  readonly accent: Rgb;
  /** Colour carrying a severity. The traffic-light contract lives here. */
  severity(severity: Severity): Rgb;
  /** Unfilled portion of a gauge. */
  readonly gaugeEmpty: Rgb;
}

interface PaletteSpec {
  readonly name: string;
  readonly text: string;
  readonly muted: string;
  readonly accent: string;
  readonly ok: string;
  readonly info: string;
  readonly warn: string;
  readonly critical: string;
  readonly gaugeEmpty: string;
}

function buildTheme(spec: PaletteSpec): Theme {
  const severities: Record<Severity, Rgb> = {
    ok: hex(spec.ok),
    info: hex(spec.info),
    warn: hex(spec.warn),
    critical: hex(spec.critical),
  };

  return {
    name: spec.name,
    text: hex(spec.text),
    muted: hex(spec.muted),
    accent: hex(spec.accent),
    gaugeEmpty: hex(spec.gaugeEmpty),
    severity: (severity) => severities[severity],
  };
}

/**
 * The default theme, tuned for dark terminals.
 *
 * The greens and ambers are deliberately desaturated. A status line sits in
 * peripheral vision for hours, and fully saturated primaries read as an alarm
 * even when everything is fine — which trains the user to ignore the colour
 * exactly when it starts to matter.
 */
export const TOWER_DARK: Theme = buildTheme({
  name: 'tower-dark',
  text: '#c9d1d9',
  muted: '#6e7681',
  accent: '#b392f0',
  ok: '#57ab5a',
  info: '#6cb6ff',
  warn: '#e3b341',
  critical: '#f47067',
  gaugeEmpty: '#30363d',
});

/** The same semantics, darkened for light terminals where pale tones vanish. */
export const TOWER_LIGHT: Theme = buildTheme({
  name: 'tower-light',
  text: '#24292f',
  muted: '#6e7781',
  accent: '#8250df',
  ok: '#1a7f37',
  info: '#0969da',
  warn: '#9a6700',
  critical: '#cf222e',
  gaugeEmpty: '#d0d7de',
});

/**
 * A single-colour theme for terminals where colour is unavailable or unwanted.
 *
 * Severity still has to be communicable without hue, which is why every segment
 * pairs its colour with an icon and a number rather than relying on colour alone.
 * That is also what makes the output legible to colour-blind users.
 */
export const TOWER_MONO: Theme = buildTheme({
  name: 'tower-mono',
  text: '#ffffff',
  muted: '#999999',
  accent: '#ffffff',
  ok: '#ffffff',
  info: '#ffffff',
  warn: '#ffffff',
  critical: '#ffffff',
  gaugeEmpty: '#444444',
});

export const BUILTIN_THEMES: readonly Theme[] = [TOWER_DARK, TOWER_LIGHT, TOWER_MONO];

/** Looks up a theme by name, falling back to the default rather than throwing. */
export function themeByName(name: string | undefined): Theme {
  if (name === undefined) return TOWER_DARK;
  return BUILTIN_THEMES.find((theme) => theme.name === name) ?? TOWER_DARK;
}
