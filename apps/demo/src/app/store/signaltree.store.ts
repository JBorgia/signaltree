import { signalTree } from '@signaltree/core';

export const counterTree = signalTree({ counter: { count: 0 } });
