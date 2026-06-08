import type { Registry } from '@offlinedocs/shared';
import { DEFAULT_MAX_TOKENS, STALE_THRESHOLD_DAYS } from '@offlinedocs/shared';

import type { SearchIndex } from '../search/index.js';
import { queryIndex } from '../search/index.js';

export interface QueryDocsResponse {
  content: string;
  chunks: { title: string; file: string; score: number; byteSize: number }[];
  truncated: boolean;
  tokenCount: number;
  libraryId: string;
  query: string;
}

export interface QueryDocsError {
  error: string;
  code: 'LIBRARY_NOT_FOUND';
  availableLibraries: { id: string; name: string }[];
}

export interface QueryDocsOptions {
  maxTokens?: number;
  staleThresholdDays?: number;
}

/**
 * Query documentation for a specific library. Includes fallback chain
 * and staleness warnings.
 */
export function queryDocs(
  registry: Registry,
  index: SearchIndex,
  libraryId: string,
  query: string,
  options: QueryDocsOptions = {},
): QueryDocsResponse | QueryDocsError {
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const staleThresholdDays = options.staleThresholdDays ?? STALE_THRESHOLD_DAYS;

  // Validate libraryId exists in registry
  const library = registry.libraries.find((lib) => lib.id === libraryId);
  if (!library) {
    return {
      error: `Library not found: ${libraryId}`,
      code: 'LIBRARY_NOT_FOUND',
      availableLibraries: registry.libraries.map((lib) => ({
        id: lib.id,
        name: lib.name,
      })),
    };
  }

  // Query the search index
  const result = queryIndex(index, libraryId, query, maxTokens);

  let content = result.content;
  let { chunks, truncated, tokenCount } = result;

  // Fallback chain when no matches
  if (chunks.length === 0) {
    truncated = false;
    // 1. Look for getting-started.md chunk
    const gettingStartedChunk = index.chunks.find(
      (c) => c.libraryId === libraryId && c.filename === 'getting-started.md',
    );
    if (gettingStartedChunk) {
      content = gettingStartedChunk.content;
      chunks = [
        {
          title: gettingStartedChunk.title,
          file: gettingStartedChunk.filename,
          score: 0,
          byteSize: gettingStartedChunk.byteSize,
        },
      ];
      tokenCount = Math.ceil(gettingStartedChunk.byteSize / 4);
    } else {
      // 2. Return library description as minimal context
      content = library.description;
      tokenCount = Math.ceil(Buffer.byteLength(library.description, 'utf8') / 4);
    }
  }

  // Staleness check
  const stalenessWarning = checkStaleness(
    library.lastFetched,
    staleThresholdDays,
  );
  if (stalenessWarning) {
    content = stalenessWarning + content;
  }

  return {
    content,
    chunks,
    truncated,
    tokenCount,
    libraryId,
    query,
  };
}

function checkStaleness(
  lastFetched: string,
  thresholdDays: number,
): string | null {
  const fetchedDate = new Date(lastFetched);
  const now = new Date();
  const daysSince = Math.floor(
    (now.getTime() - fetchedDate.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (daysSince > thresholdDays) {
    return `> ⚠️ These docs were fetched ${daysSince} days ago and may be outdated.\n\n`;
  }
  return null;
}
