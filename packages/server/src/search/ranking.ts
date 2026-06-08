import { SEARCH_WEIGHTS, SYNONYM_MAP, DEFAULT_MAX_TOKENS } from '@offlinedocs/shared';

import type { SearchIndex, PostingEntry } from './inverted-index.js';
import { tokenize } from './inverted-index.js';

export interface ScoredChunk {
  title: string;
  file: string;
  score: number;
  byteSize: number;
}

export interface QueryResult {
  chunks: ScoredChunk[];
  content: string;
  truncated: boolean;
  tokenCount: number;
}

/**
 * Expand query terms using the synonym map.
 */
function expandQuery(terms: string[]): string[] {
  const expanded = new Set(terms);
  for (const term of terms) {
    const synonyms = SYNONYM_MAP[term];
    if (synonyms) {
      for (const syn of synonyms) {
        expanded.add(syn);
      }
    }
  }
  return [...expanded];
}

/**
 * Estimate token count from byte size (~4 chars per token).
 */
function estimateTokens(byteSize: number): number {
  return Math.ceil(byteSize / 4);
}

const FIELD_WEIGHTS: Record<PostingEntry['field'], number> = {
  topics: SEARCH_WEIGHTS.topics,
  title: SEARCH_WEIGHTS.title,
  body: SEARCH_WEIGHTS.body,
};

/**
 * Query the search index for a specific library, returning ranked and
 * token-budgeted results.
 */
export function queryIndex(
  index: SearchIndex,
  libraryId: string,
  query: string,
  maxTokens: number = DEFAULT_MAX_TOKENS,
): QueryResult {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) {
    return { chunks: [], content: '', truncated: false, tokenCount: 0 };
  }

  const expandedTerms = expandQuery(queryTerms);

  // Score each chunk in the target library
  // Use a Map to accumulate scores: chunkIndex → score
  const scores = new Map<number, number>();

  for (const term of expandedTerms) {
    const postings = index.invertedIndex.get(term);
    if (!postings) continue;

    // Deduplicate per chunk+field: a term should only score once per field per chunk
    const seen = new Set<string>();
    for (const posting of postings) {
      const chunk = index.chunks[posting.chunkIndex]!;
      if (chunk.libraryId !== libraryId) continue;

      const key = `${posting.chunkIndex}:${posting.field}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const current = scores.get(posting.chunkIndex) ?? 0;
      scores.set(posting.chunkIndex, current + FIELD_WEIGHTS[posting.field]);
    }
  }

  // Sort by score descending, then by filename alphabetically for tie-breaking
  const ranked = [...scores.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      const filenameA = index.chunks[a[0]]!.filename;
      const filenameB = index.chunks[b[0]]!.filename;
      return filenameA.localeCompare(filenameB);
    });

  // Assemble response within token budget
  const resultChunks: ScoredChunk[] = [];
  const contentParts: string[] = [];
  let totalTokens = 0;
  let truncated = false;

  for (const [chunkIndex, score] of ranked) {
    const chunk = index.chunks[chunkIndex]!;
    const chunkTokens = estimateTokens(chunk.byteSize);

    // Top-chunk exception: always include the first chunk
    if (resultChunks.length === 0) {
      if (chunkTokens > maxTokens) {
        truncated = true;
      }
      resultChunks.push({
        title: chunk.title,
        file: chunk.filename,
        score,
        byteSize: chunk.byteSize,
      });
      contentParts.push(chunk.content);
      totalTokens += chunkTokens;
      continue;
    }

    // For subsequent chunks, check budget
    if (totalTokens + chunkTokens > maxTokens) {
      truncated = true;
      break;
    }

    resultChunks.push({
      title: chunk.title,
      file: chunk.filename,
      score,
      byteSize: chunk.byteSize,
    });
    contentParts.push(chunk.content);
    totalTokens += chunkTokens;
  }

  return {
    chunks: resultChunks,
    content: contentParts.join('\n\n'),
    truncated,
    tokenCount: totalTokens,
  };
}
