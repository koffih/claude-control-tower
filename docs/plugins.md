# Writing a plugin

A plugin contributes two things: **segments** (something to draw) and **rules**
(something to advise). Nothing else. That is the whole contract.

The four plugins that ship with the tower are built against this same public SDK,
with no privileged access — so anything they can do, you can do.

## The shape of a plugin

```ts
import { definePlugin } from '@cct/plugin-sdk';

export default definePlugin({
  id: 'api-share',
  description: 'How much of the session was spent waiting on the model.',
  segments: [
    {
      id: 'api-share',
      line: 'infra',
      priority: 'low',
      render: ({ snapshot, styler, theme }) => {
        const { total_duration_ms, total_api_duration_ms } = snapshot.input.cost;
        if (total_duration_ms === 0) return null;

        const share = Math.round((total_api_duration_ms / total_duration_ms) * 100);
        return styler.apply(`api ${share}%`, { color: theme.muted });
      },
    },
  ],
});
```

## The three rules that make this safe

**Segments are synchronous and cannot perform I/O.** Everything you need is
already on the snapshot. This is what makes the render budget enforceable rather
than aspirational — Claude Code cancels a status line that overruns its 300ms
debounce, so one plugin awaiting a network call would break the line for
everybody. If you need data from outside, contribute a collector (see below).

**Segments return text, not escape sequences.** Colour goes through the provided
`styler`, which means your plugin automatically inherits theme support, colour
degradation across truecolor / 256 / 16 / none, and `NO_COLOR` — without knowing
any of that exists.

**A segment that throws is dropped, never fatal.** The registry catches it,
records it for `cct doctor`, and renders everything else. Write direct code
rather than defensive code.

## Choosing a line

The tower has a fixed information architecture. Users learn where to look once,
and every plugin respects the map.

| `line`     | Answers                             |
| ---------- | ----------------------------------- |
| `identity` | Where am I, what am I talking to    |
| `health`   | What am I running out of            |
| `activity` | Is it safe to let this keep running |
| `infra`    | Agents, infrastructure, and advice  |

## Choosing a priority

Priority decides what survives on a narrow terminal. Be honest:

| `priority` | For                                                            |
| ---------- | -------------------------------------------------------------- |
| `critical` | The reason the line exists. An active alarm, not a preference. |
| `high`     | You would notice its absence immediately.                      |
| `normal`   | Useful, but the line still works without it.                   |
| `low`      | Decorative, or rarely relevant.                                |

Most segments are `normal` or `low`. If everything is `critical`, nothing is.

## Rendering nothing

Returning `null` is the normal, expected way to say "not applicable this frame" —
no PR open, not in a repository, no rate limit data. It is not a failure and is
not reported anywhere.

**Never render a placeholder for absent data.** No zeros, no empty gauges, no
`n/a`. A permanently-zero bar is worse than no bar: it occupies width, teaches
the eye to skip that region, and is still being skipped on the day it finally
means something.

## Contributing a rule

Rules are pure functions from a snapshot to at most one finding. They are the
most valuable thing a plugin can add, because they are the part that tells the
user what to do.

```ts
import { definePlugin } from '@cct/plugin-sdk';

export default definePlugin({
  id: 'slow-api',
  description: 'Notices when the session is dominated by waiting.',
  rules: [
    {
      id: 'api-bound',
      description: 'Warns when most of the session is spent waiting on the model.',
      evaluate: (snapshot) => {
        const { total_duration_ms, total_api_duration_ms } = snapshot.input.cost;
        if (total_duration_ms < 10 * 60_000) return null;
        if (total_api_duration_ms / total_duration_ms < 0.8) return null;

        return {
          ruleId: 'api-bound',
          severity: 'info',
          title: 'api bound',
          advice: 'most of this session is waiting - try a faster model for the routine steps',
        };
      },
    },
  ],
});
```

Bundle a rule with the segment it relates to. A plugin that draws a quota gauge
should also own the rule that advises on quota, so enabling or disabling the
plugin moves both together and the tower never advises about something it is not
showing.

### The bar for advice

Advice is the product, and it is held to a stricter standard than anything else:

- **One line.** Not a sentence more.
- **Imperative.** `run /compact now`, not `you may want to consider compacting`.
- **Lowercase first letter, no trailing period.**
- **Concrete.** Include the number that makes it actionable. `only 6.2k tokens
left` beats `context is nearly full`.
- **ASCII only.** The ASCII glyph tier exists for terminals that cannot render
  more; an em dash defeats it.

If you cannot phrase the remedy in one imperative line, the rule is not ready.
A rule that fires without advice is a rule that should not fire.

## Testing a plugin

`@cct/core` exports snapshot builders precisely so you do not have to hand-write
a `SessionSnapshot` — and so your tests do not break every time Claude Code adds
a payload field.

```ts
import { makeSnapshot } from '@cct/core';
import { PLAIN_CAPABILITIES, Styler, TOWER_DARK } from '@cct/render';
import { expect, it } from 'vitest';
import plugin from './my-plugin.js';

const context = {
  snapshot: makeSnapshot({
    input: { cost: { total_duration_ms: 1000, total_api_duration_ms: 900 } },
  }),
  health: { findings: [], overall: 'ok' as const },
  theme: TOWER_DARK,
  styler: new Styler(PLAIN_CAPABILITIES),
  capabilities: PLAIN_CAPABILITIES,
  glyphs: 'ascii' as const,
  icon: () => '*',
};

it('shows the api share', () => {
  expect(plugin.segments?.[0]?.render(context)).toBe('api 90%');
});
```

`makeSnapshot` takes a deep-partial override and fills the rest from a healthy
baseline, so a test states only the thing it is actually about.

## If you need data from outside

Segments cannot do I/O, so external data has to reach the snapshot first. That
means contributing a collector to `@cct/collectors`. Two requirements:

- **A time budget.** Wrap the work in `withBudget`, and pick a number that fits
  inside the total. Look at `BUDGETS` for the existing allocations.
- **A cache, if it is expensive.** `readCache`/`writeCache` handle this, keyed by
  `session_id`. Never key on `process.pid` — it changes on every invocation and
  defeats the cache entirely.

Open an issue before writing one; collectors are on everybody's render path and
the budget is shared.

## Publishing

Name the package `cct-plugin-<name>` and add `claude-control-tower-plugin` to its
keywords, so it is discoverable. Depend on `@cct/plugin-sdk` and nothing else
from this project — reaching into `@cct/core` or `@cct/render` directly means
your plugin breaks on changes that were never meant to affect you.
