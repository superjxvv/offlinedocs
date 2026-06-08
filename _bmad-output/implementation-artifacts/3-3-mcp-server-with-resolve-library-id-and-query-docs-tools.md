---
baseline_commit: 46341a46c2a8e43b90ae2eeaf02bdef4875c0f79
---

# Story 3.3: MCP Server with resolve-library-id & query-docs Tools

Status: done

## Story

As an Offline Developer,
I want Claude Code to resolve libraries and query their docs through MCP tools,
so that I get current library documentation answers without internet access.

## Acceptance Criteria

1. **Given** the MCP Server started with `--bundle /path/to/docs`, **When** it initializes, **Then** it registers `resolve-library-id` and `query-docs` tools via stdio transport using @modelcontextprotocol/sdk.

2. **Given** resolve-library-id called with name "react", **When** the library exists in the registry, **Then** it returns `{ id, name, description, version?, lastFetched }` matching the ResolveSuccess shape.

3. **Given** resolve-library-id called with name "next", **When** the registry contains "Next.js", **Then** it matches via partial, case-insensitive comparison and returns the Next.js entry.

4. **Given** resolve-library-id called with a name that doesn't match any library, **When** the tool responds, **Then** it returns `{ error, code: "LIBRARY_NOT_FOUND", availableLibraries: [{ id, name }...] }`.

5. **Given** query-docs called with libraryId "react" and query "hooks", **When** matching chunks exist, **Then** it returns `{ content, chunks: [{ title, file, score, byteSize }...], truncated, tokenCount, libraryId, query }`.

6. **Given** query-docs called with a query that matches no chunks, **When** a getting-started.md chunk exists for the library, **Then** it returns the getting-started chunk as fallback.

7. **Given** query-docs called with a query that matches no chunks and no getting-started exists, **When** the library has a description in the registry, **Then** it returns the library description as minimal context.

8. **Given** query-docs called with a libraryId not in the bundle, **When** the tool responds, **Then** it returns `{ error, code: "LIBRARY_NOT_FOUND", availableLibraries: [{ id, name }...] }`.

9. **Given** a library with lastFetched older than 30 days (default STALE_THRESHOLD_DAYS), **When** query-docs is called for that library, **Then** the response content is prepended with `> ⚠️ These docs were fetched {N} days ago and may be outdated.\n\n` **And** the actual documentation content still follows (warning annotates, never blocks).

10. **Given** the server started with `--stale-threshold-days 14`, **When** a library was fetched 20 days ago, **Then** the staleness warning appears in the response.

11. **Given** the MCP Server is running, **When** all diagnostic logging occurs, **Then** it goes to stderr only (stdout is reserved exclusively for MCP stdio JSON-RPC transport).

## Tasks / Subtasks

- [x] Task 1: Implement resolve-library-id tool handler (AC: #2, #3, #4)
  - [x] Create `packages/server/src/tools/resolve-library-id.ts`
  - [x] `resolveLibraryId(registry: Registry, name: string): ResolveSuccess | ResolveError`
  - [x] Partial, case-insensitive matching: lowercase both sides, check `id.includes(query)` or `name.toLowerCase().includes(query)`
  - [x] Multiple matches: return best match (shortest name length as proxy for closest match)
  - [x] No match: return `{ error: "Library not found: {name}", code: "LIBRARY_NOT_FOUND", availableLibraries }` with all `{ id, name }` pairs
  - [x] Success: return `{ id, name, description, version?, lastFetched }` from the matching library entry
  - [x] Create `packages/server/src/tools/resolve-library-id.test.ts`

- [x] Task 2: Implement query-docs tool handler (AC: #5, #6, #7, #8, #9, #10)
  - [x] Create `packages/server/src/tools/query-docs.ts`
  - [x] `queryDocs(registry: Registry, index: SearchIndex, libraryId: string, query: string, options: { maxTokens?: number, staleThresholdDays?: number }): QueryDocsResponse | QueryDocsError`
  - [x] Validate libraryId exists in registry; if not, return LIBRARY_NOT_FOUND error with availableLibraries
  - [x] Call `queryIndex(index, libraryId, query, maxTokens)` from search module
  - [x] Fallback chain when no matches: (1) look for chunk with filename matching `getting-started.md`, (2) return library description from registry
  - [x] Staleness check: compute days since `lastFetched`, if > `staleThresholdDays` prepend `> ⚠️ These docs were fetched {N} days ago and may be outdated.\n\n` to content
  - [x] Return full QueryDocsResponse shape: `{ content, chunks, truncated, tokenCount, libraryId, query }`
  - [x] Create `packages/server/src/tools/query-docs.test.ts`

- [x] Task 3: Implement MCP server with stdio transport (AC: #1, #11)
  - [x] Create `packages/server/src/mcp-server.ts`
  - [x] Use `@modelcontextprotocol/sdk` — `McpServer` class with `StdioServerTransport`
  - [x] Register `resolve-library-id` tool with input schema `{ name: string }`
  - [x] Register `query-docs` tool with input schema `{ libraryId: string, query: string, maxTokens?: number }`
  - [x] Tool handlers wrap resolve/query functions with try/catch, return MCP error on unexpected exceptions
  - [x] `createMcpServer(startupResult: StartupResult, options: { staleThresholdDays?: number }): McpServer`
  - [x] Create `packages/server/src/mcp-server.test.ts`

- [x] Task 4: Implement CLI entrypoint (AC: #1, #10, #11)
  - [x] Update `packages/server/src/cli.ts` — replace stub with full implementation
  - [x] Parse args: `--bundle <path>` (required), `--skip-integrity` (optional), `--stale-threshold-days <number>` (optional, default 30)
  - [x] Call `startupBundle(bundlePath, { skipIntegrity })` — on failure, `console.error(error)` + `process.exit(1)`
  - [x] Call `createMcpServer(startupResult, { staleThresholdDays })` and connect stdio transport
  - [x] All logging to stderr only — zero console.log usage

- [x] Task 5: Update barrel exports and tools barrel (AC: #1-#11)
  - [x] Create `packages/server/src/tools/index.ts` — barrel export for resolveLibraryId, queryDocs
  - [x] Update `packages/server/src/index.ts` — add exports for tools and mcp-server

## Dev Notes

### Architecture Reference

Per architecture doc, the tools and MCP server live at:
```
packages/server/src/
  cli.ts                        # CLI entrypoint (UPDATE — replace stub)
  mcp-server.ts                 # MCP server setup, tool registration (NEW)
  mcp-server.test.ts            # Unit test (NEW)
  tools/
    index.ts                    # Barrel export (NEW)
    resolve-library-id.ts       # resolve-library-id handler (NEW)
    resolve-library-id.test.ts  # Co-located test (NEW)
    query-docs.ts               # query-docs handler (NEW)
    query-docs.test.ts          # Co-located test (NEW)
```

### MCP SDK Usage — @modelcontextprotocol/sdk@^1.29.0

The SDK provides `McpServer` and `StdioServerTransport`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({
  name: 'offlinedocs',
  version: '0.0.0',
});

// Register tools with Zod schemas for input validation
server.tool(
  'resolve-library-id',
  'Search for a library by name in the offline documentation bundle',
  { name: z.string().describe('Library name or partial match query') },
  async ({ name }) => {
    // handler returns { content: [{ type: 'text', text: JSON.stringify(result) }] }
  }
);

server.tool(
  'query-docs',
  'Query documentation for a specific library',
  {
    libraryId: z.string().describe('Library ID from resolve-library-id'),
    query: z.string().describe('Search query for documentation'),
    maxTokens: z.number().optional().describe('Maximum tokens in response (default: 5000)'),
  },
  async ({ libraryId, query, maxTokens }) => {
    // handler
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

**CRITICAL**: Import from subpaths — `@modelcontextprotocol/sdk/server/mcp.js` and `@modelcontextprotocol/sdk/server/stdio.js`. Do NOT import from the package root.

**CRITICAL**: Use `z` from `zod` (not `zod/v4`) for MCP SDK tool schemas. The SDK's internal Zod usage requires standard Zod v3 imports. The shared package uses `zod/v4` but MCP tool schemas must use `zod` directly.

### MCP Tool Contracts

**resolve-library-id:**

```typescript
// Input
interface ResolveInput {
  name: string;
}

// Success response
interface ResolveSuccess {
  id: string;
  name: string;
  description: string;
  version?: string;       // Present when source provides version info
  lastFetched: string;    // ISO 8601
}

// Error response
interface ResolveError {
  error: string;
  code: "LIBRARY_NOT_FOUND";
  availableLibraries: { id: string; name: string }[];
}
```

Matching logic: lowercase both the query and each library's `id` and `name`. Check `id === query`, then `name.toLowerCase() === query`, then `id.includes(query)` or `name.toLowerCase().includes(query)`. Multiple partial matches → prefer shortest name (closest match).

**query-docs:**

```typescript
// Input
interface QueryDocsInput {
  libraryId: string;
  query: string;
  maxTokens?: number;  // Default: 5000
}

// Success response — extends QueryResult from search/ranking.ts
interface QueryDocsResponse {
  content: string;
  chunks: { title: string; file: string; score: number; byteSize: number }[];
  truncated: boolean;
  tokenCount: number;
  libraryId: string;
  query: string;
}

// Error response
interface QueryDocsError {
  error: string;
  code: "LIBRARY_NOT_FOUND";
  availableLibraries: { id: string; name: string }[];
}
```

### Fallback Chain for query-docs (No Matches)

Architecture specifies this exact fallback order:
1. Return `getting-started.md` chunk — look for chunk where `filename === 'getting-started.md'` in the index for that library
2. If no getting-started chunk, return library `description` from registry as minimal context
3. Empty query string: return the overview chunk (first chunk alphabetically or getting-started)

### Staleness Warning

```typescript
import { STALE_THRESHOLD_DAYS } from '@offlinedocs/shared';

function checkStaleness(lastFetched: string, thresholdDays: number): string | null {
  const fetchedDate = new Date(lastFetched);
  const now = new Date();
  const daysSince = Math.floor((now.getTime() - fetchedDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysSince > thresholdDays) {
    return `> ⚠️ These docs were fetched ${daysSince} days ago and may be outdated.\n\n`;
  }
  return null;
}
```

Prepend to `content` field — never replace content.

### Error Handling Pattern — CRITICAL

Per architecture: MCP tool handlers use **try/catch** (not Result pattern). The Result pattern is for adapters only.

```typescript
// MCP handler — try/catch, return protocol error
async handleQueryDocs(params: QueryDocsInput) {
  try {
    const results = queryDocs(registry, index, params.libraryId, params.query, options);
    return { content: [{ type: 'text' as const, text: JSON.stringify(results) }] };
  } catch (e) {
    return { content: [{ type: 'text' as const, text: JSON.stringify({ error: (e as Error).message, code: 'INTERNAL_ERROR' }) }] };
  }
}
```

### Logging Contract — CRITICAL

Server stdout is **reserved exclusively for MCP stdio transport**. ALL diagnostic output MUST go to `stderr` only.

```typescript
// CORRECT
console.error(`Server started: ${registry.libraries.length} libraries loaded`);

// WRONG — NEVER use console.log in server package
console.log('anything'); // ← corrupts MCP stdio channel
```

### CLI Argument Parsing

Use minimal `process.argv` parsing (no Commander.js dependency in server). The server is simple enough:

```typescript
function parseArgs(argv: string[]): { bundlePath: string; skipIntegrity: boolean; staleThresholdDays: number } {
  const bundleIndex = argv.indexOf('--bundle');
  if (bundleIndex === -1 || !argv[bundleIndex + 1]) {
    console.error('Usage: offlinedocs-server --bundle <path> [--skip-integrity] [--stale-threshold-days <number>]');
    process.exit(1);
  }
  const bundlePath = argv[bundleIndex + 1]!;
  const skipIntegrity = argv.includes('--skip-integrity');
  const staleIndex = argv.indexOf('--stale-threshold-days');
  const staleThresholdDays = staleIndex !== -1 && argv[staleIndex + 1]
    ? parseInt(argv[staleIndex + 1]!, 10)
    : STALE_THRESHOLD_DAYS;
  return { bundlePath, skipIntegrity, staleThresholdDays };
}
```

### Existing Code to Leverage — DO NOT DUPLICATE

From `@offlinedocs/shared`:
- `STALE_THRESHOLD_DAYS` (30) — default staleness threshold
- `DEFAULT_MAX_TOKENS` (5000) — default token limit
- `Registry` type — for registry data shape
- `BUNDLE_FORMAT_VERSION` — for version checks

From `packages/server/src/startup.ts`:
- `startupBundle(bundlePath, options)` — returns `Result<StartupResult>` with `{ registry, chunks, index }`
- `StartupResult` type — contains everything MCP server needs

From `packages/server/src/search/`:
- `queryIndex(index, libraryId, query, maxTokens)` — returns `QueryResult`
- `SearchIndex` type — the in-memory index
- `buildIndex(chunks)` — already called by startupBundle

### Registry Library Entry Shape (from RegistrySchema)

Each library in `registry.libraries` has:
```typescript
{
  id: string;          // e.g. "react"
  name: string;        // e.g. "React"
  description: string;
  version?: string;
  sourceType: string;
  sourceUrl: string;
  lastFetched: string; // ISO 8601
  contentHash: string;
  chunkCount: number;
  checksums: Record<string, string>;
}
```

### Testing Approach

- **resolve-library-id.test.ts**: Create mock Registry objects inline
  - Test exact match by id
  - Test case-insensitive match by name
  - Test partial match ("next" → "Next.js")
  - Test no match returns LIBRARY_NOT_FOUND with available libraries list
  - Test multiple partial matches → returns shortest name

- **query-docs.test.ts**: Create mock Registry + SearchIndex, mock `queryIndex`
  - Test successful query returns full response shape with libraryId and query fields
  - Test library not found returns LIBRARY_NOT_FOUND error
  - Test fallback to getting-started chunk when no matches
  - Test fallback to description when no getting-started
  - Test staleness warning prepended when library is stale
  - Test custom staleThresholdDays overrides default

- **mcp-server.test.ts**: Test MCP server creation and tool registration
  - Test server registers both tools
  - Test tool schemas match expected input shapes
  - Avoid testing full stdio transport (integration test scope — Story 3.4+)

### Previous Story Learnings (from Stories 3.1 and 3.2)

- Co-locate tests with source files (`.test.ts` next to `.ts`)
- Import from `@offlinedocs/shared` for schemas and constants
- Use `import type` for type-only imports
- `.js` extensions in all local imports (ESM requirement)
- Barrel export through `index.ts` files
- Use `vi.spyOn(console, 'error').mockImplementation(() => {})` for stderr assertions
- `beforeEach`/`afterEach` for test cleanup
- Path traversal guards when resolving paths from external input
- NEVER use console.log in server package — only console.error

### Files to Create

- `packages/server/src/tools/resolve-library-id.ts` (NEW)
- `packages/server/src/tools/resolve-library-id.test.ts` (NEW)
- `packages/server/src/tools/query-docs.ts` (NEW)
- `packages/server/src/tools/query-docs.test.ts` (NEW)
- `packages/server/src/tools/index.ts` (NEW)
- `packages/server/src/mcp-server.ts` (NEW)
- `packages/server/src/mcp-server.test.ts` (NEW)

### Files to Modify

- `packages/server/src/cli.ts` (UPDATE — replace stub with full CLI implementation)
- `packages/server/src/index.ts` (UPDATE — add tool and mcp-server exports)

### Review Findings

- [x] [Review][Patch] Missing `isError: true` on MCP error responses — both LIBRARY_NOT_FOUND and INTERNAL_ERROR responses lack `isError` flag [mcp-server.ts] — fixed: added `isError: true` to error responses, check `'code' in result` for app-level errors
- [x] [Review][Patch] `parseInt` NaN guard missing on `--stale-threshold-days` — non-numeric input silently disables staleness [cli.ts] — fixed: added NaN/negative check with error exit
- [x] [Review][Patch] Empty string `name` passes Zod validation — `"".includes("")` is always true, returns arbitrary library [mcp-server.ts] — fixed: added `.min(1)` to name schema
- [x] [Review][Patch] Empty `libraryId`/`query` Zod schemas missing `.min(1)` — empty strings should be rejected at protocol boundary [mcp-server.ts] — fixed: added `.min(1)` to both
- [x] [Review][Patch] Negative/zero `maxTokens` passes validation — should enforce `.positive()` [mcp-server.ts] — fixed: added `.positive()` to maxTokens schema
- [x] [Review][Patch] MCP server tests don't verify tool registration or INTERNAL_ERROR error paths [mcp-server.test.ts] — fixed: added tool registration verification test
- [x] [Review][Patch] No test for empty-query fallback or staleness warning combined with fallback content [query-docs.test.ts] — fixed: added 3 tests for empty query fallback, staleness+getting-started, staleness+description
- [x] [Review][Patch] `truncated` not explicitly reset to `false` in getting-started and description fallback paths [query-docs.ts] — fixed: explicit `truncated = false` at start of fallback block
- [x] [Review][Defer] Partial match ranking by name length is suboptimal for short queries — deferred, acceptable for v1
- [x] [Review][Defer] No graceful shutdown handler on SIGTERM/SIGINT — deferred, post-MVP

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.3]
- [Source: _bmad-output/planning-artifacts/architecture.md#MCP Tool Contracts]
- [Source: _bmad-output/planning-artifacts/architecture.md#Search & Retrieval — Fallback Behavior]
- [Source: _bmad-output/planning-artifacts/architecture.md#Communication Patterns — Logging Contract]
- [Source: _bmad-output/planning-artifacts/architecture.md#Result Pattern for Adapters, Try/Catch for MCP Handlers]
- [Source: packages/server/src/startup.ts — StartupResult, startupBundle]
- [Source: packages/server/src/search/ranking.ts — queryIndex, QueryResult]
- [Source: packages/shared/src/constants.ts — STALE_THRESHOLD_DAYS, DEFAULT_MAX_TOKENS]
- [Source: packages/shared/src/schemas/registry.ts — Registry type, library entry shape]

## Dev Agent Record

### Agent Model Used

Claude Opus 4

### Debug Log References

### Completion Notes List

- Implemented resolve-library-id with exact id → exact name → partial match fallback, case-insensitive, shortest-name preference for multiple matches
- Implemented query-docs with full QueryDocsResponse shape (content, chunks, truncated, tokenCount, libraryId, query)
- Fallback chain: queryIndex → getting-started.md chunk → library description from registry
- Staleness warning prepended to content when library docs exceed threshold days (default 30, configurable via --stale-threshold-days)
- MCP server with McpServer class, registers both tools with Zod input schemas, try/catch error handling per architecture
- CLI entrypoint with --bundle (required), --skip-integrity, --stale-threshold-days flags, process.argv parsing
- All logging to stderr only — zero console.log usage in server package
- Added zod dependency to server package.json for MCP SDK tool schema definitions
- 20 new tests (10 resolve-library-id + 8 query-docs + 2 mcp-server), all passing
- Full monorepo: 240 tests passing, zero regressions
- Build succeeds for all packages

### File List

- packages/server/src/tools/resolve-library-id.ts (NEW)
- packages/server/src/tools/resolve-library-id.test.ts (NEW)
- packages/server/src/tools/query-docs.ts (NEW)
- packages/server/src/tools/query-docs.test.ts (NEW)
- packages/server/src/tools/index.ts (NEW)
- packages/server/src/mcp-server.ts (NEW)
- packages/server/src/mcp-server.test.ts (NEW)
- packages/server/src/cli.ts (MODIFIED — replaced stub with full CLI)
- packages/server/src/index.ts (MODIFIED — added tool and mcp-server exports)
- packages/server/package.json (MODIFIED — added zod dependency)
