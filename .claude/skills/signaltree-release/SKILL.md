---
name: signaltree-release
description: Run SignalTree 1.0 release work autonomously through one phase of RELEASE-1.0.md, stopping only when a genuine product, API, semantic, or compatibility decision is required. Use when the user asks to work a release phase, close a GATE, continue the release, or names an unchecked item in RELEASE-1.0.md.
---

# SignalTree release runner

This skill is a dispatcher, not a rulebook. The rules live in two tracked files and
there must be exactly one copy of them:

| What | Where |
| --- | --- |
| Execution loop, stop conditions, commit authority, `DECISION REQUIRED` format | [`AGENTS.md`](../../../AGENTS.md) § "Release work" |
| Current phase, unchecked items, gates, invariants, validation ladder, dirt list | [`RELEASE-1.0.md`](../../../RELEASE-1.0.md) |

If this file ever contradicts either of them, they win and this file is the bug.

## Bootstrap

Before touching anything:

1. Read `RELEASE-1.0.md` in full. Note **Current Phase** and its exit gate.
2. Read `AGENTS.md` § "Release work" through § "Commit authority".
3. `git status --short` and `git log --oneline -15`.
4. Confirm the workspace dirt listed under "Workspace Dirt Not Owned By Release Tasks"
   is still exactly what `git status` shows. If a file is dirty that the ledger does
   not list, find out whose it is before you stage anything.

Then take the highest-priority unchecked item in the current phase and follow the
per-slice procedure in `AGENTS.md` (characterize → smallest fix → focused validation →
authoritative ladder → inspect diff → one commit → update the ledger → next item).

## Repo-specific traps

These are not in the loop rules and have each cost a session before:

- **Run tests through Nx, not bare vitest.** `pnpm nx test core --skip-nx-cache
  --output-style=static --verbose`. A bare `npx vitest` from the root fails with
  `ngModule null`.
- **Never `git stash push -- <path>`.** On an already-clean path it silently no-ops,
  and the following `pop` restores a *foreign* stash over your work. Use a patch file.
- **Never publish a number from `artifacts/*.json`.** It is gitignored, per-machine,
  and stale — it still lists a package dropped in 14.0.0 and reports core at 489 bytes
  gzip against a real ~5.9 KB. Every figure traces to its generator; see `AGENTS.md`
  § "Docs & demo currency".
- **Do not add an RFC.** `docs/rfcs/` is an archive of decisions already taken.
  Decided-but-not-done work goes in `TODO.md`. See `AGENTS.md` § "Do not write RFCs".
- **`.claude/` is mostly gitignored.** Only `.claude/skills/` and `.claude/agents/`
  are tracked, via a negation in `.gitignore`. `.claude/settings.json` is machine-local
  and must never appear in a release commit.

## Independent review

At a phase boundary — before you mark a gate satisfied — dispatch the
[`release-reviewer`](../../agents/release-reviewer.md) subagent against HEAD. It is
read-only and has its own context, so its audit does not consume this conversation.

Give it: the phase, the gate you are claiming, and the commits in the slice. Take its
output as *claims to verify*, not as facts — it can be wrong too. Verify each blocker
against HEAD yourself before acting, and disregard any finding whose falsifier does not
actually fail.

Also dispatch it when a single kernel change is load-bearing enough that you would want
a second pair of eyes before committing.

## Stopping

Stop conditions and the `DECISION REQUIRED` template are in `AGENTS.md` § "STOP and ask
Jonathan only when a real decision is required". Do not invent additional ones.

Two reminders about the ones that are easiest to get wrong:

- A failing test is **not** a stop condition when the fix is local and consistent with
  the current architecture. Fix it, revalidate, continue.
- Finishing the phase gate **is** a stop condition. Do not open the next phase in the
  same session.

When you do stop, the last line of your report is the resume handle: name the last green
commit, the current gate, and the next unchecked item.
