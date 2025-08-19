import { signal } from '../adapter';
import type { AsyncActionConfig, AsyncAction, SignalTree } from '../types';

export function createAsyncActionFeature<T>(
  tree: SignalTree<T>,
  config: { debugMode?: boolean }
) {
  return <TInput, TResult>(
    operation: (input: TInput, abortSignal?: AbortSignal) => Promise<TResult>,
    asyncConfig: AsyncActionConfig<T, TResult> = {}
  ): AsyncAction<TInput, TResult> => {
    const pending = signal(false);
    const errorSig = signal<Error | null>(null);
    const resultSig = signal<TResult | null>(null);
    const policy = asyncConfig.concurrencyPolicy || 'replace';
    let controller: AbortController | null = null;
    let currentRun = 0;
    let currentPromise: Promise<TResult> | null = null;
    let raceSettled = false;
    const queue: Array<{
      input: TInput;
      resolve: (v: TResult) => void;
      reject: (e: unknown) => void;
    }> = [];

    const start = (input: TInput): Promise<TResult> => {
      if (asyncConfig.enableCancellation && policy === 'replace') {
        controller?.abort();
      }
      if (asyncConfig.enableCancellation) {
        controller = new AbortController();
      }
      const runId = ++currentRun;
      errorSig.set(null);
      pending.set(true);
      if (policy === 'race') raceSettled = false;
      if (asyncConfig.onStart) {
        try {
          const patch = asyncConfig.onStart(tree.unwrap());
          if (patch)
            tree.update(() => patch as Partial<T>, {
              label: asyncConfig.label
                ? `${asyncConfig.label}:onStart`
                : 'async:onStart',
            });
        } catch (e) {
          if (config.debugMode) console.warn('[SignalTree] onStart error', e);
        }
      }
      const p = operation(input, controller?.signal)
        .then((value) => {
          if (policy !== 'race' && runId !== currentRun) return value;
          if (policy !== 'race' || !raceSettled) {
            resultSig.set(value);
            if (policy === 'race') raceSettled = true;
            if (asyncConfig.onSuccess) {
              try {
                const patch = asyncConfig.onSuccess(value, tree.unwrap());
                if (patch)
                  tree.update(() => patch as Partial<T>, {
                    label: asyncConfig.label
                      ? `${asyncConfig.label}:onSuccess`
                      : 'async:onSuccess',
                  });
              } catch (e) {
                if (config.debugMode)
                  console.warn('[SignalTree] onSuccess error', e);
              }
            }
          }
          return value;
        })
        .catch((err) => {
          if (
            (policy === 'race' || runId === currentRun) &&
            (policy !== 'race' || !raceSettled)
          ) {
            if (policy === 'race') raceSettled = true;
            errorSig.set(err as Error);
            if (asyncConfig.onError) {
              try {
                const patch = asyncConfig.onError(err as Error, tree.unwrap());
                if (patch)
                  tree.update(() => patch as Partial<T>, {
                    label: asyncConfig.label
                      ? `${asyncConfig.label}:onError`
                      : 'async:onError',
                  });
              } catch (e) {
                if (config.debugMode)
                  console.warn('[SignalTree] onError error', e);
              }
            }
          }
          throw err;
        })
        .finally(() => {
          if (policy === 'race' || runId === currentRun) {
            pending.set(false);
            if (asyncConfig.onComplete) {
              try {
                const patch = asyncConfig.onComplete(tree.unwrap());
                if (patch)
                  tree.update(() => patch as Partial<T>, {
                    label: asyncConfig.label
                      ? `${asyncConfig.label}:onComplete`
                      : 'async:onComplete',
                  });
              } catch (e) {
                if (config.debugMode)
                  console.warn('[SignalTree] onComplete error', e);
              }
            }
            if (policy === 'queue' && queue.length > 0) {
              const next = queue.shift();
              if (next) doExecute(next.input).then(next.resolve, next.reject);
            }
          }
        });
      currentPromise = p;
      return p;
    };

    const doExecute = (input: TInput): Promise<TResult> => {
      switch (policy) {
        case 'drop':
          if (pending()) return currentPromise as Promise<TResult>;
          return start(input);
        case 'queue':
          if (pending())
            return new Promise<TResult>((resolve, reject) =>
              queue.push({ input, resolve, reject })
            );
          return start(input);
        case 'race':
          if (!pending()) {
            return start(input);
          }
          return start(input);
        case 'replace':
        default:
          return start(input);
      }
    };

    return {
      execute: doExecute,
      pending,
      error: errorSig,
      result: resultSig,
      cancel: () => {
        if (asyncConfig.enableCancellation && controller) {
          controller.abort();
          if (config.debugMode)
            console.log('[SignalTree] asyncAction cancelled');
        }
      },
    };
  };
}
