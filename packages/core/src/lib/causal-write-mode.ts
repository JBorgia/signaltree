import type { CausalWriteMode, UpdateMetadata } from './types';

export const getCausalWriteMode = (
  meta?: Pick<UpdateMetadata, 'causalMode'> | undefined
): CausalWriteMode => meta?.causalMode ?? 'authoring';
