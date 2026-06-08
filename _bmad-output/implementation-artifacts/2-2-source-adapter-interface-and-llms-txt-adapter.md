---
baseline_commit: 46341a46c2a8e43b90ae2eeaf02bdef4875c0f79
---

# Story 2.2: Source Adapter Interface & llms.txt Adapter

Status: done

## Story

As a Fetcher operator,
I want to fetch documentation from llms.txt endpoints,
so that I can include libraries that publish their docs in the llms.txt format.

## Acceptance Criteria

1. **Given** the `SourceAdapter` interface in `adapters/types.ts`, **When** I inspect it, **Then** it declares `readonly sourceType`, `fetch(config: LibraryConfig): Promise<Result<FetchResult>>`, and `validate(result: FetchResult): ValidationResult`.

2. **Given** a valid llms.txt URL that returns documentation content, **When** I call the llms-txt adapter's `fetch()`, **Then** it returns `{ ok: true, data: { chunks: DocChunk[], metadata: { fetchedAt: string } } }`.

3. **Given** a URL that returns HTTP 404, **When** I call `fetch()`, **Then** it returns `{ ok: false, error: AdapterError }` with code `NETWORK`.

4. **Given** a URL that returns HTTP 429, **When** I call `fetch()`, **Then** it retries with exponential backoff (2 retries, RETRY_BASE_MS=1000ms, +/-200ms jitter) **And** returns err with code `RATE_LIMITED` if still failing after retries.

5. **Given** a URL that returns HTTP 200 but empty content, **When** I call `fetch()`, **Then** it returns err with code `EMPTY_RESPONSE`.

6. **Given** a successful fetch result, **When** I call `validate()`, **Then** it checks chunks are non-empty and returns `{ valid: boolean, errors: string[], warnings: string[] }`.

7. **Given** the adapter implementation, **When** I inspect its HTTP client, **Then** it uses Node.js built-in `fetch` (no external HTTP library).

## Tasks / Subtasks

- [x] Task 1: Create adapter type definitions (AC: #1)
  - [x] Create `packages/fetcher/src/adapters/types.ts`
  - [x] Define `DocChunk` interface: `{ content: string; title: string }`
  - [x] Define `FetchResult` interface: `{ chunks: DocChunk[]; metadata: { version?: string; fetchedAt: string } }`
  - [x] Define `ValidationResult` interface: `{ valid: boolean; errors: string[]; warnings: string[] }`
  - [x] Define `SourceAdapter` interface: `{ readonly sourceType: string; fetch(config: LibraryConfig): Promise<Result<FetchResult>>; validate(result: FetchResult): ValidationResult }`

- [x] Task 2: Create retry helper (AC: #4)
  - [x] Create `packages/fetcher/src/adapters/retry.ts`
  - [x] Implement `fetchWithRetry(url: string, maxRetries: number, libraryId: string): Promise<Result<Response>>`
  - [x] Exponential backoff: `RETRY_BASE_MS * 2^attempt + jitter` where jitter is `Math.random() * 400 - 200`
  - [x] Retry on HTTP 429 and network errors (fetch throws)
  - [x] Do NOT retry on 404, 401, 403 — return immediately
  - [x] Map final failure to appropriate AdapterErrorCode (RATE_LIMITED for 429, NETWORK for others, AUTH_REQUIRED for 401/403)
  - [x] Create `packages/fetcher/src/adapters/retry.test.ts` with tests

- [x] Task 3: Implement llms.txt adapter (AC: #2, #3, #4, #5, #6, #7)
  - [x] Create `packages/fetcher/src/adapters/llms-txt-adapter.ts`
  - [x] Implement `LlmsTxtAdapter` class implementing `SourceAdapter`
  - [x] `sourceType` = `"llms-txt"` (readonly)
  - [x] `fetch()`: GET `config.sourceUrl` via `fetchWithRetry()`, parse response text into DocChunk(s)
  - [x] `validate()`: check chunks array is non-empty and each chunk has content
  - [x] Create `packages/fetcher/src/adapters/llms-txt-adapter.test.ts`

- [x] Task 4: Create adapter barrel and update fetcher barrel (AC: #1)
  - [x] Create `packages/fetcher/src/adapters/index.ts` re-exporting types + LlmsTxtAdapter
  - [x] Update `packages/fetcher/src/index.ts` to export adapter types and LlmsTxtAdapter

### Review Findings

- [x] [Review][Patch] Consume response body on non-ok responses to prevent socket leak [retry.ts]
- [x] [Review][Patch] Wrap response.text() in try/catch for mid-stream failures [llms-txt-adapter.ts]
- [x] [Review][Defer] splitByTopLevelHeadings matches `# ` inside code blocks — deferred to chunk processor (Story 2.5)
- [x] [Review][Defer] No upper bound on response body size — deferred, operator-controlled URLs
- [x] [Review][Defer] Retry-After header from 429 responses ignored — deferred, not in ACs

## Dev Notes

### Architecture-Defined Interface Shapes

From architecture.md lines 326-341:

```typescript
// packages/fetcher/src/adapters/types.ts

interface SourceAdapter {
  readonly sourceType: "llms-txt" | "github" | "context7";
  fetch(library: LibraryConfig): Promise<Result<FetchResult>>;
  validate(result: FetchResult): ValidationResult;
}

interface FetchResult {
  chunks: DocChunk[];
  metadata: { version?: string; fetchedAt: string };
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
```

**DocChunk** is NOT defined in architecture as a Zod schema — it's a structural type for passing raw content between adapters and the chunk processor. Keep it simple:

```typescript
interface DocChunk {
  content: string;  // raw markdown body
  title: string;    // section title or filename
}
```

**Important:** DocChunk here is the adapter's output — raw content chunks. The chunk processor (Story 2.5) will later add frontmatter (title, library, topics). The adapter should NOT generate full Frontmatter objects — just provide content + title for each chunk.

### Adapter Fetch Pattern (from architecture lines 596-605)

```typescript
async fetch(config: LibraryConfig): Promise<Result<FetchResult>> {
  try {
    const response = await fetch(config.sourceUrl);
    if (!response.ok) return err(new AdapterError('NETWORK', config.id, `HTTP ${response.status}`));
    const data = await response.text();
    return ok({ chunks: splitIntoChunks(data), metadata: { fetchedAt: new Date().toISOString() } });
  } catch (e) {
    return err(new AdapterError('NETWORK', config.id, e.message, e));
  }
}
```

### Retry Strategy Parameters

From `@offlinedocs/shared` constants:
- `RETRY_BASE_MS = 1000` — base delay in ms
- `MAX_RETRIES_CDN = 2` — for llms.txt and GitHub adapters
- `MAX_RETRIES_API = 3` — for Context7 adapter
- **Jitter:** `Math.random() * 400 - 200` (±200ms)
- **Backoff formula:** `RETRY_BASE_MS * 2^attempt + jitter`
  - Attempt 0: ~1000ms ± 200ms
  - Attempt 1: ~2000ms ± 200ms

**Retry conditions:**
- HTTP 429 → retry, map to `RATE_LIMITED` if exhausted
- Network errors (fetch throws) → retry, map to `NETWORK` if exhausted
- HTTP 404 → do NOT retry, immediate `NETWORK` error
- HTTP 401/403 → do NOT retry, immediate `AUTH_REQUIRED` error

### llms.txt Parsing Approach

The llms.txt format is plain markdown text. The adapter does **minimal splitting**:
- Fetch the raw text via HTTP GET
- If response is empty → return `EMPTY_RESPONSE` error
- Return the full content as a single `DocChunk` (or split on `# ` top-level headings if multiple exist)
- The Chunk Processor (Story 2.5) handles real H2-level splitting and 50KB enforcement

### Import Pattern (must follow)

```typescript
// 1. Node.js built-ins (none needed for types.ts)
// 2. External deps (none)
// 3. Workspace packages
import { type LibraryConfig, AdapterError, type Result, ok, err, RETRY_BASE_MS, MAX_RETRIES_CDN } from '@offlinedocs/shared';
// 4. Local imports
import type { SourceAdapter, FetchResult, DocChunk, ValidationResult } from './types.js';
```

### Testing Strategy

**For retry helper** — mock `global.fetch` to simulate:
- Successful response
- 429 then success (retry works)
- Persistent 429 (exhausts retries)
- Network error (fetch throws)
- 404 (no retry)

**For llms.txt adapter** — mock `fetchWithRetry` or `global.fetch`:
- Valid content returns DocChunk[]
- HTTP 404 returns NETWORK error
- HTTP 429 triggers retries then RATE_LIMITED
- Empty content returns EMPTY_RESPONSE
- validate() with non-empty chunks returns valid
- validate() with empty chunks returns invalid

**Important test pattern from Story 2.1:**
- Use vitest `vi.fn()` and `vi.spyOn()` for mocking
- Verify `result.ok === true/false` then inspect `.data` or `.error`
- Co-located `.test.ts` files

### Files to Create

| File | Purpose |
|------|---------|
| `packages/fetcher/src/adapters/types.ts` | SourceAdapter, FetchResult, DocChunk, ValidationResult |
| `packages/fetcher/src/adapters/retry.ts` | fetchWithRetry() helper |
| `packages/fetcher/src/adapters/retry.test.ts` | Retry helper tests |
| `packages/fetcher/src/adapters/llms-txt-adapter.ts` | LlmsTxtAdapter class |
| `packages/fetcher/src/adapters/llms-txt-adapter.test.ts` | Adapter tests |
| `packages/fetcher/src/adapters/index.ts` | Barrel re-exports |

### Files to Modify

| File | Change |
|------|--------|
| `packages/fetcher/src/index.ts` | Add exports for adapter types and LlmsTxtAdapter |

### Previous Story Learnings (from 2.1)

- Use `.js` extension in all relative ESM imports
- AdapterError constructor: `new AdapterError(code, libraryId, message, cause?)`
- Result pattern: `ok(data)` / `err(new AdapterError(...))`
- Barrel exports chain: module → adapters/index.ts → src/index.ts
- Review found: temp dir cleanup should delete the dir, not just the file
- `@types/node` already added to fetcher devDependencies

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.2]
- [Source: _bmad-output/planning-artifacts/architecture.md#SourceAdapter Interface]
- [Source: _bmad-output/planning-artifacts/architecture.md#HTTP & Retry Strategy]
- [Source: _bmad-output/planning-artifacts/architecture.md#Result Pattern for Adapters]
- [Source: packages/shared/src/constants.ts — RETRY_BASE_MS, MAX_RETRIES_CDN]
- [Source: packages/shared/src/errors.ts — AdapterError]
- [Source: packages/shared/src/result.ts — Result, ok, err]

## Dev Agent Record

### Agent Model Used

Claude Opus 4 (via bmad-dev-story)

### Debug Log References

None — clean implementation.

### Completion Notes List

- Created SourceAdapter interface, DocChunk, FetchResult, ValidationResult types in adapters/types.ts
- Implemented reusable fetchWithRetry() with exponential backoff + jitter, retry on 429/network errors, no-retry on 404/401/403
- Implemented LlmsTxtAdapter class: fetches llms.txt URLs, splits by top-level headings, validates non-empty chunks
- 18 new tests (8 retry + 10 adapter) covering all 7 ACs
- Full suite: 66 tests pass, zero regressions
- Build succeeds for all packages

### Change Log

- 2026-05-26: Initial implementation of adapter interface and llms.txt adapter (Story 2.2)

### File List

- packages/fetcher/src/adapters/types.ts (NEW)
- packages/fetcher/src/adapters/retry.ts (NEW)
- packages/fetcher/src/adapters/retry.test.ts (NEW)
- packages/fetcher/src/adapters/llms-txt-adapter.ts (NEW)
- packages/fetcher/src/adapters/llms-txt-adapter.test.ts (NEW)
- packages/fetcher/src/adapters/index.ts (NEW)
- packages/fetcher/src/index.ts (MODIFIED — added adapter exports)
