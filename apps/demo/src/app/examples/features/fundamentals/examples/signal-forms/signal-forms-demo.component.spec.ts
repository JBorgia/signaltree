import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';

import { SignalFormsDemoComponent } from './signal-forms-demo.component';

describe('SignalFormsDemoComponent', () => {
  let component: SignalFormsDemoComponent;
  let fixture: ComponentFixture<SignalFormsDemoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SignalFormsDemoComponent, ReactiveFormsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(SignalFormsDemoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with empty profile', () => {
    expect(component.profile.$.personal.firstName()).toBe('');
    expect(component.profile.$.personal.lastName()).toBe('');
    expect(component.profile.$.contact.email()).toBe('');
    expect(component.profile.$.contact.phone()).toBe('');
  });

  it('should have preferences initialized', () => {
    expect(component.profile.$.preferences.newsletter()).toBe(true);
    expect(component.profile.$.preferences.notifications()).toBe(false);
  });

  it('should create form controls', () => {
    expect(component.firstNameControl).toBeDefined();
    expect(component.lastNameControl).toBeDefined();
    expect(component.emailControl).toBeDefined();
  });

  it('should create form groups', () => {
    expect(component.personalFormGroup).toBeDefined();
    expect(component.contactFormGroup).toBeDefined();
    expect(component.preferencesFormGroup).toBeDefined();
  });

  it('should create writable signals from slices', () => {
    expect(component.personalSignal).toBeDefined();
    // Signal should be callable
    expect(typeof component.personalSignal).toBe('function');
  });

  it('should update tree state via updateViaTree', (done) => {
    component.updateViaTree();
    expect(component.syncStatus()).toBe('syncing');
    expect(component.profile.$.personal.firstName()).toBe('John');
    expect(component.profile.$.personal.lastName()).toBe('Doe');
    expect(component.profile.$.contact.email()).toBe('john.doe@example.com');
    expect(component.profile.$.contact.phone()).toBe('+1-555-0123');

    setTimeout(() => {
      expect(component.syncStatus()).toBe('synced');
      done();
    }, 350);
  });

  it('should compute full name correctly', () => {
    expect(component.fullName).toBe('Not set');

    component.profile.$.personal.firstName.set('Alice');
    component.profile.$.personal.lastName.set('Johnson');
    fixture.detectChanges();

    expect(component.fullName).toBe('Alice Johnson');
  });

  it('should reset all state', (done) => {
    // Set some values first
    component.profile.$.personal.firstName.set('Test');
    component.profile.$.personal.lastName.set('User');
    component.profile.$.contact.email.set('test@example.com');

    // Reset
    component.resetAll();
    expect(component.syncStatus()).toBe('syncing');

    expect(component.profile.$.personal.firstName()).toBe('');
    expect(component.profile.$.personal.lastName()).toBe('');
    expect(component.profile.$.contact.email()).toBe('');
    expect(component.profile.$.contact.phone()).toBe('');

    setTimeout(() => {
      expect(component.syncStatus()).toBe('idle');
      done();
    }, 350);
  });

  it('should display correct status icons', () => {
    component.syncStatus.set('idle');
    expect(component.statusIcon).toBe('⏸️');

    component.syncStatus.set('syncing');
    expect(component.statusIcon).toBe('🔄');

    component.syncStatus.set('synced');
    expect(component.statusIcon).toBe('✅');
  });

  it('should handle toWritableSignal conversion', () => {
    // The personalSignal should reflect changes to the tree
    const initialPersonal = component.personalSignal();
    expect(initialPersonal).toEqual({ firstName: '', lastName: '' });

    // Update tree
    component.profile.$.personal.firstName.set('Bob');
    component.profile.$.personal.lastName.set('Builder');
    fixture.detectChanges();

    // Signal should reflect the change
    const updatedPersonal = component.personalSignal();
    expect(updatedPersonal.firstName).toBe('Bob');
    expect(updatedPersonal.lastName).toBe('Builder');
  });
});
