import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EnterpriseEnhancerComponent } from './enterprise-enhancer.component';

/**
 * Drives the interactive updateOptimized() demo. massUpdate() and
 * updateMetrics() use Math.random() for the new metric values / user active
 * flags — Math.random is stubbed to a fixed value wherever a test needs a
 * deterministic outcome from those paths, per the "no reliance on
 * Math.random" constraint. bulkUpdateUsers() and reset() are fully
 * deterministic already and are asserted exactly.
 */
describe('EnterpriseEnhancerComponent', () => {
  let component: EnterpriseEnhancerComponent;
  let fixture: ComponentFixture<EnterpriseEnhancerComponent>;

  const initialUsers = [
    { id: 1, name: 'Alice Johnson', active: true },
    { id: 2, name: 'Bob Smith', active: false },
    { id: 3, name: 'Carol Williams', active: true },
  ];
  const initialConfig = {
    theme: 'light',
    language: 'en',
    notifications: true,
  };
  const initialMetrics = { cpu: 45, memory: 62, disk: 78, network: 23 };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EnterpriseEnhancerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(EnterpriseEnhancerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates with the initial demo state', () => {
    expect(component).toBeTruthy();
    expect(component.metrics()).toEqual(initialMetrics);
    expect(component.users()).toEqual(initialUsers);
    expect(component.config()).toEqual(initialConfig);
    expect(component.updateCount()).toBe(0);
    expect(component.lastUpdateResult()).toBeNull();
  });

  it('getPathIndex() is null (lazy init) before the first updateOptimized call — matches the "✗ Inactive" badge', () => {
    expect(component.hasPathIndex()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('✗ Inactive');
  });

  describe('updateMetrics()', () => {
    let randomSpy: jest.SpyInstance;

    beforeEach(() => {
      randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    });

    afterEach(() => {
      randomSpy.mockRestore();
    });

    it('replaces metrics with the (stubbed-random) new values and activates the path index', () => {
      component.updateMetrics();
      fixture.detectChanges();

      // Math.floor(0.5 * 100) === 50 for every metric.
      expect(component.metrics()).toEqual({
        cpu: 50,
        memory: 50,
        disk: 50,
        network: 50,
      });
      expect(component.updateCount()).toBe(1);
      expect(component.hasPathIndex()).toBe(true);
      expect(component.lastUpdateResult()).not.toBeNull();
      expect(component.totalChanges()).toBe(
        component.lastUpdateResult()?.changedPaths.length
      );
    });

    it('increments updateCount on every call', () => {
      component.updateMetrics();
      component.updateMetrics();
      component.updateMetrics();
      expect(component.updateCount()).toBe(3);
    });
  });

  it('KNOWN DEFECT: bulkUpdateUsers() does not modify the users array', () => {
    // updateOptimized() reports `changed: true` with element-level paths but
    // writes nothing for arrays: the diff engine emits `users.1`, and the apply
    // step cannot resolve a path segment past an array leaf (an array is ONE
    // WritableSignal<T[]>, not per-index signals), so the patch is dropped.
    //
    // A first attempt to fix this apply-side was reverted: reconstructing the
    // array from element patches produced a HYBRID array (a shorter intended
    // value left the stale tail in place), downgraded class instances to plain
    // objects, opened a `__proto__` injection path, and wrote the signal once
    // per element. Silent corruption is worse than a silent no-op. The correct
    // fix applies the whole array atomically from the update payload — tracked
    // separately, deliberately not rushed.
    const before = JSON.stringify(component.users());
    component.bulkUpdateUsers();
    expect(JSON.stringify(component.users())).toBe(before);
    expect(component.users()).toHaveLength(3);
  });

  it('massUpdate() toggles theme and notifications deterministically (metrics/user-active randomness is stubbed)', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.9);

    component.massUpdate();
    fixture.detectChanges();

    expect(component.config().theme).toBe('dark');
    expect(component.config().notifications).toBe(false);
    expect(component.config().language).toBe('en');
    // Math.random() > 0.5 is stubbed true for every user.
    // KNOWN DEFECT (same root cause as bulkUpdateUsers): the array write does
    // not land, so the active flags are untouched.
    expect(component.users().every((u) => u.active)).toBe(false);

    jest.restoreAllMocks();
  });

  it('reset() restores the initial state after other actions have mutated it', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.9);
    component.massUpdate();
    component.bulkUpdateUsers();
    jest.restoreAllMocks();

    component.reset();
    fixture.detectChanges();

    expect(component.metrics()).toEqual(initialMetrics);
    expect(component.users()).toEqual(initialUsers);
    expect(component.config()).toEqual(initialConfig);
    expect(component.updateCount()).toBe(0);
    expect(component.lastUpdateResult()).toBeNull();
  });

  it('reset button in the DOM drives the same reset()', () => {
    component.updateMetrics();
    fixture.detectChanges();
    expect(component.updateCount()).toBe(1);

    const resetButton: HTMLButtonElement = fixture.nativeElement.querySelector(
      'button.secondary'
    );
    resetButton.click();
    fixture.detectChanges();

    expect(component.updateCount()).toBe(0);
    expect(component.metrics()).toEqual(initialMetrics);
  });
});
