import { describe, expect, it } from 'vitest';
import { makeSnapshot } from '../testing/fixtures.js';
import { builtinRules, evaluateHealth, primaryAdvice } from './engine.js';
import { DEFAULT_THRESHOLDS } from './thresholds.js';
import type { HealthRule } from './types.js';

/**
 * The health engine is the product. These tests assert the two properties users
 * actually depend on: that advice appears exactly when it should, and that one
 * misbehaving rule can never take the status line down.
 */

const findingIds = (snapshot: Parameters<typeof evaluateHealth>[0]): string[] =>
  evaluateHealth(snapshot).findings.map((finding) => finding.ruleId);

describe('a healthy session', () => {
  it('produces no findings at all', () => {
    const report = evaluateHealth(makeSnapshot());

    expect(report.findings).toEqual([]);
    expect(report.overall).toBe('ok');
    expect(primaryAdvice(report)).toBeNull();
  });
});

describe('context pressure', () => {
  it('stays silent below the warning threshold', () => {
    const snapshot = makeSnapshot({ input: { context_window: { used_percentage: 74 } } });
    expect(findingIds(snapshot)).not.toContain('context-pressure');
  });

  it('warns at the threshold and names the remedy', () => {
    const snapshot = makeSnapshot({ input: { context_window: { used_percentage: 80 } } });
    const finding = evaluateHealth(snapshot).findings.find((f) => f.ruleId === 'context-pressure');

    expect(finding?.severity).toBe('warn');
    expect(finding?.advice).toContain('/compact');
  });

  it('escalates to critical and demands action now', () => {
    const snapshot = makeSnapshot({ input: { context_window: { used_percentage: 95 } } });
    const finding = evaluateHealth(snapshot).findings.find((f) => f.ruleId === 'context-pressure');

    expect(finding?.severity).toBe('critical');
    expect(finding?.advice).toContain('now');
  });

  // 1M-context models must not be told they are full at 200k.
  it('reports remaining tokens against the real window size, not a fixed 200k', () => {
    const snapshot = makeSnapshot({
      input: {
        context_window: {
          context_window_size: 1_000_000,
          total_input_tokens: 910_000,
          total_output_tokens: 10_000,
          used_percentage: 92,
        },
      },
    });

    const finding = evaluateHealth(snapshot).findings.find((f) => f.ruleId === 'context-pressure');
    expect(finding?.advice).toContain('80k');
  });
});

describe('rate limits', () => {
  it('says nothing when Claude Code sends no rate_limits at all', () => {
    // The common case for users without a subscription. Silence, not zeros.
    const ids = findingIds(makeSnapshot());
    expect(ids).not.toContain('quota-five-hour');
    expect(ids).not.toContain('quota-seven-day');
  });

  it('warns on a filling 5-hour window and includes the reset time', () => {
    const snapshot = makeSnapshot({
      input: { rate_limits: { five_hour: { used_percentage: 88, resets_at: 1_800_000_000 } } },
    });
    const finding = evaluateHealth(snapshot).findings.find((f) => f.ruleId === 'quota-five-hour');

    expect(finding?.severity).toBe('warn');
    expect(finding?.advice).toMatch(/resets/);
  });

  it('treats the two windows independently', () => {
    const snapshot = makeSnapshot({
      input: {
        rate_limits: {
          five_hour: { used_percentage: 12, resets_at: 1_800_000_000 },
          seven_day: { used_percentage: 97, resets_at: 1_800_000_000 },
        },
      },
    });

    const ids = findingIds(snapshot);
    expect(ids).not.toContain('quota-five-hour');
    expect(ids).toContain('quota-seven-day');
    expect(evaluateHealth(snapshot).overall).toBe('critical');
  });
});

describe('git rules', () => {
  it('needs both many files and a long silence before nagging about commits', () => {
    const manyFilesRecently = makeSnapshot({
      git: { modified: 30, lastCommitAt: Date.UTC(2026, 0, 15, 11, 50) },
    });
    expect(findingIds(manyFilesRecently)).not.toContain('uncommitted-work');

    const fewFilesLongAgo = makeSnapshot({
      git: { modified: 1, untracked: 0, lastCommitAt: Date.UTC(2026, 0, 14) },
    });
    expect(findingIds(fewFilesLongAgo)).not.toContain('uncommitted-work');

    const manyFilesLongAgo = makeSnapshot({
      git: { modified: 30, lastCommitAt: Date.UTC(2026, 0, 14) },
    });
    expect(findingIds(manyFilesLongAgo)).toContain('uncommitted-work');
  });

  it('treats conflicts as critical', () => {
    const snapshot = makeSnapshot({ git: { conflicted: 3 } });
    const finding = evaluateHealth(snapshot).findings.find((f) => f.ruleId === 'merge-conflict');

    expect(finding?.severity).toBe('critical');
    expect(finding?.advice).toContain('3');
  });

  it('flags an in-progress rebase', () => {
    const snapshot = makeSnapshot({ git: { operationInProgress: 'rebase' } });
    const finding = evaluateHealth(snapshot).findings.find((f) => f.ruleId === 'git-operation');

    expect(finding?.advice).toContain('rebase');
  });

  it('flags a detached HEAD but not a normal branch', () => {
    expect(findingIds(makeSnapshot({ git: { branch: null } }))).toContain('detached-head');
    expect(findingIds(makeSnapshot({ git: { branch: 'main' } }))).not.toContain('detached-head');
  });

  it('says nothing about git outside a repository', () => {
    const ids = findingIds(makeSnapshot({ git: null }));

    expect(ids).not.toContain('uncommitted-work');
    expect(ids).not.toContain('detached-head');
    expect(ids).not.toContain('merge-conflict');
  });
});

describe('ordering and precedence', () => {
  it('sorts findings by descending severity', () => {
    const snapshot = makeSnapshot({
      git: { conflicted: 1 },
      input: {
        context_window: { used_percentage: 80 },
        cost: { total_cost_usd: 40, total_duration_ms: 3_600_000 },
      },
    });

    const severities = evaluateHealth(snapshot).findings.map((finding) => finding.severity);
    expect(severities).toEqual(
      [...severities].sort((a, b) => (a === b ? 0 : a === 'critical' ? -1 : 1)),
    );
    expect(primaryAdvice(evaluateHealth(snapshot))?.severity).toBe('critical');
  });

  // Two rules describing the same problem is noise, so velocity defers to pressure.
  it('suppresses the velocity warning once pressure is already critical', () => {
    const snapshot = makeSnapshot({
      input: { context_window: { used_percentage: 95 } },
      transcript: {
        usageTimeline: [
          { at: Date.UTC(2026, 0, 15, 11, 55), contextTokens: 100_000 },
          { at: Date.UTC(2026, 0, 15, 12, 0), contextTokens: 190_000 },
        ],
      },
    });

    const ids = findingIds(snapshot);
    expect(ids).toContain('context-pressure');
    expect(ids).not.toContain('context-velocity');
  });
});

describe('configuration', () => {
  it('honours muted rule ids', () => {
    const snapshot = makeSnapshot({ git: { conflicted: 2 } });
    const report = evaluateHealth(snapshot, builtinRules(), { muted: ['merge-conflict'] });

    expect(report.findings).toEqual([]);
  });

  it('applies custom thresholds', () => {
    const snapshot = makeSnapshot({ input: { context_window: { used_percentage: 50 } } });
    const strict = builtinRules({
      ...DEFAULT_THRESHOLDS,
      context: { ...DEFAULT_THRESHOLDS.context, warnPercentage: 40 },
    });

    expect(evaluateHealth(snapshot, strict).findings.map((f) => f.ruleId)).toContain(
      'context-pressure',
    );
  });
});

describe('rule isolation', () => {
  // This is the guarantee that makes it safe to accept third-party rules.
  it('drops a rule that throws instead of failing the whole report', () => {
    const exploding: HealthRule = {
      id: 'exploding',
      description: 'Always throws.',
      evaluate: () => {
        throw new Error('boom');
      },
    };

    const snapshot = makeSnapshot({ git: { conflicted: 1 } });
    const report = evaluateHealth(snapshot, [exploding, ...builtinRules()]);

    expect(report.findings.map((finding) => finding.ruleId)).toContain('merge-conflict');
    expect(report.findings.map((finding) => finding.ruleId)).not.toContain('exploding');
  });
});

describe('every built-in rule', () => {
  const rules = builtinRules();

  it('has a unique, kebab-case id', () => {
    const ids = rules.map((rule) => rule.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  // Advice is the product. A rule that fires without it is a rule that failed.
  it('offers advice whenever it fires, phrased as a lowercase imperative', () => {
    const loud = makeSnapshot({
      git: { conflicted: 4, modified: 40, branch: null, lastCommitAt: Date.UTC(2026, 0, 1) },
      input: {
        context_window: { used_percentage: 99 },
        cost: { total_cost_usd: 90, total_duration_ms: 3_600_000 },
        rate_limits: {
          five_hour: { used_percentage: 99, resets_at: 1_800_000_000 },
          seven_day: { used_percentage: 99, resets_at: 1_800_000_000 },
        },
      },
    });

    const findings = evaluateHealth(loud, rules).findings;
    expect(findings.length).toBeGreaterThan(4);

    for (const finding of findings) {
      expect(finding.advice.length).toBeGreaterThan(10);
      expect(finding.advice).not.toMatch(/\.$/);
      expect(finding.advice[0]).toBe(finding.advice[0]?.toLowerCase());
      expect(finding.title.length).toBeGreaterThan(0);
    }
  });
});
