# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

While the version is below 1.0, the `@cct/plugin-sdk` contract may change in a
minor release. It will be noted here explicitly when it does.

## [Unreleased]

## [0.1.0] - 2026-08-04

The first release.

### Added

- **Status line** with four rows — identity, session health, development
  activity, and a single line of advice.
- **Health engine** with ten built-in rules covering context pressure and
  velocity, cache efficiency, the 5-hour and 7-day rate limits, uncommitted
  work, merge conflicts, in-progress git operations, detached HEAD, and cost
  velocity. Each produces one imperative recommendation rather than a number.
- **Responsive layout** that fits the line to `COLUMNS` by shedding its least
  important segments, and truncates rather than wrapping as a last resort.
- **Three glyph tiers** — Nerd Font, Unicode and ASCII — and three themes.
  `NO_COLOR` is honoured, including for OSC 8 hyperlinks.
- **Plugin SDK** with a registry that contains a failing segment rather than
  letting it blank the status line. The four default plugins are built against
  the same public contract.
- **`cct init`** which configures Claude Code after backing up `settings.json`
  and asking for confirmation.
- **`cct doctor`** which diagnoses the installation, times a render against the
  budget, and states a remedy for anything it finds.
- **`cct status --demo`** which renders healthy, pressured and critical
  scenarios from fixed data.
- Rate limit gauges, sourced from the `rate_limits` field Claude Code provides
  to Claude.ai subscribers.

[Unreleased]: https://github.com/OWNER/claude-control-tower/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/OWNER/claude-control-tower/releases/tag/v0.1.0
