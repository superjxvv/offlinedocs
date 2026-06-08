---
baseline_commit: 46341a46c2a8e43b90ae2eeaf02bdef4875c0f79
---

# Story 3.2: In-Memory Search Index & Ranking Algorithm

Status: done

## Story

As an Offline Developer,
I want fast, relevance-ranked search across library documentation,
so that Claude Code returns the most useful doc sections for my queries.

## Acceptance Criteria

1. **Given** a loaded bundle with chunks from multiple libraries, **When** the in-memory inverted index is built at startup, **Then** it tokenizes content by splitting on whitespace + punctuation, lowercasing, and deduplicating per chunk.

2. **Given** indexed chunks, **When** I query "useEffect cleanup" against the React library, **Then** chunks with "useEffect" or "cleanup" in their frontmatter topics score 3 points per matching term.

3. **Given** indexed chunks, **When** a query term matches a chunk's frontmatter title, **Then** it scores 2 points per matching term.

4. **Given** indexed chunks, **When** a query term matches only in the markdown body text, **Then** it scores 1 point per matching term.

5. **Given** two chunks with equal total scores, **When** they are ranked, **Then** they maintain stable sort order (alphabetical by file path within the library).

6. **Given** a query containing the term "auth", **When** synonym expansion runs, **Then** the query also searches for "authentication" and "authorization" from the SYNONYM_MAP.

7. **Given** SEARCH_WEIGHTS, **When** I inspect the exported constant, **Then** it defines `{ topics: 3, title: 2, body: 1 }` in a single config object.

8. **Given** a query with maxTokens=5000 and 10 matching chunks, **When** chunks are assembled into the response, **Then** whole chunks are included in ranked order until the 5000-token budget is exhausted.

9. **Given** the highest-ranked chunk alone exceeds maxTokens, **When** it is the top result, **Then** it is returned anyway (top-chunk exception) with `truncated: true`.

10. **Given** the index build, **When** I measure startup time for ~1000 chunks, **Then** it completes within approximately 1 second (well within the 5-second startup budget).

## Tasks / Subtasks

- [x] Task 1: Implement inverted-index.ts (AC: #1, #10)
  - [x] Create `packages/server/src/search/inverted-index.ts`
  - [x] `buildIndex(chunks: LoadedChunk[]): SearchIndex` — builds in-memory inverted index
  - [x] Tokenize: split on `/[\s\p{P}]+/u`, lowercase, deduplicate per chunk
  - [x] Strip code blocks (`` ```...``` ``) and URLs from body before tokenizing
  - [x] Index three sources per chunk: topics (from frontmatter), title tokens, body tokens
  - [x] Store per-entry: chunkIndex, field source (topic/title/body)
  - [x] Store chunk metadata: libraryId, filename, title, topics, content, byteSize
  - [x] Log index build duration to stderr: `console.error('Search index built: N chunks in Xms')`
  - [x] Create `packages/server/src/search/inverted-index.test.ts`

- [x] Task 2: Implement ranking.ts (AC: #2, #3, #4, #5, #6, #8, #9)
  - [x] Create `packages/server/src/search/ranking.ts`
  - [x] `queryIndex(index: SearchIndex, libraryId: string, query: string, maxTokens?: number): QueryResult`
  - [x] Expand query terms via SYNONYM_MAP before lookup
  - [x] Score each chunk: topics match = 3pts, title match = 2pts, body match = 1pt per query term
  - [x] Sort by score descending; tie-break by filename alphabetically (stable sort)
  - [x] Assemble response: include whole chunks in ranked order until maxTokens budget (~4 chars/token) exhausted
  - [x] Top-chunk exception: if #1 chunk exceeds maxTokens, return it anyway with `truncated: true`
  - [x] Filter chunks to the specified libraryId
  - [x] Create `packages/server/src/search/ranking.test.ts`

- [x] Task 3: Create search barrel export (AC: #1-#10)
  - [x] Create `packages/server/src/search/index.ts` — barrel export for buildIndex, queryIndex, types
  - [x] Update `packages/server/src/index.ts` to re-export from `./search/index.js`

- [x] Task 4: Integrate search index into startup pipeline (AC: #10)
  - [x] Update `packages/server/src/startup.ts` — add `buildIndex(chunks)` after loadChunks
  - [x] Expand `StartupResult` to include `index: SearchIndex`
  - [x] Update `packages/server/src/startup.test.ts` to verify index is returned

## Dev Notes

### Architecture Reference

Per architecture doc, the search module lives at:
```
packages/server/src/search/
  index.ts                  # Barrel export
  inverted-index.ts         # Builds in-memory index from chunks
  inverted-index.test.ts    # Co-located unit test
  ranking.ts                # Weighted scoring, tie-breaking, token budget
  ranking.test.ts           # Co-located unit test
```

### Key Types

**Input — `LoadedChunk` (from chunk-loader.ts):**
```typescript
interface LoadedChunk {
  libraryId: string;   // e.g. "react"
  filename: string;    // e.g. "hooks.md"
  title: string;       // from frontmatter
  topics: string[];    // from frontmatter — primary search signal
  content: string;     // markdown body (frontmatter stripped)
  byteSize: number;    // full file size including frontmatter
}
```

**Output — `QueryResult` (new type to define):**
```typescript
interface QueryResult {
  chunks: ScoredChunk[];
  content: string;        // concatenated markdown of included chunks
  truncated: boolean;     // true if top chunk exceeded maxTokens
  tokenCount: number;     // approximate token count of response
}

interface ScoredChunk {
  title: string;
  file: string;           // filename within library
  score: number;
  byteSize: number;
}
```

**SearchIndex (new type to define):**
```typescript
interface SearchIndex {
  chunks: IndexedChunk[];                    // all chunks with metadata
  invertedIndex: Map<string, PostingEntry[]>; // token → postings
}

interface IndexedChunk {
  libraryId: string;
  filename: string;
  title: string;
  topics: string[];
  content: string;
  byteSize: number;
}

interface PostingEntry {
  chunkIndex: number;   // index into chunks array
  field: 'topics' | 'title' | 'body';
}
```

### Constants from @offlinedocs/shared — DO NOT DUPLICATE

```typescript
import { SEARCH_WEIGHTS, SYNONYM_MAP, DEFAULT_MAX_TOKENS } from '@offlinedocs/shared';

// SEARCH_WEIGHTS = { topics: 3, title: 2, body: 1 } as const
// DEFAULT_MAX_TOKENS = 5000
// SYNONYM_MAP = { auth: ['authentication', 'authorization'], config: ['configuration', 'setup'], db: ['database'] }
```

### Tokenization Algorithm

```typescript
function tokenize(text: string): string[] {
  return [...new Set(
    text.toLowerCase().split(/[\s\p{P}]+/u).filter(t => t.length > 0)
  )];
}
```

- Split on whitespace + Unicode punctuation
- Lowercase all tokens
- Deduplicate per chunk (use Set)
- Filter empty strings
- For body text: strip code blocks (regex: `` /```[\s\S]*?```/g ``) and URLs (`/https?:\/\/\S+/g`) BEFORE tokenizing

### Scoring Algorithm

```
For each query term (after synonym expansion):
  For each chunk in the target library:
    if term in chunk.topics tokens  → +SEARCH_WEIGHTS.topics (3)
    if term in chunk.title tokens   → +SEARCH_WEIGHTS.title  (2)
    if term in chunk.body tokens    → +SEARCH_WEIGHTS.body   (1)
```

- A single term can score across multiple fields (topics + title + body = 6 pts max per term)
- Scores sum across all query terms
- Tie-break: sort by filename alphabetically (stable sort)

### Token Budget Assembly

- Approximate tokens as `Math.ceil(byteSize / 4)` (~4 chars per token)
- Include whole chunks in ranked order until budget exhausted
- **Top-chunk exception:** if the highest-ranked chunk alone exceeds maxTokens, return it anyway with `truncated: true`
- `tokenCount` in response = approximate token count of assembled content
- Default maxTokens = `DEFAULT_MAX_TOKENS` (5000) from shared constants

### Synonym Expansion

At query time only:
```typescript
function expandQuery(terms: string[]): string[] {
  const expanded = new Set(terms);
  for (const term of terms) {
    const synonyms = SYNONYM_MAP[term];
    if (synonyms) {
      for (const syn of synonyms) expanded.add(syn);
    }
  }
  return [...expanded];
}
```

### Logging Contract — CRITICAL

Server stdout is **reserved exclusively for MCP stdio transport**. ALL diagnostic output MUST go to `stderr` only.

```typescript
// CORRECT
console.error(`Search index built: ${chunks.length} chunks in ${durationMs}ms`);

// WRONG — NEVER use console.log in server package
console.log('anything'); // ← corrupts MCP stdio channel
```

### Previous Story Learnings (from Story 3.1)

- Co-locate tests with source files (`.test.ts` next to `.ts`)
- Import from `@offlinedocs/shared` for schemas and constants
- Use `import type` for type-only imports
- `.js` extensions in all local imports
- Barrel export through `index.ts` files
- Use `vi.spyOn(console, 'error').mockImplementation(() => {})` for stderr assertions
- Path traversal guards when resolving paths from registry data (not needed here — search operates on in-memory data only)
- `beforeEach`/`afterEach` for test cleanup

### Testing Approach

- **inverted-index.test.ts**: Create `LoadedChunk[]` fixtures inline (no temp dirs needed — all in-memory)
  - Test tokenization: whitespace, punctuation, case-insensitive, dedup
  - Test code block and URL stripping from body
  - Test index structure: tokens map to correct chunks and fields
  - Test multiple libraries indexed together
  - Test performance: build index for ~1000 synthetic chunks in <1s

- **ranking.test.ts**: Build a small index, then query against it
  - Test scoring: topics=3, title=2, body=1
  - Test score accumulation across terms
  - Test tie-breaking: equal scores → alphabetical filename
  - Test synonym expansion: "auth" → also matches "authentication", "authorization"
  - Test token budget: maxTokens limits response size
  - Test top-chunk exception: single large chunk returned with truncated=true
  - Test library filtering: only returns chunks from specified library
  - Test empty query / no matches returns empty result

### Files to Create

- `packages/server/src/search/inverted-index.ts` (NEW)
- `packages/server/src/search/inverted-index.test.ts` (NEW)
- `packages/server/src/search/ranking.ts` (NEW)
- `packages/server/src/search/ranking.test.ts` (NEW)
- `packages/server/src/search/index.ts` (NEW)

### Files to Modify

- `packages/server/src/startup.ts` (UPDATE — integrate buildIndex)
- `packages/server/src/startup.test.ts` (UPDATE — verify index in StartupResult)
- `packages/server/src/index.ts` (UPDATE — re-export search barrel)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.2]
- [Source: _bmad-output/planning-artifacts/architecture.md#Search Index — Inverted Index]
- [Source: _bmad-output/planning-artifacts/architecture.md#Ranking Algorithm]
- [Source: _bmad-output/planning-artifacts/architecture.md#Token Budget]
- [Source: _bmad-output/planning-artifacts/architecture.md#Synonym Expansion]
- [Source: packages/shared/src/constants.ts — SEARCH_WEIGHTS, SYNONYM_MAP, DEFAULT_MAX_TOKENS]
- [Source: packages/server/src/chunk-loader.ts — LoadedChunk type]
- [Source: packages/server/src/startup.ts — StartupResult, startupBundle]

### Review Findings

- [x] [Review][Patch] `truncated` flag not set when token budget causes later chunks to be dropped [ranking.ts:125] — fixed: set `truncated = true` before `break`.
- [x] [Review][Patch] No test for empty index (0 chunks) [inverted-index.test.ts, ranking.test.ts] — added tests for both buildIndex([]) and queryIndex on empty index.

## Dev Agent Record

### Agent Model Used

Claude Opus 4

### Debug Log References

### Completion Notes List

- Implemented inverted index with tokenization (whitespace+punctuation split, lowercase, dedup)
- Body text preprocessing strips code blocks and URLs before indexing
- Weighted scoring: topics=3, title=2, body=1 per query term, with dedup per chunk+field
- Synonym expansion via SYNONYM_MAP at query time
- Token budget assembly with top-chunk exception (truncated=true)
- Stable sort: score desc, then filename alphabetical
- Integrated buildIndex into startup pipeline — StartupResult now includes SearchIndex
- Performance test: 1000 chunks indexed in <2s budget
- 26 new tests (11 inverted-index + 15 ranking), all passing
- Full monorepo: 218 tests passing, zero regressions

### File List

- packages/server/src/search/inverted-index.ts (NEW)
- packages/server/src/search/inverted-index.test.ts (NEW)
- packages/server/src/search/ranking.ts (NEW)
- packages/server/src/search/ranking.test.ts (NEW)
- packages/server/src/search/index.ts (NEW)
- packages/server/src/startup.ts (MODIFIED — added buildIndex, expanded StartupResult)
- packages/server/src/startup.test.ts (MODIFIED — verify index in result)
- packages/server/src/index.ts (MODIFIED — re-export search barrel)
