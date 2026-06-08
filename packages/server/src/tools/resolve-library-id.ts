import type { Registry } from '@offlinedocs/shared';

export interface ResolveSuccess {
  id: string;
  name: string;
  description: string;
  version?: string;
  lastFetched: string;
}

export interface ResolveError {
  error: string;
  code: 'LIBRARY_NOT_FOUND';
  availableLibraries: { id: string; name: string }[];
}

/**
 * Resolve a library by name from the registry.
 * Uses case-insensitive matching with exact → partial fallback.
 */
export function resolveLibraryId(
  registry: Registry,
  name: string,
): ResolveSuccess | ResolveError {
  const query = name.toLowerCase();
  const libraries = registry.libraries;

  // 1. Exact match on id
  const exactIdMatch = libraries.find((lib) => lib.id.toLowerCase() === query);
  if (exactIdMatch) {
    return toSuccess(exactIdMatch);
  }

  // 2. Exact match on name
  const exactNameMatch = libraries.find(
    (lib) => lib.name.toLowerCase() === query,
  );
  if (exactNameMatch) {
    return toSuccess(exactNameMatch);
  }

  // 3. Partial match on id or name
  const partialMatches = libraries.filter(
    (lib) =>
      lib.id.toLowerCase().includes(query) ||
      lib.name.toLowerCase().includes(query),
  );

  if (partialMatches.length > 0) {
    // Prefer shortest name (closest match)
    const best = partialMatches.sort(
      (a, b) => a.name.length - b.name.length,
    )[0]!;
    return toSuccess(best);
  }

  // No match
  return {
    error: `Library not found: ${name}`,
    code: 'LIBRARY_NOT_FOUND',
    availableLibraries: libraries.map((lib) => ({ id: lib.id, name: lib.name })),
  };
}

function toSuccess(
  lib: Registry['libraries'][number],
): ResolveSuccess {
  const result: ResolveSuccess = {
    id: lib.id,
    name: lib.name,
    description: lib.description,
    lastFetched: lib.lastFetched,
  };
  if (lib.version !== undefined) {
    result.version = lib.version;
  }
  return result;
}
