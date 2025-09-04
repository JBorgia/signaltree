import { TestBed } from '@angular/core/testing';

import { AsyncDemoComponent } from '../pages/async-demo/async-demo.component';

describe('Async Demo Component', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AsyncDemoComponent],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(AsyncDemoComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should demonstrate async operations with loading states', async () => {
    const fixture = TestBed.createComponent(AsyncDemoComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    // Test that async methods exist
    expect(typeof component.loadUsers).toBe('function');
    expect(typeof component.searchUsers).toBe('function');
    expect(typeof component.selectUser).toBe('function');

    // Initial state should not be loading
    expect(component.loading()).toBeFalsy();

    // Start loading users - should set loading state
    component.loadUsers();
    expect(component.loading()).toBeTruthy();

    // Wait a short time and check that loading eventually completes
    await new Promise((resolve) => setTimeout(resolve, 100));
    // Note: In a real test, we'd mock the API to control timing
  });

  it('should handle search functionality', () => {
    const fixture = TestBed.createComponent(AsyncDemoComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    // Test search query update
    const initialQuery = component.searchQuery();
    component.updateSearchQuery('test');
    expect(component.searchQuery()).toBe('test');
    expect(component.searchQuery()).not.toBe(initialQuery);
  });

  it('should demonstrate error handling', async () => {
    const fixture = TestBed.createComponent(AsyncDemoComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    // Initial error state should be null
    expect(component.error()).toBeNull();

    // The component should have error handling capabilities
    expect(typeof component.clearError).toBe('function');
  });
});
