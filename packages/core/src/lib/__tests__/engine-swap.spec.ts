import {
  configureSignalEngine,
  resetSignalEngine,
  signal,
  computed,
  effect,
  __ADAPTER_META__,
  vanillaEngine,
  inject,
} from '../adapter';

// Basic test to ensure swapping to vanilla engine works for minimal flows

describe('Signal Engine Swap (vanilla)', () => {
  afterEach(() => resetSignalEngine());

  it('should allow swapping to vanilla engine and basic reactivity works', () => {
    const metaBefore = __ADAPTER_META__();
    const wasOverridden = metaBefore.overridden; // may already be true if env auto-configured

    configureSignalEngine({ ...vanillaEngine });
    const metaAfter = __ADAPTER_META__();
    expect(metaAfter.overridden).toBe(true);
    expect(metaAfter.capabilities.di).toBe(false);
    expect(metaAfter.capabilities.cleanup).toBe(false);

    const count = signal(0);
    const double = computed(() => count() * 2);
    let runs = 0;
    effect(() => {
      double();
      runs++;
    });
    expect(double()).toBe(0);
    expect(runs).toBeGreaterThan(0);

    count.set(2);
    expect(double()).toBe(4);

    // Reset and ensure override flag returns to false (unless env would force again, which it does not post-init)
    resetSignalEngine();
    const metaReset = __ADAPTER_META__();
    expect(metaReset.overridden).toBe(false);
    // Restore if it was overridden prior to this test (safety, though afterEach will handle)
    if (wasOverridden) configureSignalEngine({ ...vanillaEngine });
  });

  it('should throw when using inject in vanilla engine', () => {
    configureSignalEngine({ ...vanillaEngine });
    // Cast token to unknown then never to satisfy type system without using 'any'
    expect(() => inject('token' as unknown as never)).toThrow();
  });
});
