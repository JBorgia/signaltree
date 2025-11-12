# Guardrails Known Limitations

| Area                | Limitation                                                                 | Workaround / Notes                                               |
| ------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Production builds   | Guardrails exports no-op modules in production (`dist/noop.*`).             | This is intentional—do not rely on runtime telemetry in prod.   |
| Timing accuracy     | `performance.now()` is required; Node 16 and older are unsupported.         | Use Node 18+ or browser dev tools for reliable timing reports.  |
| Memory tracking     | Retention heuristics rely on signal metadata and may emit false positives.  | Tune `memoryLeaks.retentionThreshold` and `growthRate`.          |
| Recomputation stats | Metrics reset every 1s sliding window; very long-running tasks are clipped. | Persist `context.stats` snapshots externally if needed.         |
| Nx integration      | Guardrails builds with tsup, not `@nx/js`; ensure scripts call tsup build.  | `pnpm --filter @signaltree/guardrails build` is required in CI. |
| Browser support     | Requires modern browsers with `structuredClone`; falls back to identity.    | Polyfill or disable deep diff analysis in legacy browsers.      |
| Tree compatibility  | Trees must expose `addTap`/`removeTap`; otherwise guardrails auto-disables.  | Wrap your tree or implement middleware hooks.                   |
| Rule execution      | Async rules are best-effort; rejections are logged but do not fail updates. | Use idempotent rule logic and capture failures in custom reporter. |
| API stability       | `__guardrails` is dev-only and not part of public API guarantees.           | Access via the provided TypeScript augmentation interfaces.     |

