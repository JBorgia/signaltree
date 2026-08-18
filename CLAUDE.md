# CLAUDE.md

Read [`AGENTS.md`](AGENTS.md) first — it is the full instruction set for this
repository and covers both contributors and agents consuming `@signaltree/*`.

Nothing else belongs in this file. Keep it a pointer.

## Release work

For anything touching the 1.0 release, invoke the `signaltree-release` skill. It
dispatches into [`AGENTS.md`](AGENTS.md) § "Release work" and
[`RELEASE-1.0.md`](RELEASE-1.0.md), which are the single source of truth for the
execution loop, the current phase, and the stop conditions.

Independent audits of HEAD go to the read-only `release-reviewer` subagent.
