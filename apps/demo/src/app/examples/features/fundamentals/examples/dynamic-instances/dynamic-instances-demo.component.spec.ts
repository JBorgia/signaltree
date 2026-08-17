import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DynamicInstancesDemoComponent } from './dynamic-instances-demo.component';

/**
 * These assertions are the demo's claims, checked against the real library.
 *
 * The page argues that an `entityMap` of composite entities already covers
 * "N runtime instances of one domain in one tree" — so each claim it makes on
 * screen is pinned here. If a core change breaks one, this fails rather than
 * the page quietly lying.
 */
describe('DynamicInstancesDemoComponent', () => {
  let fixture: ComponentFixture<DynamicInstancesDemoComponent>;
  let component: DynamicInstancesDemoComponent;

  const settle = () => new Promise<void>((r) => setTimeout(r, 0));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DynamicInstancesDemoComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(DynamicInstancesDemoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('seeds two instances and renders a card for each', () => {
    expect(component.instanceCount()).toBe(2);
    expect(component.views().length).toBe(2);
    const cards = fixture.nativeElement.querySelectorAll('.card');
    expect(cards.length).toBe(2);
  });

  it('attaches and detaches instances at runtime', () => {
    component.attach();
    expect(component.instanceCount()).toBe(3);
    const id = component.instanceIds()[0];

    component.detach(id);
    expect(component.instanceCount()).toBe(2);
    expect(component.instanceIds()).not.toContain(id);
  });

  it('caps attachment so the page stays legible', () => {
    component.attach();
    component.attach();
    component.attach();
    expect(component.instanceCount()).toBe(4);
    expect(component.atCapacity()).toBe(true);
  });

  it('keeps instance state independent', () => {
    const [a, b] = component.instanceIds();
    component.setCustomer(a, 'Acme');
    component.setCustomer(b, 'Globex');

    const views = component.views();
    expect(views.find((v) => v.id === a)?.customer()).toBe('Acme');
    expect(views.find((v) => v.id === b)?.customer()).toBe('Globex');
  });

  it('writes fan out to exactly one derivation, not N', () => {
    component.attach();
    component.attach();
    expect(component.instanceCount()).toBe(4);

    component.setCustomer(component.instanceIds()[2], 'Acme');
    expect(component.lastFanOut()).toBe(1);
  });

  it('opens one feed per instance and closes it on detach', () => {
    expect(component.openFeeds()).toBe(component.instanceCount());

    component.attach();
    expect(component.openFeeds()).toBe(component.instanceCount());

    component.detach(component.instanceIds()[0]);
    expect(component.openFeeds()).toBe(component.instanceCount());
  });

  it('detachAll closes every feed — it must not use clear()', () => {
    component.attach();
    expect(component.openFeeds()).toBeGreaterThan(0);

    component.detachAll();
    expect(component.instanceCount()).toBe(0);
    // The regression this guards: `clear()` does not fire `tap({ onRemove })`,
    // so routing "Detach all" through it would leave every feed running.
    expect(component.openFeeds()).toBe(0);
  });

  it('records instance edits into ONE shared history buffer', async () => {
    const [a, b] = component.instanceIds();
    component.setCustomer(a, 'Acme');
    await settle();
    component.setCustomer(b, 'Globex');
    await settle();

    expect(component.historyLength()).toBeGreaterThan(0);
    expect(component.canUndo()).toBe(true);
  });

  it('undo unwinds the last action across instances, not per instance', async () => {
    const [a, b] = component.instanceIds();
    component.setCustomer(a, 'Acme');
    await settle();
    component.setCustomer(b, 'Globex');
    await settle();

    component.undo();
    await settle();

    const views = component.views();
    // The most recent action was on `b`, so `b` is what unwinds — `a` holds.
    expect(views.find((v) => v.id === b)?.customer()).toBe('');
    expect(views.find((v) => v.id === a)?.customer()).toBe('Acme');
  });

  it('undo across a detach re-attaches the instance, and the UI follows', async () => {
    const [a] = component.instanceIds();
    component.setCustomer(a, 'Acme');
    await settle();

    component.detach(a);
    await settle();
    expect(component.instanceCount()).toBe(1);

    // Time travel restores the collection wholesale, so the detached instance
    // comes back without `attach()` running. Card count must track the tree,
    // not a membership list maintained alongside it.
    component.undo();
    await settle();

    expect(component.instanceIds()).toContain(a);
    expect(component.views().length).toBe(component.instanceCount());
    expect(component.views().some((v) => v.id === a)).toBe(true);
  });

  it('a restored instance gets its feed and sample row back', async () => {
    const [a] = component.instanceIds();
    component.setCustomer(a, 'Acme');
    await settle();

    component.detach(a);
    await settle();

    component.undo();
    await settle();

    // Both halves of the instance are driven by the collection tap, so the
    // restore cannot leave a card without a feed or a reading.
    expect(component.openFeeds()).toBe(component.instanceCount());
    const view = component.views().find((v) => v.id === a);
    expect(view?.net()).toBeDefined();
  });

  it('detachAll is safe after an undo has restored an instance', async () => {
    const [a] = component.instanceIds();
    component.setCustomer(a, 'Acme');
    await settle();
    component.detach(a);
    await settle();
    component.undo();
    await settle();

    // Regression: routing removal through two collections independently threw
    // once undo had restored one but not the other.
    expect(() => component.detachAll()).not.toThrow();
    expect(component.instanceCount()).toBe(0);
    expect(component.openFeeds()).toBe(0);
  });

  it('every instance appears in the one snapshot', () => {
    const [a] = component.instanceIds();
    component.setCustomer(a, 'Acme');

    const snap = component.snapshot();
    expect(snap.scales.length).toBe(2);
    expect(snap.scales.find((s) => s.id === a)?.customer).toBe('Acme');
  });

  it('tears down every feed on destroy', () => {
    expect(component.openFeeds()).toBeGreaterThan(0);
    fixture.destroy();
    expect(component.openFeeds()).toBe(0);
  });
});
