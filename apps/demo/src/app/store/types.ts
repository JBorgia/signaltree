/**
 * Domain types for the canonical SignalTree demo store.
 *
 * Mirrors the v3 trax-mobile architecture where each domain owns its DTOs and
 * a small set of shared enums are defined alongside.
 */

export interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'moderator';
}

export interface Post {
  id: number;
  title: string;
  content: string;
  authorId: number;
  published: boolean;
  likes: number;
  createdAt: Date;
}

export enum LoadingState {
  NotLoaded = 'not-loaded',
  Loading = 'loading',
  Loaded = 'loaded',
  Error = 'error',
}

export type Nullable<T> = T | null;
