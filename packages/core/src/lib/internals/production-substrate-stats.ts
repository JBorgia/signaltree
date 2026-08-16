export interface ProductionSubstrateStats {
  slotReads: number;
  slotWrites: number;
  equalityChecks: number;
  revisionIncrements: number;
  positionResolutions: number;
  publicationDependencyReads: number;
  publications: number;
  treeVisits: number;
  projectionRebuilds: number;
  projectionEntriesVisited: number;
  projectionReplacements: number;
  projectionAppends: number;
  projectionRemovals: number;
  projectionRekeys: number;
  structuralActiveKeyLookups: number;
  structuralActiveKeyEntriesVisited: number;
  structuralSubjectsCreated: number;
  structuralSubjectTransfers: number;
  structuralSubjectTombstones: number;
  valueStoreWrites: number;
}

type CounterName = keyof ProductionSubstrateStats;

export const PRODUCTION_SUBSTRATE_STATS_ENABLED = true;

let activeStats: ProductionSubstrateStats | undefined;

export function installProductionSubstrateStatsForTesting(): ProductionSubstrateStats {
  const stats = createProductionSubstrateStats();
  activeStats = stats;
  return stats;
}

export function clearProductionSubstrateStatsForTesting(): void {
  activeStats = undefined;
}

export function resetProductionSubstrateStatsForTesting(
  stats: ProductionSubstrateStats
): ProductionSubstrateStats {
  stats.slotReads = 0;
  stats.slotWrites = 0;
  stats.equalityChecks = 0;
  stats.revisionIncrements = 0;
  stats.positionResolutions = 0;
  stats.publicationDependencyReads = 0;
  stats.publications = 0;
  stats.treeVisits = 0;
  stats.projectionRebuilds = 0;
  stats.projectionEntriesVisited = 0;
  stats.projectionReplacements = 0;
  stats.projectionAppends = 0;
  stats.projectionRemovals = 0;
  stats.projectionRekeys = 0;
  stats.structuralActiveKeyLookups = 0;
  stats.structuralActiveKeyEntriesVisited = 0;
  stats.structuralSubjectsCreated = 0;
  stats.structuralSubjectTransfers = 0;
  stats.structuralSubjectTombstones = 0;
  stats.valueStoreWrites = 0;
  return stats;
}

export function recordProductionSubstrateStat(
  counter: CounterName,
  delta = 1
): void {
  if (!activeStats) {
    return;
  }

  activeStats[counter] += delta;
}

function createProductionSubstrateStats(): ProductionSubstrateStats {
  return {
    slotReads: 0,
    slotWrites: 0,
    equalityChecks: 0,
    revisionIncrements: 0,
    positionResolutions: 0,
    publicationDependencyReads: 0,
    publications: 0,
    treeVisits: 0,
    projectionRebuilds: 0,
    projectionEntriesVisited: 0,
    projectionReplacements: 0,
    projectionAppends: 0,
    projectionRemovals: 0,
    projectionRekeys: 0,
    structuralActiveKeyLookups: 0,
    structuralActiveKeyEntriesVisited: 0,
    structuralSubjectsCreated: 0,
    structuralSubjectTransfers: 0,
    structuralSubjectTombstones: 0,
    valueStoreWrites: 0,
  };
}
