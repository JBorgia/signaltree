export interface Todo {
  id: number;
  title: string;
  completed: boolean;
  createdAt: Date;
  priority?: 'low' | 'medium' | 'high';
}

export interface User {
  id: number;
  name: string;
  email: string;
  avatar?: string;
}

export interface Post {
  id: number;
  title: string;
  content: string;
  authorId: number;
  tags: string[];
  likes: number;
  createdAt: Date;
}

export interface ApiResponse<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

// Utility functions for generating test data
export function generateTodos(count: number, seed = 42): Todo[] {
  let s = seed >>> 0;
  const rnd = () => (s = (1664525 * s + 1013904223) >>> 0) / 2 ** 32;

  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    title: `Todo task ${i + 1}`,
    completed: rnd() > 0.7,
    createdAt: new Date(
      Date.now() - Math.floor(rnd() * 30 * 24 * 60 * 60 * 1000)
    ),
  }));
}

export function generateUsers(count: number, seed = 123): User[] {
  let s = seed >>> 0;
  const rnd = () => (s = (1664525 * s + 1013904223) >>> 0) / 2 ** 32;

  const firstNames = [
    'Alice',
    'Bob',
    'Carol',
    'David',
    'Eve',
    'Frank',
    'Grace',
    'Henry',
    'Ivy',
    'Jack',
  ];
  const lastNames = [
    'Smith',
    'Johnson',
    'Williams',
    'Brown',
    'Jones',
    'Garcia',
    'Miller',
    'Davis',
    'Rodriguez',
    'Martinez',
  ];

  return Array.from({ length: count }, (_, i) => {
    const firstName = firstNames[Math.floor(rnd() * firstNames.length)];
    const lastName = lastNames[Math.floor(rnd() * lastNames.length)];
    return {
      id: i + 1,
      name: `${firstName} ${lastName}`,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${firstName}${lastName}`,
    };
  });
}

export function generatePosts(
  count: number,
  userCount: number,
  seed = 456
): Post[] {
  let s = seed >>> 0;
  const rnd = () => (s = (1664525 * s + 1013904223) >>> 0) / 2 ** 32;

  const postTitles = [
    'Understanding Angular Signals',
    'State Management Best Practices',
    'Performance Optimization Tips',
    'Modern Web Development',
    'TypeScript Advanced Features',
    'Reactive Programming Patterns',
    'Component Architecture',
    'Testing Strategies',
    'DevOps for Frontend',
    'User Experience Design',
  ];

  const tags = [
    'angular',
    'typescript',
    'javascript',
    'webdev',
    'frontend',
    'performance',
    'testing',
    'ux',
    'patterns',
    'tips',
  ];

  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    title: postTitles[Math.floor(rnd() * postTitles.length)] + ` ${i + 1}`,
    content: `This is the content for post ${
      i + 1
    }. Lorem ipsum dolor sit amet, consectetur adipiscing elit.`,
    authorId: Math.floor(rnd() * userCount) + 1,
    tags: Array.from(
      { length: Math.floor(rnd() * 3) + 1 },
      () => tags[Math.floor(rnd() * tags.length)]
    ),
    likes: Math.floor(rnd() * 100),
    createdAt: new Date(
      Date.now() - Math.floor(rnd() * 7 * 24 * 60 * 60 * 1000)
    ),
  }));
}

// Performance testing utilities
export function measureTime<T>(label: string, fn: () => T): T {
  const result = fn();
  return result;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
