# Security Policy

## Supported versions

The latest released minor version receives security fixes. While the project is
pre-1.0, that means the most recent `0.x` release.

## Reporting a vulnerability

Please report privately through
[GitHub Security Advisories](https://github.com/OWNER/claude-control-tower/security/advisories/new)
rather than opening a public issue.

Expect an acknowledgement within 72 hours and an assessment within a week. If a
fix is warranted we will coordinate a release and credit you in the advisory
unless you would rather stay anonymous.

## What this tool touches

Worth knowing when assessing a report:

- **It runs on every status line render**, dozens of times a minute, with the
  user's own privileges.
- **It reads** the Claude Code payload on stdin, the session transcript
  (`~/.claude/projects/**/*.jsonl`), the git directory of the current
  repository, and its own config file.
- **It writes** a short-lived cache under the system temp directory, and — only
  during `cct init` — `~/.claude/settings.json` and `~/.claude/cct.json`, both
  after taking a backup.
- **It spawns** exactly one external process, `git status`, with a fixed
  argument list and no shell. The single exception is `cct doctor`, which runs
  `claude --version` through a shell on Windows because the npm shim is a batch
  file; both the command and its argument are compile-time constants.
- **It makes no network requests, ever**, and collects no telemetry.

## Things we would consider vulnerabilities

- Anything that lets content in a transcript, a repository, a branch name or a
  config file cause code execution, or escape into a spawned command.
- Anything that writes outside the paths listed above, or that destroys a user's
  `settings.json` without the backup.
- Escape sequence injection: content from the outside world reaching the
  terminal unescaped in a way that could alter terminal state rather than merely
  render as text.
- Leaking transcript or repository contents anywhere off the machine.

## Things we would not

- Advice that is wrong or unhelpful. That is a bug, and a welcome one — please
  open a normal issue.
- A third-party plugin misbehaving. Plugins run in-process with full privileges
  by design; the isolation in the registry protects the _status line_ from a
  buggy plugin, not the machine from a malicious one. Install plugins you trust.
