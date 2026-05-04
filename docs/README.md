<div align="center">
  <img src="../apps/demo/public/signaltree.svg" alt="SignalTree Logo" width="80" height="80" style="background: transparent;" />
</div>

# SignalTree Documentation

Use this index to navigate the documentation.

**Latest release:** 9.2.1. See [CHANGELOG](../CHANGELOG.md).

---

## 📚 Getting Started

| Document                    | Description                                    |
| --------------------------- | ---------------------------------------------- |
| [Overview](overview.md)     | High-level project overview and specifications |
| [Root README](../README.md) | Main project README                            |

---

## 🏗️ Architecture

| Document                                                            | Description                                                                                    |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [Architecture Guide](architecture/signaltree-architecture-guide.md) | Comprehensive patterns and decision frameworks (start with “Recommended Architecture (TL;DR)”) |

---

## 📖 Guides

| Document                                                                                         | Description                                                        |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| [Migration Guide](guides/MIGRATION.md)                                                           | Upgrading from v4 package structure                                |
| [Migrating from @ngrx/signals](skills/using-signaltree/reference/migration-from-ngrx-signals.md) | Mechanical mapping guide for porting `@ngrx/signals` codebases     |
| [Orchestrating a Migration](skills/using-signaltree/reference/orchestrating-a-migration.md)      | Phased migration playbook for orchestrator + implementer subagents |
| [Custom Markers & Enhancers](guides/custom-markers-enhancers.md)                                 | Building custom markers and enhancers                              |
| [Persistence and Security](guides/persistence-and-security.md)                                   | Threat model and hardening patterns for `stored()`                 |
| [Typing Patterns](guides/typing-patterns.md)                                                     | Preferred TypeScript typing patterns                               |
| [Local Development Symlinks](guides/local-development-symlinks.md)                               | Troubleshooting dual Angular instance issues                       |

---

## ⚡ Performance

| Document                                                              | Description                         |
| --------------------------------------------------------------------- | ----------------------------------- |
| [Metrics](performance/metrics.md)                                     | Performance metrics and methodology |
| [Benchmark Analysis](performance/BENCHMARK_ANALYSIS.md)               | Enterprise vs Core benchmarks       |
| [Tree-Shaking Optimization](performance/TREE_SHAKING_OPTIMIZATION.md) | Bundle optimization strategies      |
| [Bundle Optimization](performance/bundle-optimization.md)             | Bundle size optimization            |
| [Performance Patterns](performance/performance-patterns.md)           | Common performance patterns         |
| [Hosting Guide](performance/performance-hosting-guide.md)             | Performance hosting considerations  |

---

## 📦 Package Documentation

| Document                                                 | Description                         |
| -------------------------------------------------------- | ----------------------------------- |
| [Events](events.md)                                      | @signaltree/events package docs     |
| [Core](../packages/core/README.md)                       | @signaltree/core package            |
| [Enterprise](../packages/enterprise/README.md)           | @signaltree/enterprise package      |
| [Angular Forms](../packages/ng-forms/README.md)          | @signaltree/ng-forms package        |
| [Callable Syntax](../packages/callable-syntax/README.md) | @signaltree/callable-syntax package |

---

## 🤖 AI/LLM References

| Document               | Description                       |
| ---------------------- | --------------------------------- |
| [LLM Guide](ai/LLM.md) | Quick reference for AI assistants |

---

## 🚀 Deployment

| Document                               | Description                 |
| -------------------------------------- | --------------------------- |
| [Production](deployment/production.md) | Production deployment guide |

---

## 📝 Learnings

| Document                                                                    | Description                                 |
| --------------------------------------------------------------------------- | ------------------------------------------- |
| [Events Improvement Grid](learnings/events-improvement-grid.md)             | Planned improvements for @signaltree/events |
| [Swapacado Migration Learnings](learnings/swapacado-migration-learnings.md) | Learnings from real-world integration       |

---

## 🗄️ Archive

Historical documents preserved for reference:

- [archive/](archive/) - Older implementation notes and proposals

---

## 🛠️ Development

| Document                                                                   | Description                  |
| -------------------------------------------------------------------------- | ---------------------------- |
| [Release Process](../.github/instructions/release-process.instructions.md) | How to release new versions  |
| [Validation Guide](../.github/VALIDATION_GUIDE.md)                         | Pre-release validation steps |
| [Scripts](../scripts/README.md)                                            | Build and utility scripts    |

## Archive

Historical documents moved to [archive/](archive/) for reference.
