# Configuration

Configuration is entirely optional. The tower is designed to be good with no
config file at all — if you find yourself needing one to make it usable, that is
a bug worth reporting.

## Where it lives

The first file found wins. They are not merged.

1. `./.cct.json` — project-local
2. `./.claude/cct.json` — project-local
3. `~/.claude/cct.json` — the usual place, and what `cct init` writes
4. `~/.cct.json`

`cct doctor` tells you which one is in effect.

A malformed config degrades to defaults rather than blanking the status line, on
the same reasoning as everything else on the render path. That does mean a typo
is silent — `cct doctor` is how you check.

## Every option

```json
{
  "theme": "tower-dark",
  "glyphs": "auto",
  "lines": ["identity", "health", "activity", "infra"],
  "disabledSegments": [],
  "disabledPlugins": [],
  "mutedRules": [],
  "thresholds": {
    "context": {
      "warnPercentage": 75,
      "criticalPercentage": 90,
      "warnMinutesToFull": 10
    },
    "quota": {
      "warnPercentage": 80,
      "criticalPercentage": 95
    },
    "git": {
      "warnUncommittedFiles": 12,
      "warnMinutesSinceCommit": 90
    },
    "cost": {
      "warnUsdPerHour": 15
    }
  }
}
```

Those are the defaults. Anything you omit keeps its default value, including
individual thresholds — `{"thresholds": {"context": {"warnPercentage": 60}}}` is
a valid and complete config.

### `theme`

`tower-dark` (default), `tower-light`, or `tower-mono`.

`tower-mono` renders everything in one colour. It is not a degraded mode: every
state also carries a number or an icon, so severity is still readable. Useful if
you find colour in a status line distracting.

### `glyphs`

`auto` (default), `nerdfont`, `unicode`, or `ascii`.

`auto` resolves to `unicode` everywhere except a `TERM=dumb` terminal. It never
resolves to `nerdfont`, because Nerd Font presence cannot be detected from inside
a process and guessing wrong fills your terminal with tofu boxes. If you have a
Nerd Font, say so — `cct init --glyphs nerdfont` writes it for you.

`ascii` is a genuine fallback, not an afterthought: gauges become `====....` and
every icon has a readable ASCII form.

Overridable per-invocation with the `CCT_GLYPHS` environment variable, which is
handy for testing: `CCT_GLYPHS=ascii cct status`.

### `lines`

Which rows to draw, in order. Drop one to get a shorter tower:

```json
{ "lines": ["identity", "health"] }
```

| Line       | Contains                                                  |
| ---------- | --------------------------------------------------------- |
| `identity` | model, repository, session name, mode badges              |
| `health`   | context gauge, rate limits, cost, elapsed time            |
| `activity` | branch, working tree, upstream divergence, diff size, PR  |
| `infra`    | **the advice**, subagents, worktree, agent name, vim mode |

Removing `infra` removes the advice line, which is most of the reason to use this
tool. If it is in your way, prefer `mutedRules` to silence the specific rules you
do not want.

The tower also never uses more than half your terminal height, whatever you
configure here.

### `disabledSegments`

Segment ids to hide. Run `cct plugins` for the full list.

```json
{ "disabledSegments": ["cost", "duration", "vim"] }
```

### `disabledPlugins`

Whole plugins to turn off, including any rules they contribute.

```json
{ "disabledPlugins": ["activity"] }
```

### `mutedRules`

Health rule ids to silence. The rule still exists; it just never speaks.

```json
{ "mutedRules": ["cost-velocity", "uncommitted-work"] }
```

Rule ids are listed in the README, and `cct doctor` prints them too.

### `thresholds`

Where each rule and gauge changes colour.

| Path                         | Default | Meaning                                                       |
| ---------------------------- | ------- | ------------------------------------------------------------- |
| `context.warnPercentage`     | 75      | Context gauge turns amber, `context-pressure` starts advising |
| `context.criticalPercentage` | 90      | Turns red, advice escalates to "now"                          |
| `context.warnMinutesToFull`  | 10      | `context-velocity` warns within this many projected minutes   |
| `quota.warnPercentage`       | 80      | Rate limit gauges turn amber and show their reset time        |
| `quota.criticalPercentage`   | 95      | Turn red                                                      |
| `git.warnUncommittedFiles`   | 12      | Files changed before `uncommitted-work` considers speaking    |
| `git.warnMinutesSinceCommit` | 90      | ...and how long since the last commit. **Both** are required  |
| `cost.warnUsdPerHour`        | 15      | Spend rate at which `cost-velocity` mentions it               |

The context warning sits at 75 rather than a rounder 80 because `/compact` itself
needs headroom. Being told to compact when there is no room left to do it
comfortably is advice that arrives too late to use.

## Environment variables

| Variable      | Effect                                                     |
| ------------- | ---------------------------------------------------------- |
| `NO_COLOR`    | Any non-empty value disables colour _and_ OSC 8 hyperlinks |
| `FORCE_COLOR` | `0`/`1`/`2`/`3` to force none / 16 / 256 / truecolor       |
| `CCT_GLYPHS`  | Overrides the configured glyph tier                        |
| `COLUMNS`     | Terminal width. Claude Code sets this from v2.1.153        |
| `LINES`       | Terminal height, used to cap how many rows the tower takes |

## The Claude Code side

`cct init` writes this into `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "cct statusline",
    "padding": 0,
    "refreshInterval": 5
  }
}
```

`refreshInterval` matters. Several segments are time-based — quota reset
countdowns, session duration, the burn-rate projection — and Claude Code's
event-driven updates go quiet while the session sits idle waiting on a subagent.
Five seconds keeps those honest without running the command needlessly.

Raise `padding` if you want the tower indented further from the terminal edge.

## Trying a change without restarting

```bash
cct status --demo all
```

Renders healthy, pressured and critical scenarios from fixed data using your real
config. Useful for tuning thresholds and themes, and it is what generates the
screenshots in the README — so the documentation cannot drift from the code.
