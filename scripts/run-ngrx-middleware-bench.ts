import 'zone.js/dist/zone-node';

import { NgRxBenchmarkService } from '../apps/demo/src/app/pages/realistic-comparison/benchmark-orchestrator/services/ngrx-benchmark.service';

(async function main() {
  const svc = new NgRxBenchmarkService();
  console.log('Running NgRx single middleware (headless)...');
  const single = await svc.runSingleMiddlewareBenchmark(1000);
  console.log('Single median ms:', single);

  console.log('Running NgRx multiple middleware (headless)...');
  const multiple = await svc.runMultipleMiddlewareBenchmark(5, 1000);
  console.log('Multiple median ms:', multiple);

  console.log('Running NgRx conditional middleware (headless)...');
  const conditional = await svc.runConditionalMiddlewareBenchmark(1000);
  console.log('Conditional median ms:', conditional);
})();
