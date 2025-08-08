import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { createEntityTree } from '@signal-tree';

interface User {
  id: string;
  name: string;
  email: string;
  age: number;
  active: boolean;
  department: string;
}

@Component({
  selector: 'app-entity-crud',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './entity-crud.component.html',
  styleUrls: ['./entity-crud.component.scss'],
})
export class EntityCrudComponent {
  // Entity trees work with smart progressive enhancement!
  userTree = createEntityTree<User>([
    {
      id: '1',
      name: 'John Doe',
      email: 'john@example.com',
      age: 30,
      active: true,
      department: 'Engineering',
    },
    {
      id: '2',
      name: 'Jane Smith',
      email: 'jane@example.com',
      age: 28,
      active: true,
      department: 'Design',
    },
    {
      id: '3',
      name: 'Bob Wilson',
      email: 'bob@example.com',
      age: 35,
      active: false,
      department: 'Engineering',
    },
  ]);

  userForm: Partial<User> = {
    name: '',
    email: '',
    age: 25,
    active: true,
    department: '',
  };

  editingUser: User | null = null;
  searchTerm = '';
  departmentFilter = '';
  statusFilter = '';

  operationLog: Array<{ timestamp: Date; operation: string; user?: string }> =
    [];

  constructor() {
    this.logOperation(
      'Entity tree initialized with smart progressive enhancement'
    );
  }

  // Memoized filtered users - auto-enabling!
  get filteredUsers() {
    return this.userTree.memoize('filteredUsers', () => {
      const users = this.userTree.getAll();

      return users.filter((user) => {
        const matchesSearch =
          !this.searchTerm ||
          user.name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
          user.email.toLowerCase().includes(this.searchTerm.toLowerCase());

        const matchesDepartment =
          !this.departmentFilter || user.department === this.departmentFilter;

        const matchesStatus =
          !this.statusFilter ||
          (this.statusFilter === 'active' ? user.active : !user.active);

        return matchesSearch && matchesDepartment && matchesStatus;
      });
    });
  }

  // Memoized departments list
  get departments() {
    return this.userTree.memoize('departments', () => {
      const users = this.userTree.getAll();
      return [...new Set(users.map((user) => user.department))].sort();
    });
  }

  // Memoized statistics
  get userStats() {
    return this.userTree.memoize('userStats', () => {
      const users = this.userTree.getAll();
      return {
        total: users.length,
        active: users.filter((u) => u.active).length,
        inactive: users.filter((u) => !u.active).length,
        avgAge:
          Math.round(users.reduce((sum, u) => sum + u.age, 0) / users.length) ||
          0,
      };
    });
  }

  addUser() {
    if (this.isFormValid()) {
      const newUser: User = {
        id: this.generateId(),
        name: this.userForm.name as string,
        email: this.userForm.email as string,
        age: this.userForm.age as number,
        active: this.userForm.active as boolean,
        department: this.userForm.department as string,
      };

      this.userTree.add(newUser);
      this.resetForm();
      this.logOperation('User added', newUser.name);

      // Clear cached values after changes
      this.userTree.clearCache(['filteredUsers', 'departments', 'userStats']);
    }
  }

  updateUser() {
    if (this.editingUser && this.isFormValid()) {
      this.userTree.update(this.editingUser.id, {
        name: this.userForm.name as string,
        email: this.userForm.email as string,
        age: this.userForm.age as number,
        active: this.userForm.active as boolean,
        department: this.userForm.department as string,
      });

      this.logOperation('User updated', this.userForm.name as string);
      this.cancelEdit();

      // Clear cached values after changes
      this.userTree.clearCache(['filteredUsers', 'departments', 'userStats']);
    }
  }

  // Batch operations with auto-enabling
  batchToggleStatus() {
    const selectedUsers = this.filteredUsers().filter((_, index) => index < 3);

    this.userTree.batchUpdate(() => {
      selectedUsers.forEach((user) => {
        this.userTree.update(user.id, { active: !user.active });
      });
    });

    this.logOperation('Batch status toggle', `${selectedUsers.length} users`);
    this.userTree.clearCache();
  }

  batchAssignDepartment(department: string) {
    const inactiveUsers = this.userTree.getAll().filter((u) => !u.active);

    this.userTree.batchUpdate(() => {
      inactiveUsers.forEach((user) => {
        this.userTree.update(user.id, { department, active: true });
      });
    });

    this.logOperation(
      'Batch department assignment',
      `${inactiveUsers.length} users`
    );
    this.userTree.clearCache();
  }

  editUser(user: User) {
    this.editingUser = user;
    this.userForm = { ...user };
  }

  cancelEdit() {
    this.editingUser = null;
    this.resetForm();
  }

  deleteUser(id: string) {
    const user = this.userTree.get(id);
    if (user && confirm(`Are you sure you want to delete ${user.name}?`)) {
      this.userTree.remove(id);
      this.logOperation('User deleted', user.name);

      if (this.editingUser?.id === id) {
        this.cancelEdit();
      }

      // Clear cached values after changes
      this.userTree.clearCache();
    }
  }

  // Optimized search with cache invalidation
  onSearchChange() {
    this.userTree.invalidatePattern(['filteredUsers']);
  }

  onFilterChange() {
    this.userTree.invalidatePattern(['filteredUsers']);
  }

  // Get tree metrics to show auto-enabled features
  getMetrics() {
    const metrics = this.userTree.getMetrics();
    this.logOperation(
      'Metrics retrieved',
      `${Object.keys(metrics).length} properties`
    );
    return metrics;
  }

  // Clear all caches
  clearAllCaches() {
    this.userTree.clearCache();
    this.logOperation('All caches cleared');
  }

  toggleUserStatus(id: string) {
    const user = this.userTree.findById(id)();
    if (user) {
      this.userTree.update(id, { active: !user.active });
      this.logOperation('Status toggled', user.name);
      this.userTree.clearCache(['filteredUsers', 'userStats']);
    }
  }

  resetForm() {
    this.userForm = {
      name: '',
      email: '',
      age: 25,
      active: true,
      department: '',
    };
  }

  clearFilters() {
    this.searchTerm = '';
    this.departmentFilter = '';
    this.statusFilter = '';
    this.userTree.invalidatePattern(['filteredUsers']);
  }

  addSampleUsers() {
    const sampleUsers: User[] = [
      {
        id: this.generateId(),
        name: 'Alice Johnson',
        email: 'alice@example.com',
        age: 32,
        active: true,
        department: 'Marketing',
      },
      {
        id: this.generateId(),
        name: 'Bob Wilson',
        email: 'bob@example.com',
        age: 29,
        active: false,
        department: 'Sales',
      },
      {
        id: this.generateId(),
        name: 'Carol Davis',
        email: 'carol@example.com',
        age: 35,
        active: true,
        department: 'HR',
      },
    ];

    // Batch add with auto-enabling
    this.userTree.batchUpdate(() => {
      sampleUsers.forEach((user) => this.userTree.add(user));
    });

    this.logOperation('Sample users added', `${sampleUsers.length} users`);
    this.userTree.clearCache();
  }

  clearAllUsers() {
    if (confirm('Are you sure you want to delete all users?')) {
      const allUsers = this.userTree.getAll();

      this.userTree.batchUpdate(() => {
        allUsers.forEach((user) => this.userTree.remove(user.id));
      });

      this.cancelEdit();
      this.logOperation('All users cleared', `${allUsers.length} users`);
      this.userTree.clearCache();
    }
  }

  private logOperation(operation: string, user?: string) {
    this.operationLog.unshift({
      timestamp: new Date(),
      operation,
      user,
    });

    // Keep only last 10 entries
    if (this.operationLog.length > 10) {
      this.operationLog = this.operationLog.slice(0, 10);
    }
  }

  clearOperationLog() {
    this.operationLog = [];
  }

  trackByUserId(index: number, user: User): string {
    return user.id;
  }

  trackByIndex(index: number): number {
    return index;
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private isFormValid(): boolean {
    return !!(
      this.userForm.name &&
      this.userForm.email &&
      this.userForm.age &&
      this.userForm.department
    );
  }

  entityMethods = `// Entity Tree with Smart Progressive Enhancement
const userTree = createEntityTree<User>([
  { id: '1', name: 'John', email: 'john@example.com', age: 30 }
]);

// CRUD Operations (auto-optimized!)
userTree.add(user);           // Add entity
userTree.update(id, changes); // Update entity
userTree.remove(id);          // Remove entity
userTree.upsert(user);        // Add or update

// Queries
userTree.getAll();            // Get all entities
userTree.get(id);             // Get by ID
userTree.findBy(predicate);   // Filter entities

// Auto-enabling batch operations
userTree.batchUpdate(() => {
  userTree.add(user1);
  userTree.update(id, changes);
  userTree.remove(id2);
});

// Auto-enabling memoization for expensive queries
const filtered = userTree.memoize('filtered', () =>
  userTree.getAll().filter(u => u.active)
);`;
}
