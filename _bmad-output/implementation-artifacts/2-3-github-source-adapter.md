# Story 2.3: GitHub Source Adapter

Status: done
baseline_commit: 46341a46c2a8e43b90ae2eeaf02bdef4875c0f79

## Story

As a Fetcher operator,
I want to fetch documentation from GitHub repository markdown folders,
so that I can include libraries that maintain their docs on GitHub.

## Acceptance Criteria

1. **Given** a config entry pointing to a public repo docs/ folder, **When** I call the github adapter's `fetch()`, **Then** it returns ok with `DocChunk[]` containing all markdown files from that folder.

2. **Given** a public repo, **When** the adapter fetches content, **Then** it uses `raw.githubusercontent.com` URLs (no auth, no API rate limits).

3. **Given** a private repo or rate-limited response and `GITHUB_TOKEN` is set in the environment, **When** I call `fetch()`, **Then** it falls back to the GitHub REST API with the token for authentication.

4. **Given** no `GITHUB_TOKEN` and a 403 response from raw URLs, **When** I call `fetch()`, **Then** it returns err with code `AUTH_REQUIRED`.

5. **Given** a repo where the configured docs path doesn't exist, **When** I call `fetch()`, **Then** it returns err with code `FORMAT_CHANGED`.

6. **Given** a successful fetch, **When** I call `validate()`, **Then** all chunks have non-empty content.

7. **Given** the adapter, **When** it encounters transient failures, **Then** it retries with 2 retries, exponential backoff, and +/-200ms jitter.

## Tasks / Subtasks

- [x] Task 1: Implement GitHub URL parser (AC: #1, #2)
  - [x] Create URL parsing function to extract `owner`, `repo`, `branch`, `path` from GitHub URLs
  - [x] Handle common URL formats: `/tree/branch/path`, `/blob/branch/path`, and plain `owner/repo/path`

- [x] Task 2: Implement GitHubAdapter class (AC: #1-#7)
  - [x] Create `packages/fetcher/src/adapters/github-adapter.ts`
  - [x] Implement `GitHubAdapter` class implementing `SourceAdapter` with `sourceType = "github"`
  - [x] List directory via GitHub Contents API
  - [x] Filter for `.md` files from directory listing
  - [x] Fetch each markdown file content via `raw.githubusercontent.com`
  - [x] On 403 from raw URL: check `process.env.GITHUB_TOKEN`, fallback to REST API
  - [x] On 403 with no token: return `err` with `AUTH_REQUIRED`
  - [x] On 404 from directory listing: return `err` with `FORMAT_CHANGED`
  - [x] Use retry logic with `MAX_RETRIES_CDN`
  - [x] Return `DocChunk[]` with one chunk per markdown file
  - [x] Implement `validate()` checking all chunks have non-empty content

- [x] Task 3: Write tests (AC: #1-#7)
  - [x] Create `packages/fetcher/src/adapters/github-adapter.test.ts`
  - [x] Test: public repo returns DocChunks for all markdown files
  - [x] Test: uses raw.githubusercontent.com URLs for public repos
  - [x] Test: falls back to API with GITHUB_TOKEN on 403
  - [x] Test: returns AUTH_REQUIRED when no token and 403
  - [x] Test: returns FORMAT_CHANGED when docs path doesn't exist (404)
  - [x] Test: validate() confirms non-empty chunks

- [x] Task 4: Update barrel exports
  - [x] Add `GitHubAdapter` to `packages/fetcher/src/adapters/index.ts`
  - [x] Add `GitHubAdapter` to `packages/fetcher/src/index.ts`

### Review Findings

- [x] [Review][Patch] URL path components not encoded — owner/repo/branch/path interpolated raw into URLs [github-adapter.ts:97,124,155]
- [x] [Review][Patch] SSRF: download_url from API response used as fetch target with auth headers, no domain validation [github-adapter.ts:140]
- [x] [Review][Patch] 404-to-FORMAT_CHANGED detection relies on fragile string matching (message.includes('404')) [github-adapter.ts:121]
- [x] [Review][Patch] fetchWithHeaders returns NETWORK for 429 after retries — spec says RATE_LIMITED [github-adapter.ts:230]
- [x] [Review][Patch] GitHub API entries not validated for required fields — name/path/type crash if missing [github-adapter.ts:131]
- [x] [Review][Patch] Dead mockFetchSequence call in test — created then immediately overridden [github-adapter.test.ts:78]
- [x] [Review][Defer] Sequential file fetching with fail-fast on single file error — deferred, design trade-off
- [x] [Review][Defer] fetchWithHeaders duplicates fetchWithRetry retry logic — deferred, needed for custom headers
- [x] [Review][Defer] No recursive subdirectory traversal — deferred, out of story scope
- [x] [Review][Defer] GITHUB_TOKEN read from process.env in two places — deferred, minor design smell
- [x] [Review][Defer] Non-GitHub URLs parsed silently as GitHub repos — deferred, config responsibility

## Dev Notes

### GitHub URL Parsing

Parse `sourceUrl` like `https://github.com/expressjs/express/tree/main/docs`:
- Extract: `owner=expressjs`, `repo=express`, `branch=main`, `path=docs`
- URL pattern: `github.com/{owner}/{repo}/tree/{branch}/{path}`
- Also handle: `github.com/{owner}/{repo}` (root, default branch `main`)

### Two-Tier Fetch Strategy

1. **Directory listing** — Always via GitHub Contents API (raw.githubusercontent.com has no directory listing):
   `GET https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={branch}`
   Response: JSON array of `{ name, path, type, download_url }` objects. Filter for `type === "file"` and `.md` extension.

2. **File content** — Primary via raw URLs (no auth, no rate limits):
   `GET https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{file_path}`
   On 403: fallback to REST API with `GITHUB_TOKEN` if available.

### GITHUB_TOKEN Handling

- Read from `process.env.GITHUB_TOKEN`
- When set, add to requests: `{ headers: { Authorization: 'Bearer ${token}' } }`
- Always use token for API directory listing if available (avoids 60 req/hr unauthenticated limit)
- On 403 from raw URLs with no token: return `AUTH_REQUIRED`

### Error Mapping

| Scenario | Error Code |
|----------|-----------|
| 403 from raw + no GITHUB_TOKEN | AUTH_REQUIRED |
| 404 on directory listing (path doesn't exist) | FORMAT_CHANGED |
| Network failures / rate limits | Via fetchWithRetry → NETWORK / RATE_LIMITED |
| Empty markdown files | Caught by validate() |

### Retry Strategy

Uses existing `fetchWithRetry()` with `MAX_RETRIES_CDN = 2`. Already handles exponential backoff + jitter.

### Pattern Reference (from llms-txt-adapter.ts)

```typescript
import { AdapterError, type LibraryConfig, type Result, ok, err, MAX_RETRIES_CDN } from '@offlinedocs/shared';
import type { SourceAdapter, FetchResult, DocChunk, ValidationResult } from './types.js';
import { fetchWithRetry } from './retry.js';
```

- Class implements `SourceAdapter`
- `fetch()` returns `Promise<Result<FetchResult>>` — never throws
- `validate()` checks chunks non-empty
- Wrap `response.text()` / `response.json()` in try/catch (lesson from 2.2 review)
- Consume response body on errors (`response.body?.cancel()`) to prevent socket leaks

### Testing Strategy

- Mock `globalThis.fetch` to simulate GitHub API responses
- Mock `process.env.GITHUB_TOKEN` for token fallback tests
- Use JSON fixtures for GitHub Contents API responses
- Verify URL construction (raw vs API URLs)

### Files to Create

- `packages/fetcher/src/adapters/github-adapter.ts` (NEW)
- `packages/fetcher/src/adapters/github-adapter.test.ts` (NEW)

### Files to Modify

- `packages/fetcher/src/adapters/index.ts` — add GitHubAdapter export
- `packages/fetcher/src/index.ts` — add GitHubAdapter export

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.3]
- [Source: _bmad-output/planning-artifacts/architecture.md#GitHub approach]
- [Source: packages/fetcher/src/adapters/llms-txt-adapter.ts — pattern reference]
- [Source: packages/fetcher/src/adapters/retry.ts — reusable retry helper]

## Dev Agent Record

### Agent Model Used

Claude Opus 4

### Debug Log References

None.

### Completion Notes List

- Implemented GitHubAdapter with two-tier fetch: API listing + raw content URLs
- URL parser handles /tree/, /blob/, and plain owner/repo formats
- GITHUB_TOKEN fallback: 403 from raw → retry via API with Bearer auth
- Error mapping: 404→FORMAT_CHANGED, 403 no token→AUTH_REQUIRED
- Custom fetchWithHeaders() for authenticated API calls with retry
- Response body consumed on errors, body reads wrapped in try/catch
- 13 tests: URL parsing (5), adapter behavior (6), validate (2)
- 79 total tests pass, zero regressions

### Change Log

- 2026-05-26: Implemented GitHub source adapter (Story 2.3)
- 2026-05-26: Applied 6 code review patches (BMAD review)

### File List

- packages/fetcher/src/adapters/github-adapter.ts (NEW)
- packages/fetcher/src/adapters/github-adapter.test.ts (NEW)
- packages/fetcher/src/adapters/index.ts (MODIFIED)
- packages/fetcher/src/index.ts (MODIFIED)
