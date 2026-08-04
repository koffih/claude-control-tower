import { describe, expect, it } from 'vitest';
import { baseStatusInput } from '../testing/fixtures.js';
import { parseStatusInput, parseStatusInputText } from './parse-status-input.js';

describe('parseStatusInput', () => {
  it('round-trips a complete payload unchanged', () => {
    const original = baseStatusInput();
    expect(parseStatusInput(JSON.parse(JSON.stringify(original)))).toEqual(original);
  });

  it('preserves every optional field when present', () => {
    const parsed = parseStatusInput({
      ...baseStatusInput(),
      session_name: 'refactor-auth',
      prompt_id: '550e8400-e29b-41d4-a716-446655440000',
      rate_limits: {
        five_hour: { used_percentage: 23.5, resets_at: 1_738_425_600 },
        seven_day: { used_percentage: 41.2, resets_at: 1_738_857_600 },
      },
      vim: { mode: 'INSERT' },
      agent: { name: 'security-reviewer' },
      pr: {
        number: 1234,
        url: 'https://github.com/acme/project/pull/1234',
        review_state: 'pending',
      },
      worktree: {
        name: 'my-feature',
        path: '/tmp/worktrees/my-feature',
        branch: 'worktree-my-feature',
        original_cwd: '/home/dev/project',
        original_branch: 'main',
      },
    });

    expect(parsed.session_name).toBe('refactor-auth');
    expect(parsed.rate_limits?.five_hour?.used_percentage).toBe(23.5);
    expect(parsed.vim?.mode).toBe('INSERT');
    expect(parsed.agent?.name).toBe('security-reviewer');
    expect(parsed.pr?.review_state).toBe('pending');
    expect(parsed.worktree?.branch).toBe('worktree-my-feature');
  });

  // Absence is a first-class state in this contract, and the difference between
  // "absent" and "present but zero" changes what the tower renders.
  it('omits optional fields rather than defaulting them', () => {
    const parsed = parseStatusInput(baseStatusInput());

    expect('rate_limits' in parsed).toBe(false);
    expect('pr' in parsed).toBe(false);
    expect('vim' in parsed).toBe(false);
    expect('worktree' in parsed).toBe(false);
    expect('session_name' in parsed).toBe(false);
  });

  it('drops a rate-limit window that is missing its percentage', () => {
    const parsed = parseStatusInput({
      ...baseStatusInput(),
      rate_limits: { five_hour: { resets_at: 1_738_425_600 } },
    });

    expect(parsed.rate_limits).toBeUndefined();
  });

  it('keeps one rate-limit window when the other is absent', () => {
    const parsed = parseStatusInput({
      ...baseStatusInput(),
      rate_limits: { seven_day: { used_percentage: 41.2, resets_at: 1_738_857_600 } },
    });

    expect(parsed.rate_limits?.five_hour).toBeUndefined();
    expect(parsed.rate_limits?.seven_day?.used_percentage).toBe(41.2);
  });

  // A half-parsed repo identity would render a broken clickable link.
  it('drops a partial repo identity', () => {
    const parsed = parseStatusInput({
      ...baseStatusInput(),
      workspace: {
        current_dir: '/x',
        project_dir: '/x',
        added_dirs: [],
        repo: { host: 'github.com' },
      },
    });

    expect(parsed.workspace.repo).toBeUndefined();
  });

  it('rejects enum values it does not recognise', () => {
    const parsed = parseStatusInput({
      ...baseStatusInput(),
      effort: { level: 'ultra' },
      vim: { mode: 'GODMODE' },
      pr: { number: 7, url: 'https://example.com/pull/7', review_state: 'vibes' },
    });

    expect(parsed.effort).toBeUndefined();
    expect(parsed.vim).toBeUndefined();
    expect(parsed.pr?.review_state).toBeUndefined();
    expect(parsed.pr?.number).toBe(7);
  });

  it('treats null current_usage as a distinct state, not a zeroed object', () => {
    const input = baseStatusInput();
    const parsed = parseStatusInput({
      ...input,
      context_window: { ...input.context_window, current_usage: null },
    });

    expect(parsed.context_window.current_usage).toBeNull();
  });

  it('derives context percentages when Claude Code stops sending them', () => {
    const parsed = parseStatusInput({
      ...baseStatusInput(),
      context_window: {
        total_input_tokens: 50_000,
        total_output_tokens: 10_000,
        context_window_size: 200_000,
        current_usage: null,
      },
    });

    expect(parsed.context_window.used_percentage).toBe(30);
    expect(parsed.context_window.remaining_percentage).toBe(70);
  });

  it('clamps percentages into range', () => {
    const parsed = parseStatusInput({
      ...baseStatusInput(),
      context_window: { ...baseStatusInput().context_window, used_percentage: 240 },
    });

    expect(parsed.context_window.used_percentage).toBe(100);
  });

  it('rejects non-finite numbers that would poison downstream arithmetic', () => {
    const parsed = parseStatusInput({
      ...baseStatusInput(),
      cost: { ...baseStatusInput().cost, total_cost_usd: Number.NaN },
    });

    expect(parsed.cost.total_cost_usd).toBe(0);
  });

  // The whole point of hand-rolling the parser: never fail closed on a render path.
  it.each([[null], [undefined], ['a string'], [42], [[]], [{}]])(
    'yields a usable object for junk input %j',
    (junk) => {
      const parsed = parseStatusInput(junk);

      expect(parsed.model.display_name).toBe('unknown');
      expect(parsed.context_window.context_window_size).toBe(200_000);
      expect(parsed.cost.total_cost_usd).toBe(0);
    },
  );

  it('ignores unknown fields so a Claude Code upgrade cannot break rendering', () => {
    const parsed = parseStatusInput({ ...baseStatusInput(), some_future_field: { nested: true } });

    expect(parsed.model.id).toBe('claude-opus-5');
    expect('some_future_field' in parsed).toBe(false);
  });
});

describe('parseStatusInputText', () => {
  it('parses well-formed JSON text', () => {
    expect(parseStatusInputText(JSON.stringify(baseStatusInput())).session_id).toBe(
      'session-fixture-0001',
    );
  });

  it('falls back to defaults on malformed JSON instead of throwing', () => {
    expect(() => parseStatusInputText('{ not json')).not.toThrow();
    expect(parseStatusInputText('{ not json').model.id).toBe('unknown');
  });

  it('falls back to defaults on empty stdin', () => {
    expect(parseStatusInputText('').version).toBe('0.0.0');
  });
});
