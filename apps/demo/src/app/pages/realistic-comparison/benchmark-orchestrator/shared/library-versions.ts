/**
 * Utility to get library versions for benchmark tracking.
 *
 * In the demo, versions are injected at build time into
 * `window.__LIBRARY_VERSIONS__` (see apps/demo/src/main.ts).
 */

export interface LibraryVersionInfo {
  [libraryId: string]: string;
}

/**
 * Get library versions synchronously
 * Attempts to read from window.__LIBRARY_VERSIONS__ (set at build time)
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

  // Fallback: unknown (browser builds cannot read node_modules/package.json)
  libraryIds.forEach((id) => {
    versions[id] = 'unknown';
  });

  return versions;
}

/**
 * Get library versions asynchronously.
 *
 * Kept async for API compatibility with existing benchmark code.
 * In the browser demo, this resolves from injected window data.
 */
export async function getLibraryVersions(
  libraryIds: string[]
): Promise<LibraryVersionInfo> {
  return getLibraryVersionsSync(libraryIds);
}

