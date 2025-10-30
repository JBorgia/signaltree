export type Task = () => void;

const q: Task[] = [];

export function postTask(t: Task) {
  q.push(t);
  if (q.length === 1) flush();
}

async function flush() {
  while (q.length) {
    const t = q.shift()!;
    try { t(); } catch (e) { console.error('[EnterpriseScheduler]', e); }
    await Promise.resolve();
  }
}
