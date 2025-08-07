import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { createEntityStore } from '@signal-store';

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
  template: `
    <div class="container mx-auto p-6">
      <h1 class="text-3xl font-bold text-gray-800 mb-6">
        🗃️ Entity Store CRUD Operations
      </h1>

      <div class="mb-6 bg-purple-50 border border-purple-200 rounded-lg p-4">
        <div class="flex items-center mb-2">
          <span class="text-purple-600 mr-2">💡</span>
          <h3 class="font-semibold text-purple-800">What This Demonstrates</h3>
        </div>
        <p class="text-purple-700 text-sm">
          Entity stores provide specialized CRUD operations for managing
          collections of entities. This includes optimized selectors, built-in
          CRUD methods, and reactive queries.
        </p>
      </div>

      <!-- Add/Edit Form -->
      <div class="mb-8 bg-white rounded-lg shadow-md p-6">
        <h2 class="text-xl font-semibold text-gray-800 mb-4">
          {{ editingUser ? '✏️ Edit User' : '➕ Add New User' }}
        </h2>

        <form
          (ngSubmit)="editingUser ? updateUser() : addUser()"
          class="space-y-4"
        >
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                for="name"
                class="block text-sm font-medium text-gray-700 mb-1"
              >
                Name
              </label>
              <input
                id="name"
                [(ngModel)]="userForm.name"
                name="name"
                required
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Enter full name"
              />
            </div>

            <div>
              <label
                for="email"
                class="block text-sm font-medium text-gray-700 mb-1"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                [(ngModel)]="userForm.email"
                name="email"
                required
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Enter email address"
              />
            </div>

            <div>
              <label
                for="age"
                class="block text-sm font-medium text-gray-700 mb-1"
              >
                Age
              </label>
              <input
                id="age"
                type="number"
                [(ngModel)]="userForm.age"
                name="age"
                min="18"
                max="100"
                required
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Enter age"
              />
            </div>

            <div>
              <label
                for="department"
                class="block text-sm font-medium text-gray-700 mb-1"
              >
                Department
              </label>
              <select
                id="department"
                [(ngModel)]="userForm.department"
                name="department"
                required
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">Select Department</option>
                <option value="Engineering">Engineering</option>
                <option value="Design">Design</option>
                <option value="Marketing">Marketing</option>
                <option value="Sales">Sales</option>
                <option value="HR">HR</option>
              </select>
            </div>
          </div>

          <div class="flex items-center">
            <input
              type="checkbox"
              id="active"
              [(ngModel)]="userForm.active"
              name="active"
              class="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
            />
            <label for="active" class="ml-2 block text-sm text-gray-700">
              Active user
            </label>
          </div>

          <div class="flex space-x-3">
            <button
              type="submit"
              class="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
            >
              {{ editingUser ? 'Update User' : 'Add User' }}
            </button>

            <button
              type="button"
              *ngIf="editingUser"
              (click)="cancelEdit()"
              class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              (click)="resetForm()"
              class="px-4 py-2 bg-gray-400 text-white rounded-md hover:bg-gray-500 transition-colors"
            >
              Reset Form
            </button>
          </div>
        </form>
      </div>

      <!-- Filter and Search -->
      <div class="mb-8 bg-white rounded-lg shadow-md p-6">
        <h2 class="text-xl font-semibold text-gray-800 mb-4">
          🔍 Filter & Search
        </h2>

        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label
              for="search"
              class="block text-sm font-medium text-gray-700 mb-1"
            >
              Search
            </label>
            <input
              id="search"
              [(ngModel)]="searchTerm"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="Search by name or email"
            />
          </div>

          <div>
            <label
              for="departmentFilter"
              class="block text-sm font-medium text-gray-700 mb-1"
            >
              Department
            </label>
            <select
              id="departmentFilter"
              [(ngModel)]="departmentFilter"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">All Departments</option>
              <option value="Engineering">Engineering</option>
              <option value="Design">Design</option>
              <option value="Marketing">Marketing</option>
              <option value="Sales">Sales</option>
              <option value="HR">HR</option>
            </select>
          </div>

          <div>
            <label
              for="statusFilter"
              class="block text-sm font-medium text-gray-700 mb-1"
            >
              Status
            </label>
            <select
              id="statusFilter"
              [(ngModel)]="statusFilter"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">All Users</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>

          <div class="flex items-end">
            <button
              (click)="clearFilters()"
              class="w-full px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      <!-- Statistics -->
      <div class="mb-8 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="bg-white rounded-lg shadow-md p-6 text-center">
          <div class="text-2xl font-bold text-purple-600 mb-2">
            {{ userStore.selectTotal()() }}
          </div>
          <div class="text-sm text-gray-600">Total Users</div>
        </div>

        <div class="bg-white rounded-lg shadow-md p-6 text-center">
          <div class="text-2xl font-bold text-green-600 mb-2">
            {{ getActiveUsers().length }}
          </div>
          <div class="text-sm text-gray-600">Active Users</div>
        </div>

        <div class="bg-white rounded-lg shadow-md p-6 text-center">
          <div class="text-2xl font-bold text-blue-600 mb-2">
            {{ getFilteredUsers().length }}
          </div>
          <div class="text-sm text-gray-600">Filtered Results</div>
        </div>

        <div class="bg-white rounded-lg shadow-md p-6 text-center">
          <div class="text-2xl font-bold text-orange-600 mb-2">
            {{ getDepartmentCount() }}
          </div>
          <div class="text-sm text-gray-600">Departments</div>
        </div>
      </div>

      <!-- User List -->
      <div class="bg-white rounded-lg shadow-md p-6">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-semibold text-gray-800">👥 User List</h2>

          <div class="flex space-x-2">
            <button
              (click)="addSampleUsers()"
              class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
            >
              Add Sample Users
            </button>

            <button
              (click)="clearAllUsers()"
              class="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm"
            >
              Clear All
            </button>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="min-w-full table-auto">
            <thead class="bg-gray-50">
              <tr>
                <th
                  class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Name
                </th>
                <th
                  class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Email
                </th>
                <th
                  class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Age
                </th>
                <th
                  class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Department
                </th>
                <th
                  class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Status
                </th>
                <th
                  class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr
                *ngFor="let user of getFilteredUsers(); trackBy: trackByUserId"
                class="hover:bg-gray-50"
              >
                <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                  {{ user.name }}
                </td>
                <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                  {{ user.email }}
                </td>
                <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                  {{ user.age }}
                </td>
                <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                  <span
                    class="px-2 py-1 text-xs font-medium rounded-full"
                    [class]="getDepartmentClass(user.department)"
                  >
                    {{ user.department }}
                  </span>
                </td>
                <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                  <span
                    class="px-2 py-1 text-xs font-medium rounded-full"
                    [class]="
                      user.active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    "
                  >
                    {{ user.active ? 'Active' : 'Inactive' }}
                  </span>
                </td>
                <td class="px-4 py-2 whitespace-nowrap text-sm space-x-2">
                  <button
                    (click)="editUser(user)"
                    class="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Edit
                  </button>
                  <button
                    (click)="toggleUserStatus(user.id)"
                    class="text-yellow-600 hover:text-yellow-700 font-medium"
                  >
                    {{ user.active ? 'Deactivate' : 'Activate' }}
                  </button>
                  <button
                    (click)="deleteUser(user.id)"
                    class="text-red-600 hover:text-red-700 font-medium"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          <div
            *ngIf="getFilteredUsers().length === 0"
            class="text-center py-8 text-gray-500"
          >
            No users found matching your criteria.
          </div>
        </div>
      </div>

      <!-- Entity Store Methods Demo -->
      <div class="mt-8 bg-white rounded-lg shadow-md p-6">
        <h2 class="text-xl font-semibold text-gray-800 mb-4">
          🔧 Entity Store Methods
        </h2>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 class="font-medium text-gray-800 mb-2">Available Methods</h3>
            <div class="bg-gray-800 text-gray-300 p-4 rounded-lg text-sm">
              <pre><code>{{ entityMethods }}</code></pre>
            </div>
          </div>

          <div>
            <h3 class="font-medium text-gray-800 mb-2">Selector Examples</h3>
            <div class="space-y-2 text-sm">
              <div>
                <strong>All Users:</strong>
                <code class="bg-purple-100 px-2 py-1 rounded"
                  >selectAll()()</code
                >
              </div>
              <div>
                <strong>By ID:</strong>
                <code class="bg-purple-100 px-2 py-1 rounded"
                  >findById('id')()</code
                >
              </div>
              <div>
                <strong>Active Users:</strong>
                <code class="bg-purple-100 px-2 py-1 rounded"
                  >findBy(u => u.active)()</code
                >
              </div>
              <div>
                <strong>All IDs:</strong>
                <code class="bg-purple-100 px-2 py-1 rounded"
                  >selectIds()()</code
                >
              </div>
              <div>
                <strong>Total Count:</strong>
                <code class="bg-purple-100 px-2 py-1 rounded"
                  >selectTotal()()</code
                >
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .container {
        max-width: 1200px;
      }

      code {
        font-family: 'Courier New', monospace;
      }
    `,
  ],
})
export class EntityCrudComponent {
  userStore = createEntityStore<User>([
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

      this.userStore.add(newUser);
      this.resetForm();
    }
  }

  updateUser() {
    if (this.editingUser && this.isFormValid()) {
      this.userStore.update(this.editingUser.id, {
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
      this.userStore.remove(id);

      if (this.editingUser?.id === id) {
        this.cancelEdit();
      }
    }
  }

  toggleUserStatus(id: string) {
    const user = this.userStore.findById(id)();
    if (user) {
      this.userStore.update(id, { active: !user.active });
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

    sampleUsers.forEach((user) => this.userStore.add(user));
  }

  clearAllUsers() {
    if (confirm('Are you sure you want to delete all users?')) {
      const allUsers = this.userStore.selectAll()();
      allUsers.forEach((user) => this.userStore.remove(user.id));
      this.cancelEdit();
    }
  }

  getFilteredUsers(): User[] {
    let users = this.userStore.selectAll()();

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
    return this.userStore.findBy((user) => user.active)();
  }

  getDepartmentCount(): number {
    const users = this.userStore.selectAll()();
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

  entityMethods = `// Entity Store CRUD Methods
userStore.add(user);           // Add entity
userStore.update(id, changes); // Update entity
userStore.remove(id);          // Remove entity
userStore.upsert(user);        // Add or update

// Selectors
userStore.selectAll()();       // Get all entities
userStore.findById(id)();      // Find by ID
userStore.findBy(predicate)(); // Filter entities
userStore.selectIds()();       // Get all IDs
userStore.selectTotal()();     // Get count`;
}
