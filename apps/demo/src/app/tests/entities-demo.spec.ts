import { TestBed } from '@angular/core/testing';
import { EntitiesDemoComponent } from '../pages/entities-demo/entities-demo.component';

describe('Entities Demo Component', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EntitiesDemoComponent],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(EntitiesDemoComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should demonstrate CRUD operations', () => {
    const fixture = TestBed.createComponent(EntitiesDemoComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    // Test that CRUD methods exist
    expect(typeof component.addUser).toBe('function');
    expect(typeof component.updateUser).toBe('function');
    expect(typeof component.deleteUser).toBe('function');

    // Test adding entities
    const initialCount = component.users().length;
    component.newUserName = 'Test User';
    component.newUserEmail = 'test@example.com';
    component.addUser();

    expect(component.users().length).toBe(initialCount + 1);

    // Find the new user
    const newUser = component.users().find((u) => u.name === 'Test User');
    expect(newUser).toBeTruthy();
    expect(newUser?.email).toBe('test@example.com');
  });

  it('should demonstrate entity selection and updates', () => {
    const fixture = TestBed.createComponent(EntitiesDemoComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    // Add a user first
    component.newUserName = 'Update Test';
    component.newUserEmail = 'update@example.com';
    component.addUser();

    const user = component.users().find((u) => u.name === 'Update Test');
    if (user) {
      // Select user
      component.selectUser(user.id);
      expect(component.selectedUser()?.id).toBe(user.id);

      // Update user
      component.updateUser(user.id, { name: 'Updated Name' });
      const updatedUser = component.users().find((u) => u.id === user.id);
      expect(updatedUser?.name).toBe('Updated Name');
    }
  });

  it('should demonstrate entity deletion', () => {
    const fixture = TestBed.createComponent(EntitiesDemoComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    // Add a user to delete
    component.newUserName = 'Delete Test';
    component.newUserEmail = 'delete@example.com';
    component.addUser();

    const user = component.users().find((u) => u.name === 'Delete Test');
    if (user) {
      const initialCount = component.users().length;

      // Delete user
      component.deleteUser(user.id);

      expect(component.users().length).toBe(initialCount - 1);
      expect(component.users().find((u) => u.id === user.id)).toBeFalsy();
    }
  });
});
