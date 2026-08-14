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
  __listSubjectReclamationCandidates(): readonly number[];
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
      readonly kind: 'already-retired';
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
  if (prepared.retire.length === 0) {
    return {
      ok: false,
      kind: 'already-retired',
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

export interface ReclaimAvailableSubjectsOptions {
  readonly subjectIds: readonly number[];
  readonly owner: SubjectReclamationPhysicalOwner;
  readonly store: Pick<TurnStore, 'getTurns' | 'getPendingTurns'>;
  readonly appliedHistory: Pick<AppliedHistory, 'getAppliedTurnIds' | 'getRedoTurnIds'>;
}

export interface ReclaimAvailableSubjectsResult {
  readonly reclaimed: readonly number[];
  readonly alreadyRetired: readonly number[];
  readonly blocked: readonly {
    subjectId: number;
    blockers: readonly ReclamationEligibilityBlocker[];
  }[];
  readonly causalDrift: readonly {
    subjectId: number;
    blockers: readonly ReclamationEligibilityBlocker[];
  }[];
  readonly physicalDrift: readonly {
    subjectId: number;
    message: string;
  }[];
  readonly physicalPlanUnavailable: readonly number[];
}

export function reclaimAvailableSubjects(
  options: ReclaimAvailableSubjectsOptions
): ReclaimAvailableSubjectsResult {
  const reclaimed: number[] = [];
  const alreadyRetired: number[] = [];
  const blocked: {
    subjectId: number;
    blockers: readonly ReclamationEligibilityBlocker[];
  }[] = [];
  const causalDrift: {
    subjectId: number;
    blockers: readonly ReclamationEligibilityBlocker[];
  }[] = [];
  const physicalDrift: {
    subjectId: number;
    message: string;
  }[] = [];
  const physicalPlanUnavailable: number[] = [];

  for (const subjectId of options.subjectIds) {
    const result = reclaimSubject({
      subjectId,
      owner: options.owner,
      store: options.store,
      appliedHistory: options.appliedHistory,
    });

    if (result.ok) {
      reclaimed.push(subjectId);
      continue;
    }

    switch (result.kind) {
      case 'already-retired':
        alreadyRetired.push(subjectId);
        break;
      case 'blocked':
        blocked.push({ subjectId, blockers: result.blockers });
        break;
      case 'causal-drift':
        causalDrift.push({ subjectId, blockers: result.blockers });
        break;
      case 'physical-drift':
        physicalDrift.push({ subjectId, message: result.message });
        break;
      case 'physical-plan-unavailable':
        physicalPlanUnavailable.push(subjectId);
        break;
    }
  }

  return {
    reclaimed,
    alreadyRetired,
    blocked,
    causalDrift,
    physicalDrift,
    physicalPlanUnavailable,
  };
}

export interface RunPhysicalMaintenanceOptions {
  readonly owner: SubjectReclamationPhysicalOwner;
  readonly store: Pick<TurnStore, 'getTurns' | 'getPendingTurns'>;
  readonly appliedHistory: Pick<AppliedHistory, 'getAppliedTurnIds' | 'getRedoTurnIds'>;
}

export interface RunPhysicalMaintenanceResult extends ReclaimAvailableSubjectsResult {
  readonly candidateSubjectIds: readonly number[];
}

export function runPhysicalMaintenance(
  options: RunPhysicalMaintenanceOptions
): RunPhysicalMaintenanceResult {
  const candidateSubjectIds = options.owner.__listSubjectReclamationCandidates();
  const results = reclaimAvailableSubjects({
    subjectIds: candidateSubjectIds,
    owner: options.owner,
    store: options.store,
    appliedHistory: options.appliedHistory,
  });

  return {
    candidateSubjectIds,
    ...results,
  };
}
