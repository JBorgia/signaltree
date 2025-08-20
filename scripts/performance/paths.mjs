// Centralized path helpers for performance benchmark & size artifacts
import path from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

const ROOT = process.cwd();
const PERF_ROOT = path.join(ROOT, 'performance');

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------------- Micro (variance) benchmarks ----------------
export function microLatestPath(engine = 'angular') {
  return path.join(PERF_ROOT, 'results/micro', engine, 'latest.json');
}
export function microBaselinePath(engine = 'angular') {
  return path.join(PERF_ROOT, 'baselines/micro', engine, 'baseline.json');
}
export function microBaselineWriteTargets(engine = 'angular') {
  return { organized: microBaselinePath(engine) };
}

// ---------------- Macro (aggregate run-benchmark) -------------
export function macroResultsDir() {
  return ensureDir(path.join(PERF_ROOT, 'results/macro'));
}
export function macroLatestPath() {
  return path.join(macroResultsDir(), 'latest.json');
}
export function macroMedianPath() {
  return path.join(macroResultsDir(), 'median.json');
}
export function macroHistoryDir() {
  return ensureDir(path.join(PERF_ROOT, 'history/macro'));
}
export function macroBaselinePath() {
  return path.join(PERF_ROOT, 'baselines/macro', 'baseline.json');
}

// ---------------- Size snapshots ------------------------------
export function sizeResultsDir() {
  return ensureDir(path.join(PERF_ROOT, 'results/size'));
}
export function sizeLatestPath() {
  return path.join(sizeResultsDir(), 'latest.json');
}
export function sizeBaselinePath() {
  return path.join(PERF_ROOT, 'baselines/size', 'baseline.json');
}

// ---------------- Generic helpers -----------------------------
export function ensurePerformanceDirs() {
  // Pre-create common directories so scripts can assume existence
  ensureDir(path.join(PERF_ROOT, 'results/micro/angular'));
  ensureDir(path.join(PERF_ROOT, 'results/micro/vanilla'));
  ensureDir(path.join(PERF_ROOT, 'baselines/micro/angular'));
  ensureDir(path.join(PERF_ROOT, 'baselines/micro/vanilla'));
  ensureDir(path.join(PERF_ROOT, 'baselines/macro'));
  ensureDir(path.join(PERF_ROOT, 'baselines/size'));
  ensureDir(path.join(PERF_ROOT, 'results/size'));
  ensureDir(path.join(PERF_ROOT, 'results/macro'));
  ensureDir(path.join(PERF_ROOT, 'history/macro'));
}
