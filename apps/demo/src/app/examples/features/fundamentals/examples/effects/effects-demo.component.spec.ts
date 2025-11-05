import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { EffectsDemoComponent } from './effects-demo.component';

describe('EffectsDemoComponent', () => {
  let component: EffectsDemoComponent;
  let fixture: ComponentFixture<EffectsDemoComponent>;

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [EffectsDemoComponent, FormsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(EffectsDemoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with empty document', () => {
    expect(component.documentTitle()).toBe('');
    expect(component.documentContent()).toBe('');
    expect(component.lastSaved()).toBeNull();
    expect(component.saveCount()).toBe(0);
  });

  it('should initialize with light theme', () => {
    expect(component.theme()).toBe('light');
  });

  it('should initialize with empty notifications', () => {
    expect(component.notifications()).toEqual([]);
  });

  it('should not save when document is empty', fakeAsync(() => {
    tick(1100);
    expect(component.lastSaved()).toBeNull();
    expect(component.saveCount()).toBe(0);
  }));

  it('should toggle theme', () => {
    expect(component.theme()).toBe('light');
    component.toggleTheme();
    expect(component.theme()).toBe('dark');
    component.toggleTheme();
    expect(component.theme()).toBe('light');
  });

  it('should add notifications with different types', () => {
    component.addNotification('Info test', 'info');
    expect(component.notifications().length).toBe(1);
    expect(component.notifications()[0].type).toBe('info');

    component.addNotification('Success test', 'success');
    expect(component.notifications().length).toBe(2);
    expect(component.notifications()[1].type).toBe('success');

    component.addNotification('Warning test', 'warning');
    expect(component.notifications().length).toBe(3);
    expect(component.notifications()[2].type).toBe('warning');

    component.addNotification('Error test', 'error');
    expect(component.notifications().length).toBe(4);
    expect(component.notifications()[3].type).toBe('error');
  });

  it('should default to info type when type not specified', () => {
    component.addNotification('Default notification');
    expect(component.notifications()[0].type).toBe('info');
  });

  it('should auto-dismiss notifications after 3 seconds', fakeAsync(() => {
    component.addNotification('Auto-dismiss test');
    expect(component.notifications().length).toBe(1);
    tick(3000);
    expect(component.notifications().length).toBe(0);
  }));

  it('should assign unique IDs to notifications', () => {
    component.addNotification('First');
    component.addNotification('Second');
    component.addNotification('Third');
    const ids = component.notifications().map(n => n.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(3);
  });

  it('should allow manual dismissal of notifications', () => {
    component.addNotification('Test notification');
    const id = component.notifications()[0].id;
    component.dismissNotification(id);
    expect(component.notifications().length).toBe(0);
  });

  it('should reset all document fields', () => {
    component.documentTitle.set('Title');
    component.documentContent.set('Content');
    component.saveCount.set(5);
    component.lastSaved.set(new Date());

    component.resetDocument();

    expect(component.documentTitle()).toBe('');
    expect(component.documentContent()).toBe('');
    expect(component.lastSaved()).toBeNull();
    expect(component.saveCount()).toBe(0);
  });

  it('should return Never when never saved', () => {
    expect(component.getLastSavedText()).toBe('Never');
  });

  it('should return Just now for very recent saves', () => {
    component.lastSaved.set(new Date());
    expect(component.getLastSavedText()).toBe('Just now');
  });

  it('should return seconds ago for recent saves', fakeAsync(() => {
    const tenSecondsAgo = new Date(Date.now() - 10000);
    component.lastSaved.set(tenSecondsAgo);
    const text = component.getLastSavedText();
    expect(text).toContain('s ago');
  }));

  it('should handle multiple notifications and dismissals', fakeAsync(() => {
    component.addNotification('First');
    component.addNotification('Second');
    component.addNotification('Third');
    expect(component.notifications().length).toBe(3);

    // Manually dismiss one
    const firstId = component.notifications()[0].id;
    component.dismissNotification(firstId);
    expect(component.notifications().length).toBe(2);

    // Wait for auto-dismiss
    tick(3000);
    expect(component.notifications().length).toBe(0);
  }));
});
