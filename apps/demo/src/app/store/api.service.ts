import { Injectable } from '@angular/core';
import { delay, Observable, of } from 'rxjs';

import { Post, User } from './types';

/**
 * Mock API service.
 *
 * Stands in for HTTP calls so the demo runs offline. Production code would
 * inject a real HttpClient-backed service here — the ops layer wouldn't change.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  getUsers$(): Observable<User[]> {
    return of(SEED_USERS).pipe(delay(300));
  }

  getPosts$(): Observable<Post[]> {
    return of(SEED_POSTS).pipe(delay(300));
  }

  getPostsForUser$(userId: number): Observable<Post[]> {
    return of(SEED_POSTS.filter((p) => p.authorId === userId)).pipe(delay(300));
  }

  publishPost$(postId: number): Observable<Post> {
    const post = SEED_POSTS.find((p) => p.id === postId);
    if (!post) throw new Error(`Post ${postId} not found`);
    return of({ ...post, published: true }).pipe(delay(200));
  }
}

const SEED_USERS: User[] = [
  { id: 1, name: 'Alice Admin', email: 'alice@example.com', role: 'admin' },
  { id: 2, name: 'Bob User', email: 'bob@example.com', role: 'user' },
  { id: 3, name: 'Carol Mod', email: 'carol@example.com', role: 'moderator' },
];

const SEED_POSTS: Post[] = [
  {
    id: 101,
    title: 'Welcome Post',
    content: 'Welcome to our platform!',
    authorId: 1,
    published: true,
    likes: 25,
    createdAt: new Date('2025-01-15'),
  },
  {
    id: 102,
    title: 'Getting Started',
    content: "Here's how to get started with the canonical store pattern.",
    authorId: 1,
    published: true,
    likes: 15,
    createdAt: new Date('2025-02-01'),
  },
  {
    id: 201,
    title: 'My First Post',
    content: 'Hello world!',
    authorId: 2,
    published: false,
    likes: 3,
    createdAt: new Date('2025-03-12'),
  },
  {
    id: 301,
    title: 'Moderation Notes',
    content: 'Best practices for community moderation.',
    authorId: 3,
    published: true,
    likes: 8,
    createdAt: new Date('2025-03-20'),
  },
];
