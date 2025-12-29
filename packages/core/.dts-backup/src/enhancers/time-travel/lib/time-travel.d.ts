import type { SignalTreeBase as SignalTree } from '../../../lib/types';
export interface TimeTravelEntry<T> {
  state: T;
  timestamp: number;
  action: string;
  payload?: unknown;
}
export interface TimeTravelInterface<T> {
  undo(): boolean;
  redo(): boolean;
  getHistory(): TimeTravelEntry<T>[];
  resetHistory(): void;
  jumpTo(index: number): boolean;
  getCurrentIndex(): number;
  canUndo(): boolean;
  canRedo(): boolean;
}
export interface TimeTravelConfig {
  maxHistorySize?: number;
  includePayload?: boolean;
  actionNames?: {
    update?: string;
    set?: string;
    batch?: string;
    [key: string]: string | undefined;
  };
}
export declare function withTimeTravel<T>(config?: TimeTravelConfig): (
  tree: SignalTree<T>
) => SignalTree<T> & {
  __timeTravel: TimeTravelInterface<T>;
};
export declare function enableTimeTravel<T>(maxHistorySize?: number): (
  tree: SignalTree<T>
) => SignalTree<T> & {
  __timeTravel: TimeTravelInterface<T>;
};
export declare function getTimeTravel<T>(
  tree: SignalTree<T> & {
    __timeTravel?: TimeTravelInterface<T>;
  }
): TimeTravelInterface<T> | undefined;
