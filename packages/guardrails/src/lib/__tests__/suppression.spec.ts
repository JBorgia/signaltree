import { describe, expect, it } from 'vitest';

import { isSuppressedWrite } from '../guardrails';

import type { GuardrailsConfig } from '../types';
import type { UpdateMetadata } from '@signaltree/core';

/**
 * `GuardrailsConfig.suppression`, implemented in 14.1.2.
 *
 * Both halves were declared and dead. `respectMetadata` was documented "Honor
 * suppressGuardrails metadata flag" and this package never read the flag —
 * `@signaltree/schema` honoured it (leaf-handler.ts) while guardrails, the
 * package it is named for, ignored it. `autoSuppress` was equally inert.
 *
 * This exercises the DECISION directly rather than through a tree, because the
 * PathNotifier does not fire across module instances in this package's test
 * environment — the same limitation that leaves
 * `path-notifier.integration.spec.ts`'s first case `it.skip`-ed. The wiring it
 * feeds (`handlePathNotifierChange` reading the ambient write context) is one
 * call; the policy below is the part worth pinning.
 *
 * It matters in practice because core's own enhancers already declare a source:
 * `timeTravel()` writes under `{ intent: 'system', source: 'time-travel' }` and
 * devtools replay under `{ source: 'devtools' }`. So `autoSuppress:
 * ['time-travel']` now genuinely silences an undo instead of reading as if it
 * would.
 */
const ctx = (config: GuardrailsConfig<Record<string, unknown>> = {}) => ({
  config,
});
const meta = (m: UpdateMetadata) => m;

describe('respectMetadata', () => {
  it('honours suppressGuardrails by default', () => {
    expect(isSuppressedWrite(ctx(), meta({ suppressGuardrails: true }))).toBe(
      true
    );
  });

  it('leaves an ordinary write alone', () => {
    expect(isSuppressedWrite(ctx(), meta({ intent: 'user' }))).toBe(false);
  });

  it('no metadata at all is never suppressed', () => {
    expect(isSuppressedWrite(ctx(), undefined)).toBe(false);
  });

  it('respectMetadata: false opts back in to reporting', () => {
    expect(
      isSuppressedWrite(
        ctx({ suppression: { respectMetadata: false } }),
        meta({ suppressGuardrails: true })
      )
    ).toBe(false);
  });

  it('respectMetadata: true is the explicit form of the default', () => {
    expect(
      isSuppressedWrite(
        ctx({ suppression: { respectMetadata: true } }),
        meta({ suppressGuardrails: true })
      )
    ).toBe(true);
  });
});

describe('autoSuppress', () => {
  it('suppresses a listed intent', () => {
    expect(
      isSuppressedWrite(
        ctx({ suppression: { autoSuppress: ['hydrate'] } }),
        meta({ intent: 'hydrate' })
      )
    ).toBe(true);
  });

  it('suppresses a listed source — the timeTravel() undo case', () => {
    expect(
      isSuppressedWrite(
        ctx({ suppression: { autoSuppress: ['time-travel'] } }),
        meta({ intent: 'system', source: 'time-travel' })
      )
    ).toBe(true);
  });

  it('leaves an unlisted intent alone', () => {
    expect(
      isSuppressedWrite(
        ctx({ suppression: { autoSuppress: ['hydrate'] } }),
        meta({ intent: 'user' })
      )
    ).toBe(false);
  });

  it('an empty list suppresses nothing', () => {
    expect(
      isSuppressedWrite(
        ctx({ suppression: { autoSuppress: [] } }),
        meta({ intent: 'hydrate' })
      )
    ).toBe(false);
  });

  it('composes with respectMetadata', () => {
    // autoSuppress does not fire, but the explicit flag still does.
    expect(
      isSuppressedWrite(
        ctx({ suppression: { autoSuppress: ['hydrate'] } }),
        meta({ intent: 'user', suppressGuardrails: true })
      )
    ).toBe(true);
  });
});
