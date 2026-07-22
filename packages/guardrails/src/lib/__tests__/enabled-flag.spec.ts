import { signalTree } from '@signaltree/core';
import { describe, expect, it } from 'vitest';

import { guardrails, resolveGuardrailsActive } from '../guardrails';

describe('guardrails enabled flag', () => {
  it('attaches the API in dev environments by default', () => {
    const tree = signalTree({ count: 0 });
    const enhanced = guardrails()(tree) as unknown as {
      __guardrails?: unknown;
    };
    expect(enhanced.__guardrails).toBeDefined();
  });

  it('explicit enabled: false disables guardrails in dev too', () => {
    const tree = signalTree({ count: 0 });
    const enhanced = guardrails({ enabled: false })(tree) as unknown as {
      __guardrails?: unknown;
    };
    expect(enhanced.__guardrails).toBeUndefined();
  });

  describe('resolveGuardrailsActive (env decision)', () => {
    it('defaults to the environment when enabled is omitted', () => {
      expect(resolveGuardrailsActive(undefined, true)).toBe(true);
      expect(resolveGuardrailsActive(undefined, false)).toBe(false);
    });

    it('explicit enabled: true overrides a production environment', () => {
      expect(resolveGuardrailsActive(true, false)).toBe(true);
      expect(resolveGuardrailsActive(() => true, false)).toBe(true);
    });

    it('explicit enabled: false disables regardless of environment', () => {
      expect(resolveGuardrailsActive(false, true)).toBe(false);
      expect(resolveGuardrailsActive(() => false, true)).toBe(false);
    });
  });
});
