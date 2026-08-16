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
  };
}
