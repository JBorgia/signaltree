import { signalTree } from '@signaltree/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { guardrails } from '../guardrails';

import type { GuardrailsReport, GuardrailRule } from '../types';
import type { ISignalTree } from '@signaltree/core';

/**
 * Behavioral pins for the three reporting defects fixed in 11.6.0
 * (RFC 0004 §8 close-out), each mutation-checked by reverting the fix:
 *
 *  (a) `customReporter` must fire even when `reporting.console === false`
 *      (the old maybeReport early-returned on it, silencing both channels).
 *  (b) Console reporting must actually report — the old gate read
 *      `context.issues.length`, an array nothing ever populated (issues
 *      live in `issueMap`), so `reportToConsole` was dead code.
 *  (c) `mode: 'throw'` violations from custom rules must propagate — the
 *      old evaluateRule catch swallowed the deliberate throw and degraded
 *      it to a console.warn.
 *
 * Plus the item-3 pin: a one-time dev warning when the (change-blind for
 * plain-object trees) PathNotifier strategy is selected.
 */

const alwaysFails: GuardrailRule = {
  name: 'always-fails',
  test: () => false,
  message: 'pinned violation',
  severity: 'error',
};

function attach(config: Parameters<typeof guardrails>[0]) {
  const tree = signalTree({ flag: false });
  return guardrails({
    changeDetection: { disablePathNotifier: true }, // deterministic polling
    hotPaths: { enabled: false },
    memoryLeaks: { enabled: false },
    ...config,
  })(tree) as unknown as ISignalTree<{ flag: boolean }>;
}

function triggerViolation(tree: ISignalTree<{ flag: boolean }>) {
  (
    tree.$ as unknown as Record<string, { set(v: unknown): void }>
  )['flag'].set(true);
  vi.advanceTimersByTime(55); // one polling tick (50ms) evaluates rules
}

describe('guardrails reporting channels', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('customReporter fires even when reporting.console is false (console channel stays silent)', () => {
    vi.useFakeTimers();
    const group = vi
      .spyOn(console, 'group')
      .mockImplementation(() => undefined);
    const reports: GuardrailsReport[] = [];

    const tree = attach({
      customRules: [alwaysFails],
      reporting: {
        console: false,
        interval: 20,
        customReporter: (r) => reports.push(r),
      },
    });

    triggerViolation(tree);
    vi.advanceTimersByTime(25); // next reporting interval delivers the issue

    expect(
      reports.some((r) =>
        r.issues.some((i) => i.metadata?.['rule'] === 'always-fails')
      )
    ).toBe(true);
    // console: false silences ONLY the console channel.
    expect(group).not.toHaveBeenCalled();

    tree.destroy?.();
  });

  it('console reporting actually reports recorded issues (issueMap-backed, console: true)', () => {
    vi.useFakeTimers();
    const group = vi
      .spyOn(console, 'group')
      .mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'groupEnd').mockImplementation(() => undefined);

    const tree = attach({
      customRules: [alwaysFails],
      reporting: { console: true, interval: 20 },
    });

    triggerViolation(tree);
    vi.advanceTimersByTime(25);

    expect(group).toHaveBeenCalledWith('[Guardrails] Performance Report');
    expect(
      warn.mock.calls.some((c) => String(c[0]).includes('issues detected'))
    ).toBe(true);

    tree.destroy?.();
  });

  it("mode: 'throw' violations from custom rules propagate instead of degrading to console.warn", () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const tree = attach({
      mode: 'throw',
      customRules: [alwaysFails],
    });

    (
      tree.$ as unknown as Record<string, { set(v: unknown): void }>
    )['flag'].set(true);

    expect(() => vi.advanceTimersByTime(55)).toThrow(
      '[Guardrails] pinned violation'
    );
    // Not swallowed by evaluateRule's rule-error safety net.
    expect(
      warn.mock.calls.some((c) => String(c[0]).includes('threw error'))
    ).toBe(false);

    tree.destroy?.();
  });

  it('warns once (per process) that the PathNotifier strategy is change-blind for plain-object trees', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const isChangeBlindWarning = (c: unknown[]) =>
      String(c[0]).includes('change-blind');

    // PathNotifier strategy selected (no disablePathNotifier) → one warning.
    const t1 = signalTree({ a: 0 });
    guardrails()(t1);
    expect(warn.mock.calls.filter(isChangeBlindWarning).length).toBe(1);

    // Second attach in the same process: still exactly one.
    const t2 = signalTree({ b: 0 });
    guardrails()(t2);
    expect(warn.mock.calls.filter(isChangeBlindWarning).length).toBe(1);

    t1.destroy?.();
    t2.destroy?.();
  });
});
