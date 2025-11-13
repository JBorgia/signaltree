/**
 * Utility to get library versions for benchmark tracking
 * Reads from package.json files in node_modules
 */

export interface LibraryVersionInfo {
  [libraryId: string]: string;
}

// Map library IDs to their npm package names
const PACKAGE_NAME_MAP: Record<string, string> = {
  signaltree: '@signaltree/core',
  'ngrx-store': '@ngrx/store',
  'ngrx-signals': '@ngrx/signals',
  akita: '@datorama/akita',
  elf: '@ngneat/elf',
  ngxs: '@ngxs/store',
};

/**
 * Get library versions synchronously
 * Attempts to read from window.__LIBRARY_VERSIONS__ (set at build time)
 * or tries to fetch from package.json files
 */
export function getLibraryVersionsSync(
  libraryIds: string[]
): LibraryVersionInfo {
  const versions: LibraryVersionInfo = {};

  // First, try to get from window (populated at build time)
  const windowWithVersions = window as unknown as {
    __LIBRARY_VERSIONS__?: LibraryVersionInfo;
  };

  if (windowWithVersions.__LIBRARY_VERSIONS__) {
    libraryIds.forEach((id) => {
      versions[id] =
        windowWithVersions.__LIBRARY_VERSIONS__?.[id] || 'unknown';
    });
    return versions;
  }

  // Fallback: try to read from package.json files via fetch
  // This works if package.json files are accessible
  libraryIds.forEach((id) => {
    versions[id] = 'unknown';
  });

  return versions;
}

/**
 * Get library versions asynchronously
 * Attempts to fetch from package.json files
 */
export async function getLibraryVersions(
  libraryIds: string[]
): Promise<LibraryVersionInfo> {
  const versions: LibraryVersionInfo = {};

  // First try sync version (from window)
  const syncVersions = getLibraryVersionsSync(libraryIds);
  if (Object.values(syncVersions).some((v) => v !== 'unknown')) {
    return syncVersions;
  }

  // Try to fetch from package.json files
  const fetchPromises = libraryIds.map(async (libraryId) => {
    const packageName = PACKAGE_NAME_MAP[libraryId] || libraryId;
    
    try {
      // Try to fetch from node_modules (won't work in browser, but try anyway)
      // In a real implementation, versions should be injected at build time
      const response = await fetch(`/node_modules/${packageName}/package.json`);
      if (response.ok) {
        const pkg = await response.json();
        return { libraryId, version: pkg.version || 'unknown' };
      }
    } catch {
      // Ignore errors
    }
    
    return { libraryId, version: 'unknown' };
  });

  const results = await Promise.all(fetchPromises);
  results.forEach(({ libraryId, version }) => {
    versions[libraryId] = version;
  });

  return versions;
}

