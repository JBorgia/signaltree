import { isTraversableNode } from '../utils';

export const MUTATION_CAPTURE_RUNTIME = Symbol.for(
  'SignalTree:MutationCaptureRuntime'
);

export interface MutationCaptureRuntime {
  isCaptureActive(): boolean;
  activateCapture(): () => void;
}

export function createMutationCaptureRuntime(): MutationCaptureRuntime {
  let activeCount = 0;

  return {
    isCaptureActive(): boolean {
      return activeCount > 0;
    },
    activateCapture(): () => void {
      activeCount += 1;
      let released = false;

      return () => {
        if (released) {
          return;
        }

        released = true;
        activeCount = Math.max(0, activeCount - 1);
      };
    },
  };
}

export function getMutationCaptureRuntime(
  node: unknown
): MutationCaptureRuntime | undefined {
  if (!isTraversableNode(node)) {
    return undefined;
  }

  return (node as Record<symbol, MutationCaptureRuntime | undefined>)[
    MUTATION_CAPTURE_RUNTIME
  ];
}
