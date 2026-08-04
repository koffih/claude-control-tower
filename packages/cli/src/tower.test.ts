import { stripAnsi } from '@cct/render';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config/config.js';
import { demoInput, type DemoScenario } from './demo.js';
import { renderTower } from './tower.js';

/**
 * End-to-end rendering.
 *
 * These go through the real pipeline — collect, judge, draw, fit — with only the
 * clock and the environment injected. They are the tests that would catch a
 * regression the unit tests cannot see, such as a line that stops rendering
 * because two layers disagree about a field name.
 */

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const CWD = process.cwd();

const wideTerminal = { COLUMNS: '140', LINES: '40', TERM: 'xterm-256color' } as const;

async function render(scenario: DemoScenario, env: Record<string, string> = wideTerminal) {
  const result = await renderTower({
    input: demoInput(scenario, CWD, NOW),
    config: DEFAULT_CONFIG,
    env,
    now: NOW,
  });

  return { ...result, plain: stripAnsi(result.text) };
}

describe('rendering a healthy session', () => {
  it('draws the identity, health and activity lines', async () => {
    const { plain } = await render('healthy');
    const lines = plain.split('\n');

    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(plain).toContain('Opus');
    expect(plain).toContain('acme/atlas');
    expect(plain).toContain('32%');
  });

  it('renders every segment without one throwing', async () => {
    const { failures } = await render('healthy');
    expect(failures).toEqual([]);
  });

  // Advice is the differentiator, and its absence is meaningful: a calm session
  // should not be told to do anything.
  it('offers no advice when nothing is wrong', async () => {
    const { plain } = await render('healthy');

    expect(plain).not.toContain('/compact');
    expect(plain).not.toMatch(/limit/);
  });
});

describe('rendering a session under pressure', () => {
  it('advises compaction as context fills', async () => {
    const { plain } = await render('pressured');

    expect(plain).toContain('82%');
    expect(plain).toContain('/compact');
  });

  it('shows the quota reset time once a window is under pressure', async () => {
    const { plain } = await render('pressured');
    expect(plain).toMatch(/5h .*86%/);
  });
});

describe('rendering a critical session', () => {
  it('escalates the advice to act now', async () => {
    const { plain } = await render('critical');

    expect(plain).toContain('96%');
    expect(plain).toContain('now');
  });

  it('prioritises the most severe finding', async () => {
    const { plain } = await render('critical');
    const adviceLine = plain.split('\n').at(-1) ?? '';

    // Context at 96% outranks everything else in this scenario.
    expect(adviceLine).toContain('/compact');
  });
});

describe('responsive behaviour', () => {
  it.each([40, 60, 80, 100, 120, 200])('never overflows a %i-column terminal', async (columns) => {
    const { text } = await render('critical', { ...wideTerminal, COLUMNS: String(columns) });

    for (const line of stripAnsi(text).split('\n')) {
      expect(line.length).toBeLessThanOrEqual(columns);
    }
  });

  it('still says something useful in a very narrow terminal', async () => {
    const { plain } = await render('critical', { ...wideTerminal, COLUMNS: '30' });

    expect(plain.trim().length).toBeGreaterThan(0);
  });

  it('never uses more than half the terminal height', async () => {
    const { text } = await render('healthy', { ...wideTerminal, LINES: '6' });

    expect(text.split('\n').length).toBeLessThanOrEqual(3);
  });
});

describe('terminal degradation', () => {
  // Deliberately set alongside signals that would otherwise enable colour *and*
  // OSC 8 hyperlinks, since that is the case where a leak actually happens.
  it('emits no escape sequences at all when NO_COLOR is set', async () => {
    const { text } = await render('critical', {
      ...wideTerminal,
      NO_COLOR: '1',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'WezTerm',
      WT_SESSION: 'abc',
    });

    expect(text).toBe(stripAnsi(text));
    expect(text).not.toContain(String.fromCharCode(27));
  });

  it('renders legibly with ASCII glyphs only', async () => {
    const { text } = await render('critical', { ...wideTerminal, CCT_GLYPHS: 'ascii' });
    const plain = stripAnsi(text);

    expect(plain).toMatch(/^[\x20-\x7e\n]*$/);
    expect(plain).toContain('96%');
  });
});

describe('configuration', () => {
  it('omits lines the user turned off', async () => {
    const { text } = await renderTower({
      input: demoInput('healthy', CWD, NOW),
      config: { ...DEFAULT_CONFIG, lines: ['health'] },
      env: wideTerminal,
      now: NOW,
    });

    expect(stripAnsi(text).split('\n')).toHaveLength(1);
    expect(stripAnsi(text)).not.toContain('Opus');
  });

  it('omits disabled segments', async () => {
    const { text } = await renderTower({
      input: demoInput('healthy', CWD, NOW),
      config: { ...DEFAULT_CONFIG, disabledSegments: ['cost'] },
      env: wideTerminal,
      now: NOW,
    });

    expect(stripAnsi(text)).not.toContain('1.24');
  });

  it('silences muted rules', async () => {
    const { text } = await renderTower({
      input: demoInput('critical', CWD, NOW),
      config: { ...DEFAULT_CONFIG, mutedRules: ['context-pressure', 'quota-five-hour'] },
      env: wideTerminal,
      now: NOW,
    });

    expect(stripAnsi(text)).not.toContain('/compact');
  });
});

describe('performance', () => {
  /**
   * Claude Code debounces status line updates at 300ms and cancels a run that is
   * still going when the next update arrives. Overrunning does not make the line
   * late — it can stop it appearing at all — so the budget is a correctness
   * property, not a nicety.
   *
   * The ceiling is deliberately loose: this runs on shared CI hardware, and a
   * flaky performance test gets deleted rather than fixed. It is here to catch an
   * order-of-magnitude regression, not to measure milliseconds.
   */
  it('renders well inside the debounce window', async () => {
    await render('healthy');

    const started = performance.now();
    await render('healthy');
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(250);
  });
});
