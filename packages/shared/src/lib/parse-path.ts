import { DEFAULT_PATH_CACHE_SIZE } from './constants';
import { LRUCache } from './lru-cache';

const pathCache = new LRUCache<string, string[]>(DEFAULT_PATH_CACHE_SIZE);

export function parsePath(path: string): string[] {
  const cached = pathCache.get(path);
  if (cached) return cached;

  const segments = path.split('.');
  pathCache.set(path, segments);
  return segments;
}

export function clearParsePathCache(): void {
  pathCache.clear();
}

export function setParsePathCacheSize(size: number): void {
  pathCache.resize(size);
}

export function getParsePathCacheSize(): number {
  return pathCache.size();
}
