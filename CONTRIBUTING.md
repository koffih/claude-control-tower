# Contributing

Contributions are welcome. This document is short on purpose.

## Getting set up

```bash
git clone https://github.com/koffih/claude-control-tower
cd claude-control-tower
npm install
npm run verify
```

`npm run verify` runs formatting, linting, typechecking and tests — the same
gates CI runs. If it passes locally it will pass there.

To see your change:

```bash
npm run build
node packages/cli/bin/cct.js status --demo all
```

Tests run against source, not `dist`, so `npm test` does not need a build first.

## The quickest useful contribution

A health rule. They are pure functions from a snapshot to at most one finding,
roughly twenty lines, and testable with a literal object.

```ts
// packages/core/src/health/rules/my-rules.ts
export function somethingWorthSayingRule(thresholds: HealthThresholds): HealthRule {
  return {
    id: 'something-worth-saying',
    description: 'One sentence, shown by cct doctor.',
    evaluate: (snapshot) => {
      if (!worthSaying(snapshot)) return null;

      return {
        ruleId: 'something-worth-saying',
        severity: 'warn',
        title: 'short badge',
        advice: 'do this specific thing',
      };
    },
  };
}
```

Register it in `builtinRules()`, add a test in `engine.test.ts`, done.

**The bar for a new rule is that it produces advice.** Any dashboard can show a
number. A rule that fires without telling the user what to do about it is a rule
that should not fire. If you cannot phrase the remedy in one imperative line, the
rule is not ready.

## House style

The tooling enforces formatting, so there is nothing to argue about there. What
it cannot enforce:

**Comments explain why, not what.** The code already says what it does. A comment
earns its place by recording a decision, a constraint, or a trap — something the
next person would otherwise have to rediscover. If a comment restates the line
below it, delete it.

**Absent data renders nothing.** No zeros, no placeholders, no empty gauges. If
there is no PR, the PR segment does not exist this frame. `null` from a segment
is the normal way to say "not applicable".

**Colour is never the only signal.** Every state carries a number or an icon
alongside its colour, so the tower stays readable in a monochrome terminal and to
a colour-blind reader.

**Nothing on the render path is unbounded.** If your change performs I/O, it goes
in `@cct/collectors` behind a time budget. `@cct/core` may not import `node:fs`
and the linter will tell you so.

**User-facing text is ASCII.** The ASCII glyph tier exists for terminals that
cannot render more; an em dash in an advice string defeats it.

## Advice, specifically

Advice strings are the product. They are held to a stricter standard than the
rest of the code, and there are tests asserting it:

- One line. No sentence beyond what fits.
- Imperative. `run /compact now`, not `you may want to consider compacting`.
- Lowercase first letter, no trailing period.
- Concrete. Include the number that makes it actionable — `only 6.2k tokens left`
  beats `context is nearly full`.

## Pull requests

Small and focused beats large and complete. If you are planning something big,
open an issue first so we can agree the shape before you spend the time.

Every PR needs:

- A green `npm run verify`.
- Tests for behaviour you added or changed. A bug fix should come with the test
  that would have caught it.
- A note in the PR describing how you verified it by hand, if it is visual.

The PR template asks you to check narrow terminals and the ASCII fallback for
rendering changes. Those two catch most visual regressions.

## Adding a segment

Segments live in a plugin. Before adding one to a built-in plugin, consider
whether it should be its own plugin instead — see [docs/plugins.md](docs/plugins.md).

If it does belong in a built-in one, pick its `line` from the fixed information
architecture (identity, health, activity, infra) and pick its `priority`
honestly. `critical` is for segments that are the reason the line exists, not for
segments you personally like. Everything decorative is `low`.

## Reporting bugs

Run `cct doctor` and paste its output. It checks the wiring, the config and the
render budget, and answers most of what we would otherwise have to ask.

For rendering problems, `cct status --demo all` is ideal: it uses fixed data, so
we see exactly what you see.

## Security

Please do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).

## Code of conduct

Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licensing

By contributing you agree that your contributions are licensed under the
[MIT License](LICENSE).
