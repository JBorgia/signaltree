import { CommonModule } from '@angular/common';
import { Component, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { signalTree, withEntities } from '@signaltree/core';

import {
  generatePosts,
  generateUsers,
  Post,
  User,
} from '../../../../../shared/models';

interface EntitiesState {
  users: User[];
  posts: Post[];
  selectedUserId: number | null;
  searchTerm: string;
  // Pagination & Sorting
  usersPage: number;
  usersPerPage: number;
  usersSortBy: 'name' | 'email' | 'id';
  usersSortAsc: boolean;
  postsPage: number;
  postsPerPage: number;
  postsSortBy: 'title' | 'likes' | 'id';
  postsSortAsc: boolean;
}

@Component({
  selector: 'app-entities-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './entities-demo.component.html',
  styleUrls: ['./entities-demo.component.scss'],
})
export class EntitiesDemoComponent {
  store = signalTree<EntitiesState>({
    users: [],
    posts: [],
    selectedUserId: null,
    searchTerm: '',
    // Pagination & Sorting defaults
    usersPage: 1,
    usersPerPage: 10,
    usersSortBy: 'name',
    usersSortAsc: true,
    postsPage: 1,
    postsPerPage: 10,
    postsSortBy: 'likes',
    postsSortAsc: false,
  }).with(withEntities());

  // Entity helpers using @signaltree/entities
  userHelpers = this.store.entities<User>('users');
  postHelpers = this.store.entities<Post>('posts');

  // State signals
  searchTerm = '';
  lastOperation = 'None';
  operationCount = 0;

  // Bulk selection & filtering
  selectedPostIds = new Set<number>();
  tagFilter = '';
  statusFilter: 'all' | 'popular' | 'unpopular' = 'all';
  dateRangeFilter: 'all' | 'today' | 'week' | 'month' = 'all';
  showDeleteConfirmation = false;

  // Form input properties for tests
  newUserName = '';
  newUserEmail = '';

  // Editing state
  editingPostId: number | null = null;
  editingPostTitle = '';
  editingPostContent = '';
  editingUserId: number | null = null;
  editingUserName = '';
  editingUserEmail = '';

  // Entity selectors using entity helpers
  userCount = this.userHelpers.selectTotal();
  postCount = this.postHelpers.selectTotal();
  allUsers = this.userHelpers.selectAll();
  allPosts = this.postHelpers.selectAll();

  selectedUser = computed(() => {
    const id = this.store.$.selectedUserId();
    return id ? this.userHelpers.selectById(id)() : null;
  });

  filteredUsers = computed(() => {
    const users = this.allUsers();
    const term = this.searchTerm.toLowerCase();

    if (!term) return users;

    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term)
    );
  });

  sortedUsers = computed(() => {
    const users = [...this.filteredUsers()];
    const sortBy = this.store.$.usersSortBy();
    const sortAsc = this.store.$.usersSortAsc();

    users.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'name' || sortBy === 'email') {
        comparison = a[sortBy].localeCompare(b[sortBy]);
      } else {
        comparison = a[sortBy] - b[sortBy];
      }
      return sortAsc ? comparison : -comparison;
    });

    return users;
  });

  paginatedUsers = computed(() => {
    const users = this.sortedUsers();
    const page = this.store.$.usersPage();
    const perPage = this.store.$.usersPerPage();
    const start = (page - 1) * perPage;
    return users.slice(start, start + perPage);
  });

  totalUserPages = computed(() => {
    return Math.ceil(this.sortedUsers().length / this.store.$.usersPerPage());
  });

  sortedPosts = computed(() => {
    let posts = [...this.displayedPosts()];

    // Multi-criteria filtering

    // Filter by tag if tag filter is active
    if (this.tagFilter.trim()) {
      const filterLower = this.tagFilter.toLowerCase();
      posts = posts.filter((post) =>
        post.tags.some((tag) => tag.toLowerCase().includes(filterLower))
      );
    }

    // Filter by status (popularity)
    if (this.statusFilter === 'popular') {
      posts = posts.filter((post) => post.likes >= 10);
    } else if (this.statusFilter === 'unpopular') {
      posts = posts.filter((post) => post.likes < 10);
    }

    // Filter by date range
    if (this.dateRangeFilter !== 'all') {
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;
      let cutoffDate: number;

      switch (this.dateRangeFilter) {
        case 'today':
          cutoffDate = now - oneDayMs;
          break;
        case 'week':
          cutoffDate = now - 7 * oneDayMs;
          break;
        case 'month':
          cutoffDate = now - 30 * oneDayMs;
          break;
        default:
          cutoffDate = 0;
      }

      posts = posts.filter((post) => post.createdAt.getTime() >= cutoffDate);
    }

    const sortBy = this.store.$.postsSortBy();
    const sortAsc = this.store.$.postsSortAsc();

    posts.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'title') {
        comparison = a.title.localeCompare(b.title);
      } else {
        comparison = a[sortBy] - b[sortBy];
      }
      return sortAsc ? comparison : -comparison;
    });

    return posts;
  });

  paginatedPosts = computed(() => {
    const posts = this.sortedPosts();
    const page = this.store.$.postsPage();
    const perPage = this.store.$.postsPerPage();
    const start = (page - 1) * perPage;
    return posts.slice(start, start + perPage);
  });

  totalPostPages = computed(() => {
    return Math.ceil(this.sortedPosts().length / this.store.$.postsPerPage());
  });

  userPosts = computed(() => {
    const selectedId = this.store.$.selectedUserId();
    if (!selectedId) return [];

    return this.store.$.posts().filter((post) => post.authorId === selectedId);
  });

  displayedPosts = computed(() => {
    const selectedId = this.store.$.selectedUserId();
    const allPosts = this.store.$.posts();

    return selectedId
      ? allPosts.filter((post) => post.authorId === selectedId)
      : allPosts.slice(0, 20); // Show first 20 if no user selected
  });

  userTotalLikes = computed(() => {
    return this.userPosts().reduce((sum, post) => sum + post.likes, 0);
  });

  // User stats methods
  getUserPostsCount(): number {
    return this.userPosts().length;
  }

  getUserAvgPostLength(): number {
    const posts = this.userPosts();
    if (posts.length === 0) return 0;
    const totalLength = posts.reduce(
      (sum, post) => sum + post.content.length,
      0
    );
    return Math.round(totalLength / posts.length);
  }

  getUserActivityStatus(): string {
    const postsCount = this.getUserPostsCount();
    const totalLikes = this.userTotalLikes();

    if (postsCount === 0) return 'Inactive';
    if (postsCount >= 5 && totalLikes >= 20) return 'Very Active';
    if (postsCount >= 3 || totalLikes >= 10) return 'Active';
    return 'Low Activity';
  }

  getUserActivityClass(): string {
    const status = this.getUserActivityStatus();
    if (status === 'Very Active') return 'text-green-600';
    if (status === 'Active') return 'text-blue-600';
    if (status === 'Low Activity') return 'text-yellow-600';
    return 'text-gray-500';
  }

  // Filter methods
  clearAllFilters() {
    this.tagFilter = '';
    this.statusFilter = 'all';
    this.dateRangeFilter = 'all';
  }

  // Export methods
  exportUserData() {
    const user = this.selectedUser();
    if (!user) return;

    const userPosts = this.userPosts();
    const exportData = {
      user,
      posts: userPosts,
      stats: {
        totalPosts: this.getUserPostsCount(),
        totalLikes: this.userTotalLikes(),
        avgPostLength: this.getUserAvgPostLength(),
        activityStatus: this.getUserActivityStatus(),
      },
      exportedAt: new Date().toISOString(),
    };

    this.downloadJSON(exportData, `user-${user.id}-data.json`);
  }

  exportSelectedPosts() {
    const selectedPosts = this.allPosts().filter((post) =>
      this.selectedPostIds.has(post.id)
    );

    if (selectedPosts.length === 0) return;

    const exportData = {
      posts: selectedPosts,
      count: selectedPosts.length,
      exportedAt: new Date().toISOString(),
    };

    this.downloadJSON(
      exportData,
      `selected-posts-${selectedPosts.length}.json`
    );
  }

  private downloadJSON(data: unknown, filename: string) {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private trackOperation(operation: string) {
    this.lastOperation = operation;
    this.operationCount++;
  }

  loadUsers() {
    const users = generateUsers(50);
    // Use entity helpers to clear and add all users
    this.userHelpers.clear();
    users.forEach((user) => this.userHelpers.add(user));
    this.trackOperation('Load Users');
  }

  loadPosts() {
    const userCount = this.userCount();
    if (userCount === 0) {
      this.loadUsers();
    }

    const posts = generatePosts(200, Math.max(userCount, 50));
    // Use entity helpers to clear and add all posts
    this.postHelpers.clear();
    posts.forEach((post) => this.postHelpers.add(post));
    this.trackOperation('Load Posts');
  }

  addRandomUser() {
    const newUser = generateUsers(1, Date.now())[0];
    const users = this.store.$.users();
    const currentMaxId = Math.max(0, ...users.map((u) => u.id));
    newUser.id = currentMaxId + 1;

    // Use entity helper to add user
    this.userHelpers.add(newUser);
    this.trackOperation('Add User');
  }

  addRandomPost() {
    const users = this.store.$.users();
    if (users.length === 0) return;

    const newPost = generatePosts(1, users.length, Date.now())[0];
    const posts = this.store.$.posts();
    const currentMaxId = Math.max(0, ...posts.map((p) => p.id));
    newPost.id = currentMaxId + 1;
    newPost.authorId = users[Math.floor(Math.random() * users.length)].id;

    // Use entity helper to add post
    this.postHelpers.add(newPost);
    this.trackOperation('Add Post');
  }

  selectUser(userId: number) {
    this.store.$.selectedUserId.set(
      this.store.$.selectedUserId() === userId ? null : userId
    );
    this.trackOperation('Select User');
  }

  updateSearchTerm(event: Event) {
    const target = event.target as HTMLInputElement;
    this.searchTerm = target.value;
    this.trackOperation('Search');
  }

  bulkUpdatePosts() {
    this.store.$.posts.update((posts) =>
      posts.map((post) => ({
        ...post,
        likes: post.likes + 10,
      }))
    );
    this.trackOperation('Bulk Update Posts');
  }

  removeInactivePosts() {
    this.store.$.posts.update((posts) =>
      posts.filter((post) => post.likes >= 20)
    );
    this.trackOperation('Remove Inactive Posts');
  }

  getPostAuthor(authorId: number): User | undefined {
    return this.store.$.users().find((u) => u.id === authorId);
  }

  getUserClass(userId: number): string {
    const isSelected = this.store.$.selectedUserId() === userId;
    return isSelected
      ? 'bg-blue-100 border-2 border-blue-300'
      : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent';
  }

  trackUser(index: number, user: User): number {
    return user.id;
  }

  trackPost(index: number, post: Post): number {
    return post.id;
  }

  // Pagination methods
  prevUsersPage() {
    const page = this.store.$.usersPage();
    if (page > 1) {
      this.store.$.usersPage.set(page - 1);
    }
  }

  nextUsersPage() {
    const page = this.store.$.usersPage();
    if (page < this.totalUserPages()) {
      this.store.$.usersPage.set(page + 1);
    }
  }

  setUsersPerPage(perPage: number) {
    this.store.$.usersPerPage.set(perPage);
    this.store.$.usersPage.set(1); // Reset to first page
  }

  setUsersSortBy(sortBy: 'name' | 'email' | 'id') {
    const current = this.store.$.usersSortBy();
    if (current === sortBy) {
      // Toggle direction
      this.store.$.usersSortAsc.set(!this.store.$.usersSortAsc());
    } else {
      this.store.$.usersSortBy.set(sortBy);
      this.store.$.usersSortAsc.set(true);
    }
  }

  prevPostsPage() {
    const page = this.store.$.postsPage();
    if (page > 1) {
      this.store.$.postsPage.set(page - 1);
    }
  }

  nextPostsPage() {
    const page = this.store.$.postsPage();
    if (page < this.totalPostPages()) {
      this.store.$.postsPage.set(page + 1);
    }
  }

  setPostsPerPage(perPage: number) {
    this.store.$.postsPerPage.set(perPage);
    this.store.$.postsPage.set(1); // Reset to first page
  }

  setPostsSortBy(sortBy: 'title' | 'likes' | 'id') {
    const current = this.store.$.postsSortBy();
    if (current === sortBy) {
      // Toggle direction
      this.store.$.postsSortAsc.set(!this.store.$.postsSortAsc());
    } else {
      this.store.$.postsSortBy.set(sortBy);
      this.store.$.postsSortAsc.set(true);
    }
  }

  // CRUD methods for tests
  addUser() {
    if (!this.newUserName || !this.newUserEmail) return;

    const users = this.store.$.users();
    const currentMaxId = Math.max(0, ...users.map((u) => u.id));

    const newUser: User = {
      id: currentMaxId + 1,
      name: this.newUserName,
      email: this.newUserEmail,
      avatar: `https://i.pravatar.cc/150?u=${this.newUserEmail}`,
    };

    this.userHelpers.add(newUser);
    this.newUserName = '';
    this.newUserEmail = '';
    this.trackOperation('Add User');
  }

  updateUser(id: number, updates: Partial<User>) {
    this.userHelpers.update(id, updates);
    this.trackOperation('Update User');
  }

  deleteUser(id: number) {
    this.userHelpers.remove(id);
    this.trackOperation('Delete User');
  }

  // Accessor methods for tests
  users() {
    return this.allUsers();
  }

  // Post interaction methods
  likePost(postId: number) {
    const post = this.postHelpers.selectById(postId)();
    if (post) {
      this.postHelpers.update(postId, { likes: post.likes + 1 });
      this.trackOperation('Like Post');
    }
  }

  startEditingPost(post: Post) {
    this.editingPostId = post.id;
    this.editingPostTitle = post.title;
    this.editingPostContent = post.content;
  }

  savePost() {
    if (this.editingPostId && this.editingPostTitle.trim()) {
      this.postHelpers.update(this.editingPostId, {
        title: this.editingPostTitle.trim(),
        content: this.editingPostContent.trim(),
      });
      this.trackOperation('Update Post');
      this.cancelEditPost();
    }
  }

  cancelEditPost() {
    this.editingPostId = null;
    this.editingPostTitle = '';
    this.editingPostContent = '';
  }

  // User editing methods
  startEditingUser(user: User) {
    this.editingUserId = user.id;
    this.editingUserName = user.name;
    this.editingUserEmail = user.email;
  }

  saveUser() {
    if (
      this.editingUserId &&
      this.editingUserName.trim() &&
      this.editingUserEmail.trim()
    ) {
      this.userHelpers.update(this.editingUserId, {
        name: this.editingUserName.trim(),
        email: this.editingUserEmail.trim(),
      });
      this.trackOperation('Update User');
      this.cancelEditUser();
    }
  }

  cancelEditUser() {
    this.editingUserId = null;
    this.editingUserName = '';
    this.editingUserEmail = '';
  }

  // Bulk selection methods
  togglePostSelection(postId: number) {
    if (this.selectedPostIds.has(postId)) {
      this.selectedPostIds.delete(postId);
    } else {
      this.selectedPostIds.add(postId);
    }
  }

  selectAllPosts() {
    this.paginatedPosts().forEach((post) => {
      this.selectedPostIds.add(post.id);
    });
  }

  deselectAllPosts() {
    this.selectedPostIds.clear();
  }

  confirmDeleteSelected() {
    if (this.selectedPostIds.size === 0) return;

    if (confirm(`Delete ${this.selectedPostIds.size} selected posts?`)) {
      this.selectedPostIds.forEach((postId) => {
        this.postHelpers.remove(postId);
      });
      this.selectedPostIds.clear();
      this.trackOperation(`Bulk Delete ${this.selectedPostIds.size} Posts`);
    }
  }
}
