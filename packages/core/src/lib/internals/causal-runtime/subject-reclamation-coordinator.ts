import type {
  EntitySubjectReclamationResource,
  EntitySubjectReclamationPlanningOptions,
  PreparedEntitySubjectReclamation,
} from '../../entity-signal';

import type { AppliedHistory } from './applied-history';
import {
  assessReclamationEligibility,
  type ReclamationEligibilityBlocker,
} from './reclamation-eligibility';
import type { TurnStore } from './turn-store';

export interface SubjectReclamationPhysicalOwner {
  __prepareSubjectReclamation(
    subjectId: number,
    options: EntitySubjectReclamationPlanningOptions
  ): PreparedEntitySubjectReclamation | undefined;
  __applyPreparedSubjectReclamation(
    prepared: PreparedEntitySubjectReclamation
  ): void;
}

export interface ReclaimSubjectOptions {
  readonly subjectId: number;
  readonly owner: SubjectReclamationPhysicalOwner;
  readonly store: Pick<TurnStore, 'getTurns' | 'getPendingTurns'>;
  readonly appliedHistory: Pick<AppliedHistory, 'getAppliedTurnIds' | 'getRedoTurnIds'>;
}

export type ReclaimSubjectResult =
  | {
      readonly ok: false;
      readonly kind: 'blocked';
      readonly blockers: readonly ReclamationEligibilityBlocker[];
    }
  | {
      readonly ok: false;
      readonly kind: 'physical-plan-unavailable';
    }
  | {
      readonly ok: false;
      readonly kind: 'causal-drift';
      readonly blockers: readonly ReclamationEligibilityBlocker[];
    }
  | {
      readonly ok: false;
      readonly kind: 'physical-drift';
      readonly message: string;
    }
  | {
      readonly ok: true;
      readonly kind: 'reclaimed';
      readonly retired: readonly EntitySubjectReclamationResource[];
    };

export function reclaimSubject(
  options: ReclaimSubjectOptions
): ReclaimSubjectResult {
  const initialAssessment = assessReclamationEligibility({
    subjectId: options.subjectId,
    store: options.store,
    appliedHistory: options.appliedHistory,
  });
  if (!initialAssessment.eligible) {
    return {
      ok: false,
      kind: 'blocked',
      blockers: initialAssessment.blockers,
    };
  }

  const prepared = options.owner.__prepareSubjectReclamation(options.subjectId, {
    causallyEligible: true,
  });
  if (!prepared) {
    return {
      ok: false,
      kind: 'physical-plan-unavailable',
    };
  }

  const finalAssessment = assessReclamationEligibility({
    subjectId: options.subjectId,
    store: options.store,
    appliedHistory: options.appliedHistory,
  });
  if (!finalAssessment.eligible) {
    return {
      ok: false,
      kind: 'causal-drift',
      blockers: finalAssessment.blockers,
    };
  }

  try {
    options.owner.__applyPreparedSubjectReclamation(prepared);
  } catch (error) {
    return {
      ok: false,
      kind: 'physical-drift',
      message: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    ok: true,
    kind: 'reclaimed',
    retired: prepared.retire,
  };
}