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

      this.cancelEdit();
    }
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
    if (confirm('Are you sure you want to delete this user?')) {
      this.userTree.remove(id);

      if (this.editingUser?.id === id) {
        this.cancelEdit();
      }
    }
  }

  toggleUserStatus(id: string) {
    const user = this.userTree.findById(id)();
    if (user) {
      this.userTree.update(id, { active: !user.active });
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

    sampleUsers.forEach((user) => this.userTree.add(user));
  }

  clearAllUsers() {
    if (confirm('Are you sure you want to delete all users?')) {
      const allUsers = this.userTree.selectAll()();
      allUsers.forEach((user) => this.userTree.remove(user.id));
      this.cancelEdit();
    }
  }

  getFilteredUsers(): User[] {
    let users = this.userTree.selectAll()();

    // Search filter
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      users = users.filter(
        (user) =>
          user.name.toLowerCase().includes(term) ||
          user.email.toLowerCase().includes(term)
      );
    }

    // Department filter
    if (this.departmentFilter) {
      users = users.filter((user) => user.department === this.departmentFilter);
    }

    // Status filter
    if (this.statusFilter === 'active') {
      users = users.filter((user) => user.active);
    } else if (this.statusFilter === 'inactive') {
      users = users.filter((user) => !user.active);
    }

    return users;
  }

  getActiveUsers(): User[] {
    return this.userTree.findBy((user) => user.active)();
  }

  getDepartmentCount(): number {
    const users = this.userTree.selectAll()();
    const departments = new Set(users.map((user) => user.department));
    return departments.size;
  }

  getDepartmentClass(department: string): string {
    const classes: Record<string, string> = {
      Engineering: 'bg-blue-100 text-blue-800',
      Design: 'bg-purple-100 text-purple-800',
      Marketing: 'bg-green-100 text-green-800',
      Sales: 'bg-yellow-100 text-yellow-800',
      HR: 'bg-red-100 text-red-800',
    };
    return classes[department] || 'bg-gray-100 text-gray-800';
  }

  trackByUserId(index: number, user: User): string {
    return user.id;
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

  entityMethods = `// Entity Tree CRUD Methods
userTree.add(user);           // Add entity
userTree.update(id, changes); // Update entity
userTree.remove(id);          // Remove entity
userTree.upsert(user);        // Add or update

// Selectors
userTree.selectAll()();       // Get all entities
userTree.findById(id)();      // Find by ID
userTree.findBy(predicate)(); // Filter entities
userTree.selectIds()();       // Get all IDs
userTree.selectTotal()();     // Get count`;
}
