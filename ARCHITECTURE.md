# Architecture

This document explains why the code is shaped the way it is. If you are about to
change something and it seems more indirect than it needs to be, the reason is
probably here.

## The two constraints

Almost every design decision in this repository follows from two facts about the
environment, and neither is negotiable.

**Claude Code debounces status line updates at 300ms, and kills a run that is
still going when the next update arrives.** Overrunning the budget does not make
the status line late — it can stop it rendering at all. Performance is therefore
a correctness property, not an optimisation. Anything on the render path either
has a time budget or is not allowed on the render path.

**The status line gets one row of a developer's peripheral attention.** It is
read mid-thought, without stopping. That is why there is exactly one line of
advice rather than a list, why nothing may change width between renders, and why
colour is never the only carrier of meaning.

## The pipeline

Rendering is one-directional, and each stage lives in a different package:

```
  Claude Code
      │  JSON on stdin
      ▼
  ┌─────────────────┐
  │ @cct/core       │  parse the payload into a typed contract
  └─────────────────┘
      │  StatusInput
      ▼
  ┌─────────────────┐
  │ @cct/collectors │  add git and transcript state, under time budgets
  └─────────────────┘
      │  SessionSnapshot
      ▼
  ┌─────────────────┐
  │ @cct/core       │  evaluate health rules → findings, sorted by severity
  └─────────────────┘
      │  HealthReport
      ▼
  ┌──────────────────────┐
  │ @cct/plugin-sdk      │  each plugin's segments render text
  │ @cct/plugins-builtin │
  └──────────────────────┘
      │  RenderedSegment[]
      ▼
  ┌─────────────────┐
  │ @cct/render     │  fit to the terminal, shedding what does not fit
  └─────────────────┘
      │  text on stdout
      ▼
  Claude Code
```

`packages/cli/src/tower.ts` is the only place that knows this order. It contains
no logic of its own — if you find yourself making a decision in that file, it
belongs in one of the layers instead.

## The packages

| Package                | Owns                                          | May not                                     |
| ---------------------- | --------------------------------------------- | ------------------------------------------- |
| `@cct/core`            | payload contract, session model, health rules | perform any I/O                             |
| `@cct/collectors`      | filesystem reads, process spawns, caching     | decide what anything means                  |
| `@cct/render`          | ANSI, themes, glyphs, width, layout           | decide what is worth showing                |
| `@cct/plugin-sdk`      | the public extension contract                 | grow without a major version                |
| `@cct/plugins-builtin` | the four default plugins                      | use anything the public SDK does not expose |
| `claude-control-tower` | the CLI, config loading, orchestration        | contain domain logic                        |

Only `claude-control-tower` is published. The rest are private workspace
packages, bundled into it at build time.

### Why `@cct/core` is pure

Every health rule is a pure function from a snapshot to at most one finding. That
makes each one testable with a literal object, instantly, with no repository, no
transcript and no terminal. It is also what makes the rule set safely extensible:
a new rule cannot break an existing one, because they cannot see each other.

This is enforced by the linter, not by convention — `eslint.config.js` forbids
importing `node:fs`, `node:child_process` and friends anywhere under
`packages/core`. If you need data from outside, add a collector and put the
result on the snapshot.

### Why the built-in plugins use the public SDK

`@cct/plugins-builtin` has no privileged access to anything. If the public
contract were not sufficient to build the default experience, it would not be
sufficient for a contributor either — and the gap would only be discovered by
someone outside the project, which is the worst way to find it.

## Failure is contained, everywhere

A status line that disappears is worse than one showing slightly stale data. Two
isolation boundaries enforce that:

- **`evaluateHealth` skips a rule that throws.** The report is still produced
  from every other rule.
- **`PluginRegistry.render` drops a segment that throws** and records it. The
  rest of the line renders.

Both are what make it safe to install a plugin from a stranger: a bug in it costs
you one segment, never the tower. `cct doctor` is where those failures surface,
because that is where a diagnosis is actionable.

The same instinct runs through the parsers. `parseStatusInput` never throws; junk
input yields a well-formed object full of safe defaults, and unknown fields are
ignored so that a Claude Code upgrade cannot blank the line. The config loader
behaves the same way.

There is one deliberate exception. `hex()` throws on a malformed colour, because
that is always an authoring mistake in this repository and never something a user
can cause at runtime.

## Where the time goes

Measured on a Windows laptop, warm cache, real session:

| Stage                      | Cost  |
| -------------------------- | ----- |
| Node process startup       | ~60ms |
| Loading the bundle         | ~5ms  |
| Collectors (cache hit)     | ~5ms  |
| Health rules and rendering | ~5ms  |
| **Total**                  | ~90ms |

Three decisions account for most of the difference between that and a naive
implementation:

**The transcript is read from the tail only.** A long session's transcript
reaches tens of megabytes. Reading it whole would exceed the entire budget by
itself. `TAIL_BYTES` is 256 KiB, which covers the last few dozen turns — enough
for a stable burn-rate slope. This is why `TranscriptState` describes a _sampling
window_ rather than session totals: an exact figure that arrives too late to
render is worth less than a close one that arrives now.

**`git status` is cached for two seconds**, keyed by `session_id`. Spawning a
process is the single most expensive thing the collectors do, and the working
tree almost never changes between two renders a keystroke apart. The key is the
session id rather than the pid — a pid changes on every invocation and would
defeat the cache entirely, while a session id is stable for the session and
unique across concurrent ones.

**The published binary is a single bundled file.** Resolving and loading 45
separate ESM modules cost about 35ms, roughly a third of the cold start.

## The wire contract

`packages/core/src/contract/status-input.ts` mirrors the payload documented at
<https://code.claude.com/docs/en/statusline>. Two properties of it drive the code:

**Many fields are absent, not null.** `rate_limits` exists only for Claude.ai
subscribers and only after the first API response; `pr` exists only while a PR is
open. Optionality is load-bearing and is modelled precisely, so the type system
forces every consumer to handle absence. Segments render _nothing_ for absent
data rather than a zero or a placeholder.

**`context_window.current_usage` is genuinely nullable** — null before the first
API call and again after `/compact`. That is a different state from absent, and
is modelled as such.

The parser is hand-rolled rather than delegated to a schema library, for two
reasons in order of importance. Resilience: a validator fails closed, and this
one must fail soft, because a blank status line is a worse outcome than a
slightly wrong one. Cost: importing and compiling a schema on every render costs
more than the parse saves.

The price is that `parse-status-input.ts` must be kept in step with
`status-input.ts` by hand. The round-trip tests are what enforce that.

## Layout

`composeLine` fits a line to the available width by dropping segments in
ascending priority, then descending width within a priority — shedding the widest
of the equally-unimportant frees the most space for the fewest losses. Output
order always follows declaration order regardless of what was dropped, because a
line whose contents reshuffle as the terminal resizes is much harder to read than
one that simply gets shorter.

If even the single most important segment is wider than the terminal, it is
truncated rather than allowed to wrap. Truncation loses styling; wrapping
corrupts the interface.

Width measurement is not `String.length`. Escape sequences occupy no cells, CJK
and emoji occupy two, combining marks occupy zero. `layout/width.ts` implements
the narrow subset of UAX #11 that a status line actually encounters, rather than
taking a dependency on the hot path.

## What is deliberately not here

**A background daemon.** It would remove the ~60ms of Node startup, which is now
the dominant cost. It is not here because the collector interface already hides
where data comes from, so a daemon can be added later without changing any other
layer — and it is a lot of moving parts to add before the simple version has been
shown to be insufficient.

**Telemetry, of any kind.** The status line runs on a developer's machine dozens
of times a minute. The only thing it is allowed to cost them is a few
milliseconds.

**A CLI framework.** `cct statusline` pays a framework's import cost on every
render, before computing a single useful byte. The surface is six commands and a
handful of flags — smaller than the dependency would be.
