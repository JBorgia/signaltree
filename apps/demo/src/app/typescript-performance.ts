/**
 * TypeScript Compilation Performance Test
 * Measures the impact of SignalTree on TypeScript compilation times
 * Updated to work with constraint-free SignalTree
 */

import { signalTree } from '@signaltree/core';

// This file tests TypeScript's ability to infer complex SignalTree types
// Run `npx tsc --noEmit` to measure compilation time impact

export interface User {
  id: number;
  name: string;
  email: string;
  profile: {
    age: number;
    avatar?: string;
    preferences: {
      theme: 'light' | 'dark' | 'auto';
      notifications: boolean;
      privacy: 'public' | 'friends' | 'private';
      language: string;
    };
    social: {
      twitter?: string;
      linkedin?: string;
      github?: string;
    };
    metadata: {
      lastLogin: string;
      joinedAt: string;
      isVerified: boolean;
      role: 'admin' | 'user' | 'moderator';
    };
  };
}

export interface Post {
  id: number;
  title: string;
  content: string;
  authorId: number;
  tags: string[];
  metadata: {
    createdAt: string;
    updatedAt: string;
    publishedAt?: string;
    viewCount: number;
    likeCount: number;
    commentCount: number;
  };
  settings: {
    isPublished: boolean;
    allowComments: boolean;
    isFeatured: boolean;
    visibility: 'public' | 'private' | 'unlisted';
  };
}

export interface Comment {
  id: number;
  postId: number;
  authorId: number;
  content: string;
  parentId?: number;
  metadata: {
    createdAt: string;
    updatedAt?: string;
    likeCount: number;
    reportCount: number;
  };
}

export interface AppState {
  users: {
    items: User[];
    loading: boolean;
    error?: string;
    filters: {
      search: string;
      role?: User['profile']['metadata']['role'];
      isVerified?: boolean;
    };
    pagination: {
      page: number;
      limit: number;
      total: number;
    };
  };
  posts: {
    items: Post[];
    loading: boolean;
    error?: string;
    filters: {
      search: string;
      tags: string[];
      authorId?: number;
      isPublished?: boolean;
    };
    sorting: {
      field: keyof Post['metadata'];
      direction: 'asc' | 'desc';
    };
  };
  comments: {
    items: Comment[];
    loading: boolean;
    error?: string;
    groupedByPost: Record<number, Comment[]>;
  };
  ui: {
    theme: 'light' | 'dark' | 'auto';
    sidebar: {
      isOpen: boolean;
      width: number;
    };
    modals: {
      userProfile?: { userId: number };
      postEditor?: { postId?: number };
      confirmDialog?: {
        title: string;
        message: string;
        onConfirm: () => void;
      };
    };
    notifications: {
      items: Array<{
        id: string;
        type: 'info' | 'success' | 'warning' | 'error';
        title: string;
        message: string;
        timestamp: string;
        isRead: boolean;
      }>;
      unreadCount: number;
    };
  };
  auth: {
    currentUser?: User;
    isAuthenticated: boolean;
    loading: boolean;
    permissions: string[];
    session: {
      token?: string;
      expiresAt?: string;
      refreshToken?: string;
    };
  };
}

// Test complex type inference - works with constraint-free SignalTree
export const complexAppTree = signalTree({
  users: {
    items: [] as User[],
    loading: false,
    filters: {
      search: '',
      role: undefined as ('admin' | 'user' | 'moderator') | undefined,
      isVerified: undefined as boolean | undefined,
    },
    pagination: {
      page: 1,
      limit: 20,
      total: 0,
    },
  },
  posts: {
    items: [] as Post[],
    loading: false,
    filters: {
      search: '',
      tags: [] as string[],
      authorId: undefined as number | undefined,
      isPublished: undefined as boolean | undefined,
    },
    sorting: {
      field: 'createdAt' as keyof Post,
      direction: 'desc' as 'asc' | 'desc',
    },
  },
  comments: {
    items: [] as Array<{
      id: number;
      postId: number;
      content: string;
      authorId: number;
      createdAt: string;
    }>,
    loading: false,
    groupedByPost: {} as Record<number, any[]>,
  },
  ui: {
    theme: 'auto' as 'light' | 'dark' | 'auto',
    sidebar: {
      isOpen: true,
      width: 280,
    },
    modals: {} as Record<string, boolean>,
    notifications: {
      items: [] as Array<{
        id: string;
        message: string;
        type: 'info' | 'warning' | 'error';
        isRead: boolean;
      }>,
      unreadCount: 0,
    },
  },
  auth: {
    currentUser: undefined as User | undefined,
    isAuthenticated: false,
    loading: false,
    permissions: [] as string[],
    session: {
      token: undefined as string | undefined,
      expiresAt: undefined as string | undefined,
      refreshToken: undefined as string | undefined,
    },
  },
}); // Direct SignalTree usage for flexible typing

// Test type inference for complex nested access
export function testTypeInference() {
  // These should all have proper type inference with the new flexible system
  const userItems = complexAppTree.$.users.items();
  const currentTheme = complexAppTree.$.ui.theme();
  const isAuthenticated = complexAppTree.$.auth.isAuthenticated();
  const notificationCount = complexAppTree.$.ui.notifications.unreadCount();

  // Simple updates to test type safety
  complexAppTree.$.users.items.set([
    {
      id: 1,
      name: 'John Doe',
      email: 'john@example.com',
      profile: {
        age: 30,
        preferences: {
          theme: 'dark',
          notifications: true,
          privacy: 'public',
          language: 'en',
        },
        social: {
          github: 'johndoe',
        },
        metadata: {
          lastLogin: new Date().toISOString(),
          joinedAt: new Date().toISOString(),
          isVerified: true,
          role: 'user',
        },
      },
    },
  ]);

  // Simple property updates
  complexAppTree.$.ui.sidebar.isOpen.set(false);
  complexAppTree.$.auth.currentUser.set(userItems[0]);

  return {
    userItems,
    currentTheme,
    isAuthenticated,
    notificationCount,
  };
}

// Simple computed value for testing TypeScript inference
export function createPostsComputation() {
  return () => {
    const state = complexAppTree();
    return state.posts.items
      .filter((post: Post) => post.settings.isPublished)
      .map((post: Post) => ({
        ...post,
        author: state.users.items.find(
          (user: User) => user.id === post.authorId
        ),
      }))
      .sort((a, b) => b.metadata.likeCount - a.metadata.likeCount);
  };
}

// Simple update function for testing batching behavior
export function testSimpleUpdates() {
  // Direct updates without complex middleware
  complexAppTree.$.users.loading.set(true);
  complexAppTree.$.posts.loading.set(true);
  complexAppTree.$.comments.loading.set(true);

  // Add a simple notification
  const currentNotifications = complexAppTree.$.ui.notifications.items();
  complexAppTree.$.ui.notifications.items.set([
    ...currentNotifications,
    {
      id: crypto.randomUUID(),
      type: 'info',
      title: 'Loading',
      message: 'Fetching latest data...',
      timestamp: new Date().toISOString(),
      isRead: false,
    },
  ]);

  const currentUnreadCount = complexAppTree.$.ui.notifications.unreadCount();
  complexAppTree.$.ui.notifications.unreadCount.set(currentUnreadCount + 1);
}

// Export for compilation testing
export type ComplexAppTreeType = typeof complexAppTree;
export type UserItemsType = ReturnType<typeof complexAppTree.$.users.items>;
export type ThemeType = ReturnType<typeof complexAppTree.$.ui.theme>;
