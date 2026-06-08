# Story 2.4: Context7 Source Adapter

Status: done
baseline_commit: 46341a46c2a8e43b90ae2eeaf02bdef4875c0f79

## Story

As a Fetcher operator,
I want to fetch documentation from Context7's API for initial seeding,
so that I can bootstrap my Doc Bundle with comprehensive library docs.

## Acceptance Criteria

1. **Given** a config entry with sourceType "context7" and a valid library ID, **When** I call the context7 adapter's `fetch()`, **Then** it returns ok with `DocChunk[]` parsed from the API response.

2. **Given** an invalid or non-existent Context7 library ID, **When** I call `fetch()`, **Then** it returns err with code `FORMAT_CHANGED`.

3. **Given** a network timeout or connection failure, **When** I call `fetch()`, **Then** it retries 3 times (`MAX_RETRIES_API`) with exponential backoff and +/-200ms jitter, **And** returns err with code `NETWORK` if still failing.

4. **Given** a successful fetch result, **When** I call `validate()`, **Then** all chunks contain valid markdown content.

5. **Given** the adapter implementation, **When** I inspect its HTTP client, **Then** it uses Node.js built-in fetch.

## Tasks / Subtasks

- [x] Task 1: Implement Context7Adapter class (AC: #1-#5)
  - [x] Create `packages/fetcher/src/adapters/context7-adapter.ts`
  - [x] Implement `Context7Adapter` class implementing `SourceAdapter` with `sourceType = "context7"`
  - [x] Resolve library by calling Context7 resolve endpoint
  - [x] Fetch docs via Context7 query-docs endpoint
  - [x] Parse response into `DocChunk[]`
  - [x] On invalid library ID (not found): return `err` with `FORMAT_CHANGED`
  - [x] On network failures: use `fetchWithRetry` with `MAX_RETRIES_API = 3`
  - [x] Implement `validate()` checking all chunks have non-empty content

- [x] Task 2: Write tests (AC: #1-#5)
  - [x] Create `packages/fetcher/src/adapters/context7-adapter.test.ts`
  - [x] Test: valid library ID returns DocChunks
  - [x] Test: invalid/non-existent library ID returns FORMAT_CHANGED
  - [x] Test: network failure retries 3 times then returns NETWORK
  - [x] Test: validate() confirms non-empty chunks
  - [x] Test: empty response returns EMPTY_RESPONSE

- [x] Task 3: Update barrel exports
  - [x] Add `Context7Adapter` to `packages/fetcher/src/adapters/index.ts`
  - [x] Add `Context7Adapter` to `packages/fetcher/src/index.ts`

### Review Findings

- [x] [Review][Patch] Remove unreachable dead code: defensive 404 check on response.status after fetchWithRetry success path [context7-adapter.ts:32-38]
- [x] [Review][Patch] vi.useFakeTimers() not cleaned up on test failure — move to afterEach [context7-adapter.test.ts:92,157]
- [x] [Review][Defer] 404 detection relies on fragile string matching in error message — deferred, pre-existing design in retry.ts shared by github-adapter
- [x] [Review][Defer] splitByTopLevelHeadings duplicated from llms-txt-adapter — deferred, Story 2.5 chunk processor will centralize splitting
- [x] [Review][Defer] No URL encoding/sanitization of sourceUrl in URL construction — deferred, config is trusted input per FR-4
- [x] [Review][Defer] validate() doesn't check MAX_CHUNK_SIZE — deferred, consistent with other adapters; Story 2.5 handles size enforcement

## Dev Notes

### Context7 API Endpoints

Context7 exposes two MCP tools that are also accessible as HTTP endpoints:

1. **resolve-library-id**: Resolves a library name to an ID
   - The `sourceUrl` in the TOML config IS the library ID (e.g., `/vercel/next.js`)
   - No resolution step needed since the config already provides the ID

2. **get-library-docs** (or equivalent): Fetches documentation for a library ID
   - The adapter should fetch docs using the Context7 API
   - Base URL: `https://context7.com/api` (verify at implementation time)
   - The response contains documentation content that needs to be split into DocChunks

### API Integration Strategy

Since Context7 is a public API:
- No authentication required
- Use `MAX_RETRIES_API = 3` (not CDN retries of 2) since this is an API source
- The `sourceUrl` field in LibraryConfig contains the Context7 library ID (e.g., `/vercel/next.js`)
- Fetch the full library docs content and split into DocChunks by section headings

### Retry Strategy

Use the existing `fetchWithRetry()` from `./retry.ts` with `MAX_RETRIES_API = 3`. This already handles:
- Exponential backoff with `RETRY_BASE_MS = 1000`
- +/-200ms jitter
- 429 -> RATE_LIMITED, 401/403 -> AUTH_REQUIRED, other errors -> NETWORK

### Error Mapping

| Scenario | Error Code |
|----------|-----------|
| Library ID not found / invalid response | FORMAT_CHANGED |
| Network failures after retries | NETWORK |
| Rate limited (429) after retries | RATE_LIMITED |
| Empty response body | EMPTY_RESPONSE |

### Pattern Reference (from existing adapters)

Follow the exact same pattern as `llms-txt-adapter.ts`:

```typescript
import { AdapterError, type LibraryConfig, type Result, ok, err, MAX_RETRIES_API } from '@offlinedocs/shared';
import type { SourceAdapter, FetchResult, DocChunk, ValidationResult } from './types.js';
import { fetchWithRetry } from './retry.js';
```

Key patterns from Story 2.2 and 2.3:
- Class implements `SourceAdapter`
- `fetch()` returns `Promise<Result<FetchResult>>` -- never throws
- `validate()` checks chunks are non-empty
- Wrap `response.text()` / `response.json()` in try/catch
- Consume response body on errors (`response.body?.cancel()`) to prevent socket leaks
- Use `fetchWithRetry` for HTTP calls -- do NOT re-implement retry logic

### Splitting Fetched Content

The response from Context7 will be markdown content. Split it into DocChunks using top-level headings (same approach as `LlmsTxtAdapter.splitByTopLevelHeadings`). Each `DocChunk` needs:
- `title`: extracted from the heading
- `content`: the full section content including the heading

### Testing Strategy

- Mock `globalThis.fetch` to simulate Context7 API responses
- Create mock responses with markdown content containing multiple sections
- Test error scenarios: 404 (FORMAT_CHANGED), network errors, empty responses
- Follow the test pattern from `llms-txt-adapter.test.ts`

### Previous Story Learnings (from 2.2 and 2.3)

- Always wrap `response.text()` and `response.json()` in try/catch
- Consume response body on errors to prevent socket leaks
- Don't duplicate retry logic -- use `fetchWithRetry` from `./retry.ts`
- Review findings from 2.3: validate API response fields before accessing them

### Files to Create

- `packages/fetcher/src/adapters/context7-adapter.ts` (NEW)
- `packages/fetcher/src/adapters/context7-adapter.test.ts` (NEW)

### Files to Modify

- `packages/fetcher/src/adapters/index.ts` -- add Context7Adapter export
- `packages/fetcher/src/index.ts` -- add Context7Adapter export

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.4]
- [Source: _bmad-output/planning-artifacts/architecture.md#Source Adapter Architecture]
- [Source: packages/fetcher/src/adapters/llms-txt-adapter.ts -- pattern reference]
- [Source: packages/fetcher/src/adapters/retry.ts -- reusable retry helper]
- [Source: packages/fetcher/src/adapters/types.ts -- SourceAdapter interface]

## Dev Agent Record

### Agent Model Used

Claude Opus 4

### Debug Log References

None.

### Completion Notes List

- Implemented Context7Adapter fetching docs via `https://context7.com/{libraryId}/llms-ctx.txt`
- sourceUrl from TOML config used as library ID (e.g., `/vercel/next.js`)
- Reuses `fetchWithRetry` with `MAX_RETRIES_API = 3` for retry logic
- Error mapping: 404->FORMAT_CHANGED, empty->EMPTY_RESPONSE, network->NETWORK, 429->RATE_LIMITED
- Response body read wrapped in try/catch per learnings from Story 2.2/2.3
- Content split into DocChunks by top-level headings (same pattern as LlmsTxtAdapter)
- 13 tests: adapter behavior (10), validate (3) — all passing
- 92 total tests pass, zero regressions

### Change Log

- 2026-05-26: Implemented Context7 source adapter (Story 2.4)
- 2026-05-26: Applied 2 code review patches (BMAD review)

### File List

- packages/fetcher/src/adapters/context7-adapter.ts (NEW)
- packages/fetcher/src/adapters/context7-adapter.test.ts (NEW)
- packages/fetcher/src/adapters/index.ts (MODIFIED)
- packages/fetcher/src/index.ts (MODIFIED)
