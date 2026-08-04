# Claude Control Tower

**A status line for Claude Code that tells you what to do, not just what happened.**

[![CI](https://github.com/koffih/claude-control-tower/actions/workflows/ci.yml/badge.svg)](https://github.com/koffih/claude-control-tower/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/claude-control-tower.svg)](https://www.npmjs.com/package/claude-control-tower)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20.10-brightgreen.svg)](package.json)

Every status line shows you that context is at 87%. This one tells you to run
`/compact` before it forces you to, and how many tokens you have left to finish
the thought you were in the middle of.

```
◆ Opus  acme/atlas  refactor-auth  high ✳
▣ ███░░░░░░░ 32% 136k left  5h ██░░░░ 34%  7d ██▌░░░ 48%  $1.24  ◷42m
⑂ main  ~2 ?2  +248 -71  ⇄412
```

Nothing is wrong, so nothing is said. Now watch the same session an hour later:

```
◆ Opus  acme/atlas  refactor-auth  high ✳
▣ ████████░░ 82% 36k left  5h █████░ 86% in 46m  7d ███▌░░ 61%  $6.80  ◷2h24
⑂ main  ~14 ?3  +248 -71  ⇄412
▲ wrap up the current step, then /compact (36k left)
```

And when it actually matters:

```
◆ Opus  acme/atlas  refactor-auth  high ✳
▣ █████████▌ 96% 6.2k left  5h █████▌ 97% in 11m  7d ████░░ 74%  $14.20  ◷4h05
⑂ main  ~14 ?3  +248 -71  ⇄412
■ run /compact now - only 6.2k tokens left
```

That last line is the whole point. Everything above it reports state; only that
line tells you what to do about it — and it appears exactly once, for the single
most urgent thing, because a status line offering five suggestions is a status
line nobody reads.

## Install

```bash
npm install -g claude-control-tower
cct init
```

`cct init` backs up your `settings.json` before touching it, shows you what it
will change, and asks first. Restart Claude Code and the tower is there.

Using a [Nerd Font](https://www.nerdfonts.com)? Get the nicer glyphs with:

```bash
cct init --glyphs nerdfont
```

## What it shows

Four rows, in a fixed order, so your eye learns where to look once.

| Row          | Answers                             | Contains                                                                   |
| ------------ | ----------------------------------- | -------------------------------------------------------------------------- |
| **Identity** | Where am I, what am I talking to    | model, repository, session name, effort / thinking / fast-mode badges      |
| **Health**   | What am I running out of            | context gauge, 5-hour and 7-day rate limits, cost, elapsed time            |
| **Activity** | Is it safe to let this keep running | branch, staged / modified / untracked / conflicted, ahead-behind, diff, PR |
| **Advice**   | What should I do about it           | one recommendation, or nothing at all                                      |

Colour is never the only signal. Every gauge carries a number, every state
carries an icon, and the whole tower stays readable in a monochrome terminal and
to a colour-blind reader.

## What it advises

Ten rules ship by default. Each one fires only when it has something actionable
to say, and each one says it in a single imperative line.

| Rule               | Fires when                                            | Example advice                                                             |
| ------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------- |
| `context-pressure` | the context window is filling                         | `wrap up the current step, then /compact (36k left)`                       |
| `context-velocity` | it will fill within minutes at the current rate       | `context is filling fast - finish this task before it forces a compact`    |
| `cache-efficiency` | little of the input is served from cache              | `cache reuse is low - avoid editing files already in context`              |
| `quota-five-hour`  | the 5-hour rate limit is filling                      | `5h limit is filling - resets in 46m, consider a lighter model`            |
| `quota-seven-day`  | the 7-day rate limit is filling                       | `7d limit nearly spent - it resets in 2d, ration what is left`             |
| `uncommitted-work` | many files changed and no commit for a long time      | `14 files changed, nothing committed for 2h - commit a checkpoint`         |
| `merge-conflict`   | files are left conflicted                             | `resolve 3 conflicted files before continuing`                             |
| `git-operation`    | a merge, rebase, cherry-pick or bisect is in progress | `finish or abort the rebase before letting the agent edit further`         |
| `detached-head`    | HEAD is detached                                      | `create a branch before committing, or the work becomes unreachable`       |
| `cost-velocity`    | spend per hour crosses your threshold                 | `spend is running high - a smaller model or tighter context would slow it` |

`context-velocity` is the one that earns its keep. A session at 40% climbing 12k
tokens a minute is in more trouble than one parked at 80%, and no raw gauge shows
that.

## It fits your terminal

The tower is fitted to the available width on every render, shedding its least
important segments rather than wrapping — because a status line that wraps pushes
your prompt around and corrupts the interface.

At 58 columns, the same critical session drops the 5-hour gauge, the cost and the
clock, and keeps what matters:

```
◆ Opus  acme/atlas  refactor-auth  high ✳
▣ █████████▌ 96% 6.2k left  7d ████░░ 74%
⑂ main  ~14 ?3  +248 -71  ⇄412
■ run /compact now - only 6.2k toke…
```

No Nerd Font, no Unicode, no colour? It still works:

```
* Opus | acme/atlas | refactor-auth | high *
# ========.. 82% 36k left | 5h =====. 86% in 46m | 7d ===-.. 61% | $6.80 | t2h24
br main | ~14 ?3 | +248 -71 | pr412
! wrap up the current step, then /compact (36k left)
```

`NO_COLOR` is honoured, and it suppresses hyperlink escapes too — so piping the
output somewhere gives you clean text.

## Performance is a correctness property

Claude Code debounces status line updates at 300ms and **cancels a run that is
still going** when the next update arrives. Overrunning the budget does not make
the tower late; it can stop it rendering at all. So:

- Every collector runs under an explicit time budget and degrades that one
  segment rather than the whole line.
- The transcript is read from the **tail** only. A long session's transcript
  reaches tens of megabytes; reading it whole would blow the budget by itself.
- `git status` is cached for two seconds, keyed by session id, so it is not
  spawned again on every keystroke.
- The published binary is a single bundled file — loading 45 separate modules
  cost about a third of the cold start.

Measured on a Windows laptop against a real session:

|                                   |        |
| --------------------------------- | ------ |
| Cold render                       | ~120ms |
| Warm render                       | ~90ms  |
| ...of which Node process startup  | ~60ms  |
| Budget before Claude Code cancels | 300ms  |

Check yours with `cct doctor`, which times a render and tells you if it is close.

## Configure it

Everything is optional; the tower is designed to be good with no config at all.
Drop a `~/.claude/cct.json`:

```json
{
  "theme": "tower-dark",
  "glyphs": "nerdfont",
  "lines": ["identity", "health", "activity", "infra"],
  "disabledSegments": ["cost", "duration"],
  "mutedRules": ["cost-velocity"],
  "thresholds": {
    "context": { "warnPercentage": 70, "criticalPercentage": 88 }
  }
}
```

See [docs/configuration.md](docs/configuration.md) for every option. Run
`cct plugins` to list the segment ids you can disable.

## Extend it

The four default plugins are built against the same public SDK as any
third-party one, with no privileged access — if the SDK were not enough to build
the default experience, it would not be enough for you either.

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
        if (total_duration_ms === 0) return null; // nothing to say yet

        const share = Math.round((total_api_duration_ms / total_duration_ms) * 100);
        return styler.apply(`api ${share}%`, { color: theme.muted });
      },
    },
  ],
});
```

Three rules make this safe to install from a stranger:

- **Segments are synchronous and cannot do I/O.** Everything a plugin needs is
  already on the snapshot. That is what makes the render budget enforceable
  rather than aspirational — and why a plugin that needs outside data
  contributes a collector, not a `fetch` inside `render`.
- **Segments return text, not escape sequences.** Colour goes through the
  provided styler, so a plugin inherits theming, colour degradation and
  `NO_COLOR` without knowing they exist.
- **A segment that throws is dropped.** It costs you that segment, never the
  status line. `cct doctor` reports which ones failed.

[docs/plugins.md](docs/plugins.md) is the authoring guide.

## Commands

```
cct statusline   Render the status line. Reads the Claude Code payload on stdin.
cct init         Configure Claude Code to use the tower. Backs up your settings.
cct doctor       Diagnose the installation and report what to fix.
cct status       Render a sample tower without a live session.
cct plugins      List the installed plugins and their segments.
```

## Requirements

Node.js 20.10 or later, and Claude Code 2.1.153 or later (that is the version
that started providing `COLUMNS`, which the responsive layout needs). Rate limit
gauges need a Claude.ai Pro or Max subscription — Claude Code only sends that
data to subscribers, and the tower renders nothing rather than an empty bar for
everyone else.

Linux, macOS and Windows are all first-class; CI runs the full suite on all three
across Node 20, 22 and 24.

## Contributing

Contributions are welcome, and [CONTRIBUTING.md](CONTRIBUTING.md) is short.
[ARCHITECTURE.md](ARCHITECTURE.md) explains why the code is shaped the way it is,
which is usually the faster way in.

The quickest useful contribution is a health rule: they are pure functions of a
snapshot, roughly twenty lines, and testable with a literal object.

## License

[MIT](LICENSE)

---

Not affiliated with Anthropic. Claude and Claude Code are trademarks of
Anthropic, PBC.
