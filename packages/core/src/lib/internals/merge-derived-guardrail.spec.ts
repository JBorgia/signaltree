import { computed } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { signalTree } from '../../index';

describe('[ST2007] derived value dropped — dev-mode guardrail', () => {
  it('warns with the duplicate-@angular/core diagnosis for a foreign signal', () => {
    // Simulate a computed from a SECOND @angular/core instance: a function
    // carrying its own Symbol(SIGNAL) that this realm's isSignal() rejects.
    const foreign = (() => 1) as unknown as Record<symbol, unknown>;
    foreign[Symbol('SIGNAL')] = { kind: 'computed' };

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const tree = signalTree({ w: { n: 1 } }).derived(() => ({
        w: { bad: foreign },
      }));
      // Touch `$` so markers materialize and the derived queue is applied.
      expect(tree.$.w).toBeDefined();
      const msgs = warn.mock.calls.map((c) => String(c[0]));
      const hit = msgs.find((m) => m.includes('ST2007'));
      expect(hit).toBeDefined();
      expect(hit).toContain('different @angular/core');
      expect(hit).toContain('Dedupe @angular/core');
    } finally {
      warn.mockRestore();
    }
  });

  it('warns generically for a plainly invalid derived value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const tree = signalTree({ w: { n: 1 } }).derived(() => ({
        w: { bad: 42 as never },
      }));
      // Touch `$` so markers materialize and the derived queue is applied.
      expect(tree.$.w).toBeDefined();
      const hit = warn.mock.calls
        .map((c) => String(c[0]))
        .find((m) => m.includes('ST2007'));
      expect(hit).toBeDefined();
      expect(hit).toContain('not a signal');
    } finally {
      warn.mockRestore();
    }
  });

  it('does NOT warn for a legitimate computed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const t = signalTree({ w: { ids: ['a'] } }).derived(($) => ({
        w: { count: computed(() => $.w.ids().length) },
      }));
      expect(t.$.w.count()).toBe(1);
      expect(
        warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('ST2007'))
      ).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });
});
