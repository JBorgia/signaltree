# SignalTree Guardrails – Overview & Guide

This folder contains a complete overview of the SignalTree Guardrails dev-only enhancer (v1.1), including the implementation plan, feature set, upstream core extensions proposal, and integration patterns.

- Start with INDEX.md for a curated map of deliverables
- See GUARDRAILS_IMPLEMENTATION_PLAN.md for the end-to-end rollout plan
- Use factory-patterns.ts for practical creation patterns
- Refer to core-extensions-proposal.md for the upstream hooks that unlock zero-cost tracing
- guardrails-v1-implementation.ts is a documentation snapshot of the core implementation
- guardrails.spec.ts outlines a comprehensive test plan
- package.json shows how the package achieves a production no-op build

This is documentation and planning material for adoption in this repository; it’s not wired into any build toolchain here. Use these files as a reference to implement or import the enhancer into your application codebase.