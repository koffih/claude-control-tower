import type { StatusInput } from '@cct/core';

/**
 * Synthetic payloads.
 *
 * Used by `cct status --demo` and by `cct doctor`, which both need a realistic
 * payload without a live Claude Code session. The scenarios double as the source
 * for the screenshots in the README, so what the documentation shows is generated
 * by the same code path users run — documentation that cannot drift.
 */

export type DemoScenario = 'healthy' | 'pressured' | 'critical';

export const DEMO_SCENARIOS: readonly DemoScenario[] = ['healthy', 'pressured', 'critical'];

/** A calm, mid-session state. Nothing on the tower should be shouting. */
export function demoStatusInput(cwd: string, now: number): StatusInput {
  return {
    cwd,
    session_id: 'demo-session',
    session_name: 'refactor-auth',
    transcript_path: '',
    model: { id: 'claude-opus-5', display_name: 'Opus' },
    workspace: {
      current_dir: cwd,
      project_dir: cwd,
      added_dirs: [],
      repo: { host: 'github.com', owner: 'acme', name: 'atlas' },
    },
    version: '2.1.221',
    output_style: { name: 'default' },
    cost: {
      total_cost_usd: 1.24,
      total_duration_ms: 42 * 60_000,
      total_api_duration_ms: 9 * 60_000,
      total_lines_added: 248,
      total_lines_removed: 71,
    },
    context_window: {
      total_input_tokens: 58_000,
      total_output_tokens: 6_400,
      context_window_size: 200_000,
      used_percentage: 32,
      remaining_percentage: 68,
      current_usage: {
        input_tokens: 1_400,
        output_tokens: 900,
        cache_creation_input_tokens: 3_200,
        cache_read_input_tokens: 52_000,
      },
    },
    exceeds_200k_tokens: false,
    fast_mode: false,
    thinking: { enabled: true },
    effort: { level: 'high' },
    rate_limits: {
      five_hour: { used_percentage: 34, resets_at: Math.floor(now / 1000) + 3 * 3600 },
      seven_day: { used_percentage: 48, resets_at: Math.floor(now / 1000) + 4 * 86_400 },
    },
    pr: { number: 412, url: 'https://github.com/acme/atlas/pull/412', review_state: 'pending' },
  };
}

/** Context filling and the 5-hour window under pressure: the tower should start advising. */
export function demoPressured(cwd: string, now: number): StatusInput {
  const base = demoStatusInput(cwd, now);

  return {
    ...base,
    context_window: {
      ...base.context_window,
      total_input_tokens: 152_000,
      total_output_tokens: 12_000,
      used_percentage: 82,
      remaining_percentage: 18,
    },
    cost: { ...base.cost, total_cost_usd: 6.8, total_duration_ms: 2.4 * 3_600_000 },
    rate_limits: {
      five_hour: { used_percentage: 86, resets_at: Math.floor(now / 1000) + 47 * 60 },
      seven_day: { used_percentage: 61, resets_at: Math.floor(now / 1000) + 3 * 86_400 },
    },
  };
}

/** Both the context window and the 5-hour window nearly spent: the tower should be red. */
export function demoCritical(cwd: string, now: number): StatusInput {
  const base = demoStatusInput(cwd, now);

  return {
    ...base,
    model: { id: 'claude-opus-5', display_name: 'Opus' },
    context_window: {
      ...base.context_window,
      total_input_tokens: 184_000,
      total_output_tokens: 9_800,
      used_percentage: 96,
      remaining_percentage: 4,
    },
    exceeds_200k_tokens: true,
    cost: { ...base.cost, total_cost_usd: 14.2, total_duration_ms: 4.1 * 3_600_000 },
    rate_limits: {
      five_hour: { used_percentage: 97, resets_at: Math.floor(now / 1000) + 12 * 60 },
      seven_day: { used_percentage: 74, resets_at: Math.floor(now / 1000) + 2 * 86_400 },
    },
    pr: {
      number: 412,
      url: 'https://github.com/acme/atlas/pull/412',
      review_state: 'changes_requested',
    },
  };
}

export function demoInput(scenario: DemoScenario, cwd: string, now: number): StatusInput {
  switch (scenario) {
    case 'healthy':
      return demoStatusInput(cwd, now);
    case 'pressured':
      return demoPressured(cwd, now);
    case 'critical':
      return demoCritical(cwd, now);
  }
}
