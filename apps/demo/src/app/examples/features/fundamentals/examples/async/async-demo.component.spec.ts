import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';

import { AsyncDemoComponent } from './async-demo.component';

describe('AsyncDemoComponent', () => {
  let component: AsyncDemoComponent;
  let fixture: ComponentFixture<AsyncDemoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AsyncDemoComponent, FormsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(AsyncDemoComponent);
    component = fixture.componentInstance;
  });

  describe('Component Creation', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should initialize with empty state', () => {
      expect(component.isLoading()).toBe(false);
      expect(component.users()).toEqual([]);
      expect(component.loadError()).toBeNull();
    });

    it('should initialize search state', () => {
      expect(component.searchTerm()).toBe('');
      expect(component.searchResults()).toEqual([]);
      expect(component.isSearching()).toBe(false);
      expect(component.searchError()).toBeNull();
    });
  });

  describe('Data Loading', () => {
    it('should load users successfully', fakeAsync(() => {
      // Spy on Math.random to ensure success (return > 0.2)
      jest.spyOn(Math, 'random').mockReturnValue(0.5);

      component.loadUsers();
      expect(component.isLoading()).toBe(true);

      tick(1500); // Wait for delay (1500ms in component)
      fixture.detectChanges();

      expect(component.isLoading()).toBe(false);
      expect(component.users().length).toBe(5);
      expect(component.loadError()).toBeNull();
      expect(component.users()[0].name).toBe('Alice Johnson');
    }));

    it('should handle loading error', fakeAsync(() => {
      // Force error by returning < 0.2
      jest.spyOn(Math, 'random').mockReturnValue(0.1);

      component.loadUsers();
      expect(component.isLoading()).toBe(true);

      tick(1500);
      fixture.detectChanges();

      expect(component.isLoading()).toBe(false);
      expect(component.users()).toEqual([]);
      expect(component.loadError()).toBe(
        'Network error: Failed to fetch users'
      );
    }));

    it('should reset error before loading', fakeAsync(() => {
      // Set an initial error
      component.loadError.set('Previous error');

      // Force success
      jest.spyOn(Math, 'random').mockReturnValue(0.5);

      component.loadUsers();
      tick(1500);

      expect(component.loadError()).toBeNull();
      expect(component.users().length).toBe(5);
    }));

    it('should retry loading with retry button', fakeAsync(() => {
      // Force success
      jest.spyOn(Math, 'random').mockReturnValue(0.5);

      component.retry();
      tick(1500);

      expect(component.users().length).toBe(5);
      expect(component.loadError()).toBeNull();
    }));
  });

  describe('Debounced Search', () => {
    beforeEach(fakeAsync(() => {
      // Load users first
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
      component.loadUsers();
      tick(1500);
    }));

    it('should debounce search input', fakeAsync(() => {
      component.onSearchInput('test');

      // Should not search immediately
      expect(component.isSearching()).toBe(false);

      // Wait for debounce
      tick(500);
      expect(component.isSearching()).toBe(true);

      // Wait for search to complete
      tick(800);
      expect(component.isSearching()).toBe(false);
    }));

    it('should cancel previous search when typing', fakeAsync(() => {
      component.onSearchInput('Ali');

      tick(300); // Partial debounce

      // Type more
      component.onSearchInput('Alice');

      tick(500); // Complete new debounce
      tick(800); // Complete search

      // Should only have performed one search
      expect(component.searchResults().length).toBeGreaterThan(0);
    }));

    it('should find matching users by name', fakeAsync(() => {
      component.onSearchInput('Alice');

      tick(500 + 800); // Debounce + search delay

      expect(component.searchResults().length).toBe(1);
      expect(component.searchResults()[0].name).toBe('Alice Johnson');
    }));

    it('should find matching users by email', fakeAsync(() => {
      component.onSearchInput('bob@');

      tick(500 + 800);

      expect(component.searchResults().length).toBe(1);
      expect(component.searchResults()[0].email).toContain('bob@');
    }));

    it('should handle search errors', fakeAsync(() => {
      // Force search error (< 0.15)
      jest.spyOn(Math, 'random').mockReturnValue(0.1);

      component.onSearchInput('test');

      tick(500 + 800);

      expect(component.searchError()).toBe(
        'Search service temporarily unavailable'
      );
      expect(component.searchResults()).toEqual([]);
      expect(component.isSearching()).toBe(false);
    }));

    it('should clear results when search term is empty', fakeAsync(() => {
      // First do a search
      component.onSearchInput('Alice');
      tick(500 + 800);
      expect(component.searchResults().length).toBeGreaterThan(0);

      // Clear search term
      component.onSearchInput('');

      // Should clear immediately without debounce
      expect(component.searchResults()).toEqual([]);
      expect(component.searchError()).toBeNull();
    }));
  });

  describe('Optimistic Add User', () => {
    beforeEach(fakeAsync(() => {
      // Load users first
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
      component.loadUsers();
      tick(1500);
    }));

    it('should add user optimistically', fakeAsync(() => {
      // Force success (> 0.3)
      jest.spyOn(Math, 'random').mockReturnValue(0.5);

      const initialCount = component.users().length;

      component.addUser();

      // User should be added immediately
      expect(component.users().length).toBe(initialCount + 1);
      expect(component.users()[initialCount].name).toBe('New User');

      tick(1000); // Wait for save

      // Should still be there after save succeeds
      expect(component.users().length).toBe(initialCount + 1);
      expect(component.loadError()).toBeNull();
    }));

    it('should rollback on add failure', fakeAsync(() => {
      // Force error (< 0.3)
      jest.spyOn(Math, 'random').mockReturnValue(0.2);

      const initialCount = component.users().length;
      const initialUsers = [...component.users()];

      component.addUser();

      // User added optimistically
      expect(component.users().length).toBe(initialCount + 1);

      tick(1000); // Wait for failed save

      // Should be rolled back
      expect(component.users().length).toBe(initialCount);
      expect(component.users()).toEqual(initialUsers);
      expect(component.loadError()).toBe('Failed to add user');

      // Error should clear after 3 seconds
      tick(3000);
      expect(component.loadError()).toBeNull();
    }));

    it('should add user with correct properties', fakeAsync(() => {
      jest.spyOn(Math, 'random').mockReturnValue(0.5);

      component.addUser();

      const newUser = component.users()[component.users().length - 1];
      expect(newUser.name).toBe('New User');
      expect(newUser.email).toBe('new.user@example.com');
      expect(newUser.avatar).toBe('🆕');
      expect(newUser.id).toBeDefined();
    }));
  });

  describe('Optimistic Delete User', () => {
    beforeEach(fakeAsync(() => {
      // Load users first
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
      component.loadUsers();
      tick(1500);
    }));

    it('should delete user optimistically', fakeAsync(() => {
      // Force success (> 0.2)
      jest.spyOn(Math, 'random').mockReturnValue(0.5);

      const initialCount = component.users().length;
      const userToDelete = component.users()[0];

      component.deleteUser(userToDelete.id);

      // User should be removed immediately
      expect(component.users().length).toBe(initialCount - 1);
      expect(
        component.users().find((u) => u.id === userToDelete.id)
      ).toBeUndefined();

      tick(800); // Wait for delete

      // Should still be deleted
      expect(component.users().length).toBe(initialCount - 1);
      expect(component.loadError()).toBeNull();
    }));

    it('should rollback on delete failure', fakeAsync(() => {
      // Force error (< 0.2)
      jest.spyOn(Math, 'random').mockReturnValue(0.1);

      const initialCount = component.users().length;
      const initialUsers = [...component.users()];
      const userToDelete = component.users()[0];

      component.deleteUser(userToDelete.id);

      // User removed optimistically
      expect(component.users().length).toBe(initialCount - 1);

      tick(800); // Wait for failed delete

      // Should be rolled back
      expect(component.users().length).toBe(initialCount);
      expect(component.users()).toEqual(initialUsers);
      expect(component.loadError()).toBe('Failed to delete user');

      // Error should clear after 3 seconds
      tick(3000);
      expect(component.loadError()).toBeNull();
    }));
  });

  describe('Computed Properties', () => {
    it('should compute hasResults correctly', fakeAsync(() => {
      expect(component.hasResults()).toBe(false);

      // Load users and search
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
      component.loadUsers();
      tick(1500);

      component.onSearchInput('Alice');
      tick(500 + 800);

      expect(component.hasResults()).toBe(true);
    }));

    it('should compute hasUsers correctly', fakeAsync(() => {
      expect(component.hasUsers()).toBe(false);

      // Load users
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
      component.loadUsers();
      tick(1500);

      expect(component.hasUsers()).toBe(true);
    }));
  });

  describe('Clear Search', () => {
    it('should clear all search state', fakeAsync(() => {
      // Load users and perform search
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
      component.loadUsers();
      tick(1500);

      component.onSearchInput('Alice');
      tick(500 + 800);

      expect(component.searchTerm()).toBe('Alice');
      expect(component.searchResults().length).toBeGreaterThan(0);

      component.clearSearch();

      expect(component.searchTerm()).toBe('');
      expect(component.searchResults()).toEqual([]);
      expect(component.searchError()).toBeNull();
    }));
  });

  describe('Edge Cases', () => {
    it('should handle empty search results', fakeAsync(() => {
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
      component.loadUsers();
      tick(1500);

      component.onSearchInput('nonexistent');
      tick(500 + 800);

      expect(component.searchResults()).toEqual([]);
      expect(component.hasResults()).toBe(false);
    }));

    it('should handle multiple rapid searches', fakeAsync(() => {
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
      component.loadUsers();
      tick(1500);

      // Rapid typing
      component.onSearchInput('A');
      tick(100);

      component.onSearchInput('Al');
      tick(100);

      component.onSearchInput('Ali');
      tick(100);

      component.onSearchInput('Alic');
      tick(100);

      component.onSearchInput('Alice');
      tick(500 + 800); // Complete final search

      // Should only have final results
      expect(component.searchResults().length).toBe(1);
      expect(component.searchResults()[0].name).toBe('Alice Johnson');
    }));

    it('should handle deleting non-existent user gracefully', fakeAsync(() => {
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
      component.loadUsers();
      tick(1500);

      const initialCount = component.users().length;

      // Try to delete non-existent user
      component.deleteUser(99999);

      expect(component.users().length).toBe(initialCount);
    }));

    it('should handle concurrent operations', fakeAsync(() => {
      jest.spyOn(Math, 'random').mockReturnValue(0.5);

      // Start loading
      component.loadUsers();
      tick(750); // Halfway through load

      // Start search (should not interfere)
      component.onSearchInput('Alice');

      tick(750); // Complete load
      expect(component.users().length).toBe(5);

      tick(500 + 800); // Complete search
      expect(component.searchResults().length).toBe(1);
    }));
  });

  describe('Integration Tests', () => {
    it('should support complete user workflow', fakeAsync(() => {
      // Load users
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
      component.loadUsers();
      tick(1500);
      expect(component.users().length).toBe(5);

      // Search for user
      component.onSearchInput('Alice');
      tick(500 + 800);
      expect(component.searchResults().length).toBe(1);

      // Clear search
      component.clearSearch();
      expect(component.searchTerm()).toBe('');

      // Add new user
      component.addUser();
      tick(1000);
      expect(component.users().length).toBe(6);

      // Delete user
      const userToDelete = component.users()[0];
      component.deleteUser(userToDelete.id);
      tick(800);
      expect(component.users().length).toBe(5);
    }));

    it('should handle error recovery workflow', fakeAsync(() => {
      // Force initial load error, then succeed on retry, then fail on add, then succeed on second add
      jest.spyOn(Math, 'random')
        .mockReturnValueOnce(0.1) // loadUsers fails
        .mockReturnValueOnce(0.5) // retry succeeds
        .mockReturnValueOnce(0.1) // addUser fails
        .mockReturnValue(0.5); // second addUser succeeds

      component.loadUsers();
      tick(1500);
      expect(component.loadError()).toBeTruthy();

      // Retry and succeed
      component.retry();
      tick(1500);
      expect(component.users().length).toBe(5);
      expect(component.loadError()).toBeNull();

      // Add user with failure
      component.addUser();
      expect(component.users().length).toBe(6);

      tick(1000);
      expect(component.users().length).toBe(5); // Rolled back
      expect(component.loadError()).toBe('Failed to add user');

      // Wait for error to clear
      tick(3000);
      expect(component.loadError()).toBeNull();

      // Try again and succeed
      component.addUser();
      tick(1000);
      expect(component.users().length).toBe(6);
    }));
  });
});
