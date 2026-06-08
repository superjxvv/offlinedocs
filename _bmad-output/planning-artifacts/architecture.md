---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-05-26'
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-workspace-2026-05-26/prd.md
workflowType: 'architecture'
project_name: 'OfflineDocs'
user_name: 'Claude'
date: '2026-05-26'
---

> **NOTE (Story 4.1):** This artifact references pnpm workspaces, pnpm-workspace.yaml, and pnpm commands throughout. The project migrated to npm workspaces in Story 4.1. Treat pnpm references below as historical.

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
13 FRs across 4 feature areas:
- **Online Fetcher (FR-1–FR-4):** CLI tool that fetches docs from 3 source types (llms.txt, GitHub markdown, Context7 API), supports incremental updates, and reads from a human-editable YAML/TOML config. Runs on internet-connected machines only.
- **Doc Bundle Format (FR-5–FR-7):** Portable directory structure with a Registry manifest (JSON/YAML) and topic-based markdown chunks with frontmatter metadata. No databases or binary dependencies. 50KB max per chunk file.
- **Offline MCP Server (FR-8–FR-11):** Local MCP server exposing `resolve-library-id` and `query-docs` tools. Keyword-based retrieval with ranked matching (topics > title > body). Zero-config startup, sub-5s for 50 libraries. Tool names match Context7 for drop-in compatibility.
- **Team Sync Workflow (FR-12–FR-13):** Shareable library config, atomic bundle replacement, restart-to-reload model.

**Non-Functional Requirements:**
- **Portability:** Plain directory with OS-safe paths (<200 chars), cross-platform (Windows + Linux)
- **Performance:** Sub-5s server startup for 50 libraries (cold start, measured on both platforms); full refresh under 15 minutes for 50 libraries
- **Simplicity:** Zero-config server, human-readable config, no databases or indexing steps
- **Compatibility:** MCP protocol compliance, Context7 tool name parity (decomposed below)
- **Reliability:** Atomic bundle replacement, no partial state on copy
- **Integrity:** Bundle format versioning and validation to prevent Fetcher/Server drift
- **Auditability:** Bundle contents must be inspectable by airgapped environment operators for security review

**Context7 Parity Decomposition:**
"Matches Context7" must be evaluated against specific dimensions:
- Tool API contract: `resolve-library-id` and `query-docs` with compatible parameter/response shapes
- Response relevance: returned chunks should address the query topic (measured by query satisfaction rate, not just keyword hits)
- Response latency: sub-second for both tools in offline operation
- Coverage breadth: team-curated libraries only (not Context7's full catalog — this is an explicit scope reduction)

**Scale & Complexity:**
- Primary domain: CLI tooling + MCP server (backend/infrastructure)
- Complexity level: Medium
- Estimated architectural components: 6 (Fetcher CLI, Source Adapters, Chunk Processor, Bundle Writer, MCP Server, Search/Retrieval Index)

### Stakeholder Analysis

Two distinct stakeholder personas with potentially conflicting needs:

| Stakeholder | Role | Success Criteria | Tensions |
|-------------|------|-----------------|----------|
| **Fetcher Operator** | Runs the Online Fetcher on internet-connected machine; manages library config | Convenience, speed, clear feedback on fetch results | Wants to add libraries freely |
| **Airgapped Environment Operator** | Manages the airgapped environment; controls what enters it | Auditability, controlled content, security review of bundle contents | May restrict what gets transferred; needs to inspect/approve bundles |
| **Offline Developer** | Uses Claude Code with OfflineDocs daily | Current, relevant docs; fast responses; "just works" | Depends on both operators; has no control over freshness |

### Key Architectural Decisions Identified

| Decision | Recommended Approach | Rationale |
|----------|---------------------|-----------|
| Component separation | Two separate executables | Airgapped machine never needs fetcher dependencies (HTTP clients, git) |
| Registry role | Registry as sole source of truth for lookups | FR-6 mandates no filesystem scanning; fastest and most predictable |
| Retrieval strategy | In-memory inverted index built at startup | O(1) lookups within sub-5s startup budget; keeps bundle format simple |
| Source adapter model | Strategy pattern with common interface + error contract | 3 sources now, PRD mentions future HTML scraping; error variants must be enumerated in the interface |
| Bundle format | Formally specified contract with version field and JSON Schema | Fetcher and Server share only this; must be versioned like a public API; schema enables contract tests |
| Config format | TOML preferred over YAML | Cleaner merge semantics for team collaboration, no indentation traps |
| Server startup behavior | Fail-fast on corrupt/missing bundle with explicit error | Silent degradation in airgapped environments is worse than loud failure |
| Staleness policy | Server warns at query time when bundle exceeds configurable TTL (default 30 days) | Operator decides when to re-fetch; Server surfaces staleness to developer without blocking |

### Technical Constraints & Dependencies

- Two separate runtime contexts (online Fetcher vs offline MCP Server) sharing only the Doc Bundle format as their integration contract
- No internet access available to the MCP Server at runtime — bundle must be 100% self-contained (no external refs, no CDN links)
- Must work without databases, binary blobs, or platform-specific dependencies
- MCP protocol defines the server's external interface; pin SDK version
- Three heterogeneous source types require adapter-pattern fetch logic with per-adapter output validation and enumerated error variants
- All paths must use forward-slash normalization for cross-platform safety
- Bundle size may be constrained by airgap transfer mechanisms (USB, file share) — need practical upper bound estimate

### Cross-Cutting Concerns Identified

- **Bundle format as API contract** — shared between Fetcher and Server; must be versioned (`bundleFormatVersion`), validated on both sides via JSON Schema, and documented as rigorously as a public API. Schema is a Phase 1 deliverable, not a byproduct.
- **Markdown + frontmatter schema** — the serialization format for doc chunks; both sides must agree on structure (title, library, topics fields)
- **Cross-platform file I/O** — forward-slash path normalization, OS-safe slugs for library IDs and filenames, tested across Windows/Linux
- **Source adapter validation** — each adapter must validate output (non-empty content, valid frontmatter, size within limits); Fetcher reports per-library success/failure summary
- **Adapter error contracts** — `AdapterInterface` must enumerate error variants (network failure, auth required, rate limited, format changed, empty response) with injectable seams for testing
- **Chunk size management** — 50KB limit enforced during fetch with heading-based splitting (paragraph fallback); Server needs chunk-size metadata for smarter token budget allocation
- **Integrity verification** — SHA-256 checksums per file in Registry manifest; file count validation; detects partial bundle transfers
- **Staleness detection** — `lastFetchDate` per library in Registry; Server warns at query time when docs exceed configurable age threshold (default 30 days); ownership: Server warns, Fetcher operator decides when to refresh
- **Tool name collision** — if Context7 and OfflineDocs are both configured, tool name collision occurs; need detection/warning or mutual exclusivity guidance
- **Failure UX** — when a queried library doesn't exist in the bundle, the response must list available libraries (not just "not found"); when docs are stale, include the age in the response

### Risk Profile (Pre-mortem)

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Bundle format drift between Fetcher/Server versions | Medium | High | `bundleFormatVersion` field + JSON Schema; Server validates on startup |
| Source rot (endpoints change structure) | High | High | Per-adapter output validation; schema version in adapter; clear failure reporting with per-library status |
| Cross-platform path breakage | Medium | High | Forward-slash normalization; path-safe slugs; cross-OS testing in CI |
| Poor retrieval quality from keyword matching | Medium | Medium | Invest in Fetcher's topic tag extraction quality; log query misses; define retrieval quality baseline |
| Stale bundle inertia (nobody refreshes) | Medium | Medium | Server staleness warning at query time; simple refresh workflow |
| Partial bundle transfer (interrupted copy) | Low | High | SHA-256 integrity checksums in Registry; file count validation |
| Context7 tool name collision | Low | Medium | Document mutual exclusivity; detect at startup if possible |
| Bootstrap problem (first bundle into airgapped env) | Medium | High | Document transfer workflow; consider bundle packaging (tar/zip) as optional Fetcher output |
| Source reliability (libraries go private, add auth) | Medium | Medium | Adapter error contracts with specific error types; Fetcher status report per library |

### Failure Mode Summary

| Component | Key Failure Modes | Mitigations |
|-----------|------------------|-------------|
| Fetcher adapters | HTTP errors, rate limiting, format changes, garbage content, auth gates | Content validation, optional auth token support, schema checks, enumerated error variants |
| Chunk splitter | No natural split points, oversized output | Heading hierarchy split, paragraph fallback, numbered parts |
| Bundle/Registry | Corruption, partial transfer, schema drift | Startup validation, SHA-256 checksums, format versioning, JSON Schema |
| Server search | Query misses, irrelevant results, token budget mismatch | Overview fallback, query logging, good topic tags, chunk-size metadata |
| Server startup | Corrupt/missing bundle, missing registry | Fail-fast with explicit error messages; never serve degraded silently |
| MCP integration | Protocol mismatch, tool collision | SDK version pinning, collision detection, mutual exclusivity docs |

### Open Questions Requiring Resolution

| # | Question | Resolution Timing | Owner |
|---|----------|-------------------|-------|
| OQ-1 | What is the practical bundle size upper bound for the team's transfer mechanism? | Before technology decisions | Stakeholder input needed |
| OQ-2 | Should the Fetcher output a tar/zip archive as optional packaging for transfer? | Before implementation | Architecture decision |
| OQ-3 | What is the acceptable staleness window before the Server warns? (Default: 30 days) | Before implementation | Team policy decision |
| OQ-4 | Should library config support version pinning or always fetch latest? | During implementation | Can defer |
| OQ-5 | Should the Fetcher support PyPI/npm README as a lightweight source? | Post-MVP | Can defer |

## Starter Template Evaluation

### Primary Technology Domain

**CLI tooling + MCP server** (backend/infrastructure) — not a web application. No single starter template covers both components. The correct approach is a monorepo with separate packages sharing the bundle format contract.

### Language Decision: TypeScript

| Criterion | TypeScript | Python |
|-----------|-----------|--------|
| MCP SDK maturity | v1.29.0 (slightly ahead) | v1.27.1 |
| Cross-platform distribution | Node.js binary, no runtime management | Requires Python environment on target |
| Single language for both components | Yes | Yes |
| Target audience alignment | Claude Code developers use TypeScript | Less aligned |
| Markdown parsing | gray-matter, remark ecosystem | Better libraries (mistune, etc.) |
| Monorepo tooling | Excellent (pnpm workspaces) | Adequate (uv workspaces) |

**Decision: TypeScript.** Single language for both components, simpler cross-platform distribution (no Python environment management on airgapped machines), and the MCP TypeScript SDK is slightly more mature.

### CLI Framework Decision: Commander.js

| Criteria | Commander.js | oclif | yargs | citty |
|----------|-------------|-------|-------|-------|
| Weekly downloads | ~35M | ~200K | ~90M | ~3M |
| TypeScript support | Excellent | Native | Good | Native |
| Learning curve | Low | Medium | Low | Low |
| Plugin system | No | Yes | No | No |
| Binary size impact | Minimal | Heavy | Moderate | Minimal |
| Right-sized for this project | Yes | Overkill | Yes | Yes |

**Decision: Commander.js.** Simple CLI with few commands (`fetch`, `fetch --force`, `fetch --library X`). No plugin architecture needed. oclif's scaffolding and plugin system are unnecessary complexity.

### Starter Options Considered

| Option | Verdict | Rationale |
|--------|---------|-----------|
| `pnpm dlx create-turbo@latest` | Rejected | Generates web-app boilerplate (React, Tailwind configs) requiring cleanup; Turborepo is overkill for 3 packages |
| Community MCP starter templates | Rejected | Pin old SDK versions, add unnecessary opinions, don't cover the CLI side |
| `oclif generate` | Rejected | Plugin architecture and multi-command scaffolding are overkill |
| Manual pnpm workspace scaffold | **Selected** | ~5 config files, full control, zero cleanup, right-sized for the project |

### Selected Approach: Manual pnpm Monorepo Scaffold

**Rationale:** No existing starter template fits a CLI + MCP server monorepo. Manual scaffold gives full control with zero cleanup. The project is simple enough that a generator adds more config debt than it saves.

**Monorepo Structure:**

```
offlinedocs/
├── package.json              # Root: pnpm workspace config, shared scripts
├── pnpm-workspace.yaml       # Workspace package declarations
├── tsconfig.base.json        # Shared TypeScript config
├── .node-version             # Pinned Node.js version
├── packages/
│   ├── shared/               # Bundle format types, Zod schemas, constants
│   │   ├── package.json      # private: true (never published)
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── registry.ts   # Registry manifest schema (Zod + inferred types)
│   │       ├── frontmatter.ts # Chunk frontmatter schema
│   │       └── bundle.ts     # Bundle format version, validation helpers
│   ├── fetcher/              # Online Fetcher CLI
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── cli.ts        # Commander.js entry point
│   │       ├── adapters/     # Source adapters (llms-txt, github, context7)
│   │       └── writer/       # Bundle writer, chunk splitter
│   └── server/               # Offline MCP Server
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts      # MCP server entry point (stdio transport)
│           ├── registry.ts   # Registry loader + validator
│           ├── search.ts     # In-memory inverted index, ranked retrieval
│           └── tools/        # resolve-library-id, query-docs implementations
```

**Architectural Decisions Provided by This Foundation:**

**Language & Runtime:**
- TypeScript 5.x with strict mode
- Node.js (version pinned via `.node-version` and `engines` field)
- ESM modules throughout

**Build Tooling:**
- `tsup` (wraps esbuild) for building both packages
- Produces compiled JS for distribution — never ship ts-node to airgapped environments
- Standalone executable packaging via `tsup --bundle` for single-file distribution

**Runtime Schema Validation:**
- `zod` in `shared/` package — schema-first design
- Types derived from Zod schemas via `z.infer<>`, not the other way around
- Bundle format validated at both write time (Fetcher) and read time (Server startup)
- `shared` package is `private: true` — never accidentally published

**Testing Framework:**
- `vitest` with `@vitest/coverage-v8`
- Coverage threshold: 80% lines minimum
- Integration test harness: `execa` for subprocess control (spawn MCP server, send JSON-RPC, assert responses)
- Cross-platform path smoke tests in CI from day one

**MCP Integration:**
- `@modelcontextprotocol/sdk@^1.29.0` — pinned floor with compatible range
- stdio transport (no network hop for offline use)
- SDK version documented as first-class compatibility concern
- Tool names: `resolve-library-id`, `query-docs` (Context7 parity)

**Development Experience:**
- pnpm workspaces for package linking (no Turborepo — right-sized for 3 packages)
- `tsx` for development-time TypeScript execution
- No linter config beyond `tsc --noEmit` until actual code exists

### Deployment & Distribution Considerations

| Concern | Decision | Rationale |
|---------|----------|-----------|
| Server ships as | Compiled JS (not ts-node) | No TypeScript runtime dependency on airgapped machine |
| Fetcher ships as | Compiled JS or standalone binary | Must run on internet-connected machine with Node.js |
| Monorepo release cadence | Both packages versioned together | Bundle format contract binds them; independent releases risk drift |
| Offline setup (UJ-3) | Pre-compiled server + bundle path config | `pnpm install` not required on airgapped machine — ship compiled artifacts |
| Query latency target | < 200ms for both MCP tools | Sub-second per PRD, but mid-flow developers need faster responses |

### Risks & Mitigations from Starter Choice

| Risk | Mitigation |
|------|------------|
| pnpm version mismatch on developer machines | `.node-version` + `engines` field + setup docs |
| MCP SDK v2 breaking changes | Pin `^1.29.0`; monitor v2 migration path; SDK promises 6-month v1.x support |
| Fetcher hitting rate limits at minute 14 of 15 | Retry logic with backoff; per-library progress visibility; partial success reporting |
| Monorepo coupling when release cadences diverge | Acceptable trade-off — bundle format contract requires atomic changes across both |
| Over-scaffolding at setup time | Start minimal; add tooling only when justified by actual pain |

**Note:** Project initialization using this scaffold should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
1. Bundle format specification (registry schema, frontmatter schema, directory layout)
2. Source adapter interface contract with error types
3. MCP tool parameter/response shapes
4. Search index construction and ranking algorithm
5. Distribution format and Node.js minimum version

**Important Decisions (Shape Architecture):**
1. HTTP client and retry strategy
2. Token budget management and truncation behavior
3. Integrity verification model
4. Graceful degradation boundaries
5. Cross-platform path handling

**Deferred Decisions (Post-MVP):**
1. Standalone binary packaging (pkg/bun compile/Node SEA)
2. Vector/semantic search upgrade path
3. Hot-reload of bundle without server restart
4. HTML doc site scraping adapter
5. Auto-discovery from package.json/requirements.txt

### Data Architecture (Bundle Format)

**Registry Manifest: JSON**
- Format: `registry.json` at bundle root
- Validated by Zod v4.4.3 schema; generated JSON Schema checked into repo (not generated at runtime)
- Contains: `bundleFormatVersion` (integer, currently `1`), `libraries[]`, `fileCount`, `generatedAt`
- Each library entry: `{ id: string, name: string, description: string, version?: string, sourceType: "llms-txt" | "github" | "context7", sourceUrl: string, lastFetched: string (ISO 8601), contentHash: string (SHA-256 of raw source, for incremental skip), chunkCount: number, checksums: Record<string, string> }`
- `version` is populated when the source provides explicit version info (e.g., GitHub tag, llms.txt version header); absent when version cannot be determined
- `checksums`: SHA-256 hash per chunk file, keyed by relative path (forward-slash normalized)
- Server validates `bundleFormatVersion` and `fileCount` on startup; fails fast on mismatch

**Frontmatter Schema:**
- Parser: `@11ty/gray-matter` ^2.0.2 (maintained fork, Apr 2026, removes unsafe eval)
- Required fields: `title: string`, `library: string` (library ID), `topics: string[]` (keyword tags)
- Optional fields: `part?: number` (for multi-part split files)
- Validated by Zod schema in `shared/` package
- A chunk is "bad" (skipped with warning) when: Zod validation fails on frontmatter, content is null/empty, or file cannot be read

**Library Config: TOML**
- Parser: `smol-toml` (zero-dependency, TOML 1.1.0 compliant, tested on Node 24)
- Config lives at well-known path alongside or within the bundle (e.g., `libraries.toml`)
- Also committable to project repo separately for version control
- Malformed TOML triggers `AdapterError.CONFIG_INVALID` (see error contract below)

**Integrity Model:**
- SHA-256 per-file checksums stored in `registry.json` under each library's `checksums` field
- `fileCount` at registry root for quick partial-transfer detection
- Server validates checksums on startup (optional `--skip-integrity` flag for faster dev startup)
- Uses Node.js built-in `crypto` module — zero dependencies

### Source Adapter Architecture

**Adapter Interface Contract:**

```typescript
interface SourceAdapter {
  readonly sourceType: "llms-txt" | "github" | "context7";
  fetch(library: LibraryConfig): Promise<FetchResult>;
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

**Error Contract:**

```typescript
class AdapterError extends Error {
  constructor(
    public readonly code: AdapterErrorCode,
    public readonly libraryId: string,
    message: string,
    public readonly cause?: Error
  ) { super(message); }
}

type AdapterErrorCode =
  | "NETWORK"          // Connection failed, timeout, DNS resolution
  | "AUTH_REQUIRED"    // 401/403, needs token
  | "RATE_LIMITED"     // 429, retry later
  | "FORMAT_CHANGED"  // Source returned content but Zod validation of expected structure failed
  | "EMPTY_RESPONSE"  // Source returned 200 but no usable content
  | "CONFIG_INVALID"; // Library config entry malformed (bad TOML, missing required fields)
```

`FORMAT_CHANGED` is triggered when: the HTTP response is successful (2xx) but the content fails Zod validation of the expected source-specific structure (e.g., llms.txt missing expected sections, GitHub API response shape changed).

**HTTP & Retry Strategy:**
- HTTP client: Node.js built-in `fetch` (global since Node 18) — zero dependencies
- Retry: 2 retries with exponential backoff for CDN-backed sources (GitHub raw), 3 retries for API sources (Context7)
- Retry constants exported and mockable: `RETRY_BASE_MS = 1000`, `MAX_RETRIES_CDN = 2`, `MAX_RETRIES_API = 3`
- Jitter: ±200ms random to prevent thundering herd
- GitHub approach: raw content URLs for public repos (no auth, no rate limits); fallback to REST API with optional `GITHUB_TOKEN` for private repos or rate-limited scenarios

**Progress Reporting:**
- Per-library status line streamed to stdout: `[1/50] react ... fetching → done (23 chunks)`
- Failed libraries: `[2/50] express ... FAILED (RATE_LIMITED) — skipped`
- Summary at end: `Fetched: 48/50 | Failed: 2 | Skipped (unchanged): 12 | Duration: 4m 32s`

### Search & Retrieval

**Index Construction:**
- Built in-memory at server startup from all chunk frontmatter + body content
- Tokenization: split on whitespace + punctuation, lowercase, deduplicate per chunk
- Topics extracted from frontmatter `topics[]` array (pre-curated by Fetcher adapters)
- Title tokens from frontmatter `title` field
- Body tokens from markdown content (stripped of code blocks and URLs)
- Startup time logged for monitoring; expected ~1s for 1000 chunks

**Ranking Algorithm:**
- Weighted scoring: `topics` match = 3 points, `title` match = 2 points, `body` match = 1 point per query term
- Scores summed across all query terms per chunk
- Tie-breaking: stable sort; on equal score, preserve insertion order (alphabetical by file path within library)
- Scoring weights defined in a single exported config object (`SEARCH_WEIGHTS`), not spread across codebase

**Synonym Expansion (v1, minimal):**
- A small, hand-maintained alias map for common term variations: `{ "auth": ["authentication", "authorization"], "config": ["configuration", "setup"], "db": ["database"] }`
- Applied at query time only — expands query terms before index lookup
- Map lives in `shared/` package, editable by team

**Token Budget Management:**
- Default: 5000 tokens (~20KB text), configurable per query via `maxTokens` parameter
- Chunks included whole in ranked order until budget exhausted
- **Top-chunk exception:** if the highest-ranked chunk exceeds `maxTokens`, return it anyway — never fall back to irrelevant content when the best match is available
- Chunk-size metadata (byte count) stored in index for efficient budget calculation without re-reading files

**Response Shape (query-docs):**

```typescript
interface QueryDocsResponse {
  content: string;           // Concatenated markdown of included chunks
  chunks: {
    title: string;
    file: string;            // Relative path within library dir
    score: number;
    byteSize: number;
  }[];
  truncated: boolean;        // True when top chunk exceeded maxTokens
  tokenCount: number;        // Approximate token count of returned content
  libraryId: string;
  query: string;
}
```

The `truncated` flag is informational for the MCP client (Claude Code) — it may choose to note this in its response to the user but is not required to act on it.

**Fallback Behavior:**
- No matches: return `getting-started.md` chunk, or first chunk alphabetically if no getting-started exists
- No getting-started and no matches: return the library's `description` from the registry as minimal context
- Empty query string: return the overview chunk
- Library not found: return error with full list of `{ id: string, name: string }[]`

### MCP Tool Contracts

**resolve-library-id:**

```typescript
// Input
interface ResolveInput {
  name: string;  // Library name or partial match query
}

// Success response
interface ResolveSuccess {
  id: string;
  name: string;
  description: string;
  version?: string;       // Present when source provides version info
  lastFetched: string;    // ISO 8601
}

// Error response (no match)
interface ResolveError {
  error: string;
  code: "LIBRARY_NOT_FOUND";
  availableLibraries: { id: string; name: string }[];
}
```

- Partial matching: "next" matches "Next.js", "react" matches "React"
- Case-insensitive comparison
- Multiple matches: return best match (shortest edit distance)

**query-docs:** (response shape defined in Search & Retrieval section above)

```typescript
// Input
interface QueryDocsInput {
  libraryId: string;
  query: string;
  maxTokens?: number;  // Default: 5000
}

// Error response (library not found)
interface QueryDocsError {
  error: string;
  code: "LIBRARY_NOT_FOUND";
  availableLibraries: { id: string; name: string }[];
}
```

**Staleness Warning:**
- When a library's `lastFetched` exceeds configurable TTL (default 30 days), the response `content` is prepended with: `> ⚠️ These docs were fetched {N} days ago and may be outdated.\n\n`
- The warning **annotates** the response — it never blocks or replaces the actual content
- TTL configurable via server `--stale-threshold-days` flag

### Infrastructure & Deployment

**Node.js Version:**
- Target: Node.js 24 LTS (v24.15.0 'Krypton'), active LTS through Apr 2028
- Minimum: Node.js 22 (maintenance LTS, EOL Apr 2027) — broadens compatibility for enterprise environments on slower upgrade cycles
- Enforced via `engines` field in root `package.json` and `.node-version` file
- Future consideration: Node.js Single Executable Application (SEA) or `pkg` for standalone binary distribution (post-MVP)

**Distribution:**
- Both components ship as single compiled `.js` files via `tsup --bundle`
- Server: `node server.js --bundle /path/to/docs` (zero-config startup)
- Fetcher: `node fetcher.js fetch --config /path/to/libraries.toml` (requires internet)
- No `node_modules` required at runtime — all dependencies bundled
- Standalone binary packaging deferred to post-MVP; Node.js required on target machines for v1

**CI/CD:**
- GitHub Actions with matrix strategy: `ubuntu-latest` + `windows-latest`
- Node.js versions in matrix: 22, 24 (minimum + target)
- Cross-platform path tests run on both OSes from day one
- Bundle integrity tests: create bundle on one OS, validate on the other

**Logging:**
- Server: `console.error` for diagnostics (keeps stdout clean for MCP stdio transport)
- Fetcher: `console.log` for progress, `console.error` for errors
- `--verbose` flag on both: adds structured JSON log lines for debugging
- No logging library dependency in v1

### Decision Impact Analysis

**Implementation Sequence:**
1. `shared/` package: Zod schemas (registry, frontmatter, adapter errors), JSON Schema generation, constants
2. Bundle format: directory layout, registry.json writer/reader, integrity verification
3. Source adapters: interface + llms-txt adapter (simplest) → GitHub adapter → Context7 adapter
4. Chunk processor: markdown splitting, frontmatter generation, size enforcement
5. Fetcher CLI: Commander.js wrapper, config parsing, progress reporting
6. Search index: inverted index builder, ranking algorithm, token budget management
7. MCP Server: tool registration, stdio transport, registry loading, query routing
8. Integration testing: end-to-end fetch → serve → query flow on both platforms

**Cross-Component Dependencies:**

```
shared/ ──────────────────────────────────┐
  │                                       │
  ├── Zod schemas ──→ fetcher/writer      │
  │                ──→ server/registry     │
  │                                       │
  ├── AdapterError ──→ fetcher/adapters   │
  │                                       │
  ├── SEARCH_WEIGHTS ──→ server/search    │
  │                                       │
  └── JSON Schema ──→ repo (checked in)   │
                                          │
fetcher/ ─── writes ──→ Doc Bundle ───────┤
                                          │
server/ ──── reads ──→ Doc Bundle ────────┘
```

The `shared/` package is the architectural keystone. All format contracts, error types, and configuration constants flow through it. Changes to `shared/` affect both components — this is intentional and enforced by the monorepo structure.

## Implementation Patterns & Consistency Rules

### Pattern Classification

Patterns are classified as **load-bearing** (violations cause build failures or runtime bugs) or **convention** (violations cause inconsistency but not breakage). Load-bearing patterns are enforced by tooling where possible.

**Critical Conflict Points Identified:** 15 areas where AI agents could make different choices, all resolved below.

### Load-Bearing Patterns (Non-Negotiable)

These three patterns prevent real architectural conflicts. Violations cascade into build failures, runtime bugs, or cross-package incompatibilities.

#### 1. Package-Name Imports Only

All cross-package imports use the package name, never relative paths. Relative cross-package paths break on any internal reorganization.

```typescript
// ✅ CORRECT
import { RegistrySchema, AdapterError } from '@offlinedocs/shared';

// ❌ WRONG — relative cross-package import
import { RegistrySchema } from '../../shared/src/registry';
import { AdapterError } from '../../../shared/src/errors';
```

**Enforcement:** `tsconfig.base.json` defines `paths` mapping; `pnpm-workspace.yaml` declares packages; each package's `package.json` defines `exports` field.

#### 2. Barrel Index as Public API Boundary

Each package exposes its public API through `src/index.ts`. Internal modules are not re-exported. No deep imports into another package's internals.

```typescript
// ✅ CORRECT — import from barrel
import { RegistrySchema, FrontmatterSchema } from '@offlinedocs/shared';

// ❌ WRONG — deep import into internal module
import { RegistrySchema } from '@offlinedocs/shared/registry';
import { parseTopics } from '@offlinedocs/shared/internal/topic-parser';
```

**Rationale:** `shared/` is the architectural keystone. If consumers reach into internal modules, any refactor breaks both packages simultaneously.

#### 3. Result Pattern for Adapters, Try/Catch for MCP Handlers

Two distinct error-handling patterns at two distinct boundaries:

- **Adapters** (network boundary): Return `Result<T>` — errors are expected, collected, and reported
- **MCP tool handlers** (protocol boundary): Try/catch wrapping adapter calls, return MCP error responses

```typescript
// ✅ Adapter — Result pattern (errors are data, not exceptions)
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

// ✅ MCP handler — try/catch, return protocol error
async handleQueryDocs(params: QueryDocsInput): Promise<QueryDocsResponse | McpError> {
  try {
    const results = this.searchIndex.query(params.libraryId, params.query, params.maxTokens);
    return results;
  } catch (e) {
    return { error: e.message, code: 'INTERNAL_ERROR' };
  }
}
```

**Rationale:** Adapters fail routinely (network, rate limits). The Fetcher must collect all results and report a summary. Throwing would short-circuit the batch. MCP handlers must never crash the server process — protocol errors are returned, not thrown.

### Module & Package Configuration Patterns

These patterns prevent module resolution conflicts and build failures across the monorepo.

**ESM Throughout:**
- All packages use `"type": "module"` in `package.json`
- TypeScript config: `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`
- tsup output: ESM format (`.js`), with CJS (`.cjs`) as secondary output for `shared/`

**Root tsconfig.base.json:**

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "paths": {
      "@offlinedocs/*": ["./packages/*/src"]
    }
  }
}
```

Each package extends with `"extends": "../../tsconfig.base.json"`.

**Package exports field (every package):**

```jsonc
// packages/shared/package.json
{
  "name": "@offlinedocs/shared",
  "private": true,
  "type": "module",
  "exports": {
    ".": { "import": "./dist/index.js", "require": "./dist/index.cjs" }
  }
}
```

**Workspace dependencies:**

```jsonc
// packages/fetcher/package.json
{
  "dependencies": {
    "@offlinedocs/shared": "workspace:^"
  }
}
```

Always `workspace:^` — never `*` or relative file paths.

**pnpm-workspace.yaml:**

```yaml
packages:
  - 'packages/*'
```

No additional entries. New packages go into `packages/` and are auto-discovered.

### Naming Patterns (Convention)

| Element | Convention | Example |
|---------|-----------|---------|
| Files | kebab-case `.ts` | `registry-loader.ts`, `llms-txt-adapter.ts` |
| Directories | kebab-case | `source-adapters/`, `doc-chunks/` |
| Functions | camelCase, verb-first | `loadRegistry()`, `buildIndex()`, `fetchLibrary()` |
| Classes | PascalCase | `LlmsTxtAdapter`, `SearchIndex`, `AdapterError` |
| Constants | UPPER_SNAKE_CASE | `SEARCH_WEIGHTS`, `RETRY_BASE_MS`, `MAX_CHUNK_SIZE` |
| Zod schemas | PascalCase + `Schema` suffix | `RegistrySchema`, `FrontmatterSchema`, `LibraryConfigSchema` |
| Inferred types | PascalCase (no suffix) | `type Registry = z.infer<typeof RegistrySchema>` |
| Interfaces | PascalCase, no `I` prefix | `SourceAdapter`, `FetchResult`, `QueryDocsResponse` |
| JSON fields | camelCase | `{ "bundleFormatVersion": 1, "lastFetched": "..." }` |
| CLI flags | kebab-case | `--bundle-path`, `--force`, `--verbose` |

**Verb conventions for function names:**

| Verb | Meaning | Example |
|------|---------|---------|
| `load` | Read from filesystem + parse | `loadRegistry()`, `loadChunk()` |
| `parse` | Transform raw text to structured data | `parseFrontmatter()`, `parseToml()` |
| `build` | Construct in-memory data structure | `buildIndex()`, `buildManifest()` |
| `fetch` | HTTP request to external source | `fetchLibrary()`, `fetchLlmsTxt()` |
| `write` | Write to filesystem | `writeRegistry()`, `writeChunk()` |
| `validate` | Check data against schema | `validateBundle()`, `validateChunk()` |
| `resolve` | Look up and return match | `resolveLibraryId()` |
| `query` | Search and return ranked results | `queryDocs()` |

### Structure Patterns

**Test Organization:**

```
packages/shared/src/
  registry.ts
  registry.test.ts          # Unit test — co-located
  frontmatter.ts
  frontmatter.test.ts       # Unit test — co-located

packages/fetcher/src/
  adapters/
    llms-txt-adapter.ts
    llms-txt-adapter.test.ts  # Unit test — co-located
  cli.ts                      # CLI entrypoint (args only)
  index.ts                    # Library exports (testable without CLI)

packages/server/src/
  search.ts
  search.test.ts              # Unit test — co-located
  __tests__/
    integration/
      mcp-tools.test.ts       # Integration test — tests MCP tool end-to-end
      bundle-loading.test.ts   # Integration test — tests startup + validation

# ❌ No root-level tests/ directory
# ❌ No *.spec.ts files — .test.ts only
# ❌ No __tests__/ at root or for unit tests
```

**Vitest configuration — per-package:**

```
packages/shared/vitest.config.ts   # Shared package tests
packages/fetcher/vitest.config.ts  # Fetcher tests
packages/server/vitest.config.ts   # Server tests + integration
vitest.workspace.ts                # Root workspace config (references packages)
```

**CLI entrypoint separation:**

```typescript
// packages/fetcher/src/cli.ts — CLI entrypoint (thin wrapper)
// Only responsible for: arg parsing, calling library functions, formatting output
// ❌ No business logic in cli.ts

// packages/fetcher/src/index.ts — library exports (testable without CLI)
// All logic is importable and testable without Commander.js
export { fetchLibraries } from './fetch-libraries';
export { writeBundle } from './bundle-writer';
```

**Error type organization:**

```
packages/shared/src/errors.ts     # All domain error types (AdapterError, etc.)
                                   # Package-local errors stay in their module
```

### Format Patterns

**Date/Time:**
- All dates: ISO 8601 strings (`2026-05-26T12:00:00.000Z`)
- Generated via `new Date().toISOString()` — never `Date.now()` or custom formatting
- Timezone: always UTC (Z suffix)

**Path Separators:**
- All paths stored in registry.json and frontmatter: forward-slash only (`/`)
- Use `path.posix.join()` for path construction in bundle-related code
- Use `path.join()` only for local filesystem operations (reading files)
- Never store OS-specific path separators in the bundle

**JSON Output:**
- All JSON fields: camelCase
- Registry: `bundleFormatVersion`, `lastFetched`, `sourceType`, `chunkCount`
- MCP responses: `libraryId`, `tokenCount`, `byteSize`
- No snake_case anywhere in project-generated JSON

### Communication Patterns

**Logging Contract:**

| Package | stdout | stderr |
|---------|--------|--------|
| `server` | Reserved for MCP stdio transport — **nothing else may write here** | All diagnostics, warnings, errors |
| `fetcher` | Progress reporting, human-readable output | Errors and warnings |

**Critical rule:** No third-party dependency in `server/` may write to stdout. Evaluate all dependencies before adding. A single `console.log` in a transitive dependency corrupts the MCP stdio channel.

**Structured verbose logging (both packages):**

```typescript
// When --verbose is enabled
console.error(JSON.stringify({
  level: 'debug',
  component: 'search-index',
  event: 'index-built',
  libraryCount: 50,
  chunkCount: 1023,
  durationMs: 842
}));
```

### Process Patterns

**Async:**
- `async/await` throughout — no callbacks, no `.then()` chains
- No `Promise.all` on unbounded arrays — use batched concurrency (e.g., process 5 libraries at a time during fetch)

**Validation Timing:**
- Validate at system boundaries only:
  - Fetcher: validate adapter output (FetchResult) after each fetch
  - Fetcher: validate final bundle (registry + chunks) before writing
  - Server: validate registry.json on startup
  - Server: validate chunk frontmatter on index build (warn and skip invalid)
- No redundant validation of data flowing between internal functions within a package

**Import Organization (per file):**

```typescript
// 1. Node.js built-ins
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// 2. External dependencies
import { z } from 'zod/v4';
import { parse as parseToml } from 'smol-toml';

// 3. Workspace packages
import { RegistrySchema, type Registry } from '@offlinedocs/shared';

// 4. Local imports
import { buildIndex } from './search-index.ts';
```

### Enforcement Guidelines

**All AI Agents MUST:**
1. Use package-name imports for cross-package references (load-bearing)
2. Export through barrel `index.ts` only (load-bearing)
3. Use Result pattern in adapters, try/catch in MCP handlers (load-bearing)
4. Follow the naming conventions table for new files, functions, and types
5. Co-locate unit tests; put integration tests in `__tests__/integration/`
6. Never write to stdout in server package (MCP stdio corruption)
7. Use `path.posix.join()` for bundle paths, `path.join()` for local filesystem only

**Pattern Violations:**
- Load-bearing violations: caught by TypeScript compiler (path resolution) and CI (integration tests)
- Convention violations: caught in code review
- Patterns may be updated via PR to the architecture document with rationale for the change

## Project Structure & Boundaries

### Requirements to Structure Mapping

| FR Category | Package | Key Directories |
|-------------|---------|----------------|
| Online Fetcher (FR-1–FR-4) | `packages/fetcher/` | `adapters/`, `chunk-processor/`, `bundle-writer/`, `config/` |
| Doc Bundle Format (FR-5–FR-7) | `packages/shared/` | `schemas/` (registry, frontmatter, config), `errors.ts`, `constants.ts` |
| Offline MCP Server (FR-8–FR-11) | `packages/server/` | `tools/`, `search/`, `mcp-server.ts`, `registry-loader.ts` |
| Team Sync Workflow (FR-12–FR-13) | Cross-cutting | Config schema in shared, CLI in fetcher, restart = server reload |

### Complete Project Directory Structure

```
offlinedocs/
│
│  ── Root Configuration ──────────────────────────────────────
├── package.json                    # Root workspace: scripts, engines (>=22), name
├── pnpm-workspace.yaml             # packages: ['packages/*']
├── pnpm-lock.yaml                  # Lock file (committed)
├── .npmrc                          # pnpm config: shamefully-hoist=false
├── tsconfig.base.json              # Shared TS config: strict, NodeNext, paths
├── vitest.workspace.ts             # References packages/*/vitest.config.ts
├── .node-version                   # Node.js 24 (target LTS)
├── .gitignore                      # dist/, node_modules/, *.tgz, .env
├── LICENSE
├── README.md                       # Setup, config, airgap workflow docs
│
│  ── CI/CD ───────────────────────────────────────────────────
├── .github/
│   └── workflows/
│       └── ci.yml                  # Matrix: ubuntu+windows × Node 22+24
│
│  ── Generated Artifacts (gitignored) ────────────────────────
├── schemas/                        # Generated JSON Schema (checked in)
│   └── registry.schema.json        # From Zod via .toJSONSchema()
│
│  ── Packages ────────────────────────────────────────────────
├── packages/
│   │
│   │  ════════════════════════════════════════════════════════
│   │  SHARED — The architectural keystone
│   │  Both fetcher and server depend on this package.
│   │  Contains all format contracts, error types, constants.
│   │  ════════════════════════════════════════════════════════
│   ├── shared/
│   │   ├── package.json            # @offlinedocs/shared, private:true, type:module
│   │   ├── tsconfig.json           # Extends ../../tsconfig.base.json
│   │   ├── tsup.config.ts          # ESM + CJS dual output
│   │   ├── vitest.config.ts
│   │   └── src/
│   │       ├── index.ts            # Barrel: public API only
│   │       │
│   │       ├── schemas/
│   │       │   ├── registry.ts     # RegistrySchema + type Registry (z.infer)
│   │       │   ├── registry.test.ts
│   │       │   ├── frontmatter.ts  # FrontmatterSchema + type Frontmatter
│   │       │   ├── frontmatter.test.ts
│   │       │   ├── library-config.ts  # LibraryConfigSchema (TOML config file format)
│   │       │   └── library-config.test.ts
│   │       │
│   │       ├── errors.ts           # AdapterError class, AdapterErrorCode type (6 variants)
│   │       ├── errors.test.ts
│   │       ├── result.ts           # Result<T> type: { ok: true, data: T } | { ok: false, error: AdapterError }
│   │       ├── result.test.ts
│   │       └── constants.ts        # SEARCH_WEIGHTS, RETRY_BASE_MS, MAX_CHUNK_SIZE,
│   │                               # DEFAULT_MAX_TOKENS, BUNDLE_FORMAT_VERSION,
│   │                               # STALE_THRESHOLD_DAYS, SYNONYM_MAP
│   │
│   │  ════════════════════════════════════════════════════════
│   │  FETCHER — Online CLI tool (internet-connected machine)
│   │  Reads library config → fetches docs → writes Doc Bundle
│   │  ════════════════════════════════════════════════════════
│   ├── fetcher/
│   │   ├── package.json            # @offlinedocs/fetcher, type:module
│   │   │                           # bin: { "offlinedocs-fetch": "./dist/cli.js" }
│   │   │                           # deps: @offlinedocs/shared (workspace:^),
│   │   │                           #   commander, @11ty/gray-matter, smol-toml
│   │   ├── tsconfig.json
│   │   ├── tsup.config.ts          # Entry: [cli.ts, index.ts]
│   │   ├── vitest.config.ts
│   │   └── src/
│   │       ├── index.ts            # Library exports (testable without CLI)
│   │       │                       # Exports: fetchLibraries, writeBundle, loadConfig
│   │       ├── cli.ts              # CLI entrypoint (thin wrapper)
│   │       │                       # Commander.js arg parsing → calls library fns
│   │       │                       # ❌ No business logic here
│   │       │
│   │       ├── adapters/           # Source adapter implementations
│   │       │   ├── types.ts        # SourceAdapter interface, FetchResult, ValidationResult
│   │       │   ├── index.ts        # Barrel: re-exports all adapters + types
│   │       │   ├── llms-txt-adapter.ts
│   │       │   ├── llms-txt-adapter.test.ts
│   │       │   ├── github-adapter.ts
│   │       │   ├── github-adapter.test.ts
│   │       │   ├── context7-adapter.ts
│   │       │   └── context7-adapter.test.ts
│   │       │
│   │       ├── chunk-processor/    # Markdown splitting + frontmatter generation
│   │       │   ├── index.ts        # Barrel
│   │       │   ├── markdown-splitter.ts     # Splits by heading hierarchy, enforces 50KB
│   │       │   ├── markdown-splitter.test.ts
│   │       │   ├── frontmatter-generator.ts # Generates title, library, topics from content
│   │       │   └── frontmatter-generator.test.ts
│   │       │
│   │       ├── bundle-writer/      # Writes Doc Bundle to filesystem
│   │       │   ├── index.ts        # Barrel
│   │       │   ├── registry-writer.ts  # Writes registry.json with checksums
│   │       │   ├── registry-writer.test.ts
│   │       │   ├── chunk-writer.ts     # Writes chunk files to library subdirs
│   │       │   ├── chunk-writer.test.ts
│   │       │   ├── integrity.ts        # SHA-256 checksum generation
│   │       │   └── integrity.test.ts
│   │       │
│   │       ├── config/             # TOML config loading
│   │       │   ├── config-loader.ts    # Loads + validates libraries.toml via Zod
│   │       │   └── config-loader.test.ts
│   │       │
│   │       ├── progress.ts         # Per-library progress reporter (stdout)
│   │       ├── progress.test.ts
│   │       │
│   │       └── __tests__/
│   │           └── integration/
│   │               ├── fetch-and-write.test.ts  # Full fetch → write bundle flow
│   │               └── fixtures/
│   │                   ├── sample-config.toml    # Test TOML config
│   │                   ├── mock-llms-txt/        # Mock HTTP responses
│   │                   └── mock-github-docs/     # Mock GitHub content
│   │
│   │  ════════════════════════════════════════════════════════
│   │  SERVER — Offline MCP server (airgapped machine)
│   │  Reads Doc Bundle → builds search index → serves MCP tools
│   │  ════════════════════════════════════════════════════════
│   └── server/
│       ├── package.json            # @offlinedocs/server, type:module
│       │                           # bin: { "offlinedocs-server": "./dist/index.js" }
│       │                           # deps: @offlinedocs/shared (workspace:^),
│       │                           #   @modelcontextprotocol/sdk, @11ty/gray-matter
│       ├── tsconfig.json
│       ├── tsup.config.ts          # Entry: index.ts → single bundled output
│       ├── vitest.config.ts
│       └── src/
│           ├── index.ts            # Entrypoint: parses --bundle arg, starts MCP server
│           ├── mcp-server.ts       # MCP Server instantiation + tool registration
│           │                       # Isolated from index.ts for testability
│           │
│           ├── registry-loader.ts  # Loads + validates registry.json via Zod
│           ├── registry-loader.test.ts
│           │
│           ├── search/             # Search index + retrieval
│           │   ├── index.ts        # Barrel
│           │   ├── inverted-index.ts    # Builds in-memory index from chunks
│           │   ├── inverted-index.test.ts
│           │   ├── ranking.ts           # Weighted scoring, tie-breaking, token budget
│           │   └── ranking.test.ts
│           │
│           ├── tools/              # MCP tool implementations
│           │   ├── index.ts        # Barrel: exports both tool handlers
│           │   ├── resolve-library-id.ts
│           │   ├── resolve-library-id.test.ts
│           │   ├── query-docs.ts
│           │   └── query-docs.test.ts
│           │
│           └── __tests__/
│               └── integration/
│                   ├── mcp-tools.test.ts      # Spawn server, send JSON-RPC, assert
│                   ├── bundle-loading.test.ts  # Startup validation, corrupt bundle handling
│                   └── fixtures/
│                       └── test-bundle/        # Minimal valid Doc Bundle for testing
│                           ├── registry.json
│                           └── react/
│                               ├── getting-started.md
│                               └── hooks.md
│
│  ── Doc Bundle (output, gitignored unless committed) ────────
│  This is the filesystem boundary between fetcher and server.
│  Fetcher WRITES here. Server READS here. They never share runtime.
└── [doc-bundle/]                   # Default output path (configurable)
    ├── registry.json               # Registry manifest
    ├── libraries.toml              # Library config (optional, for portability)
    └── [library-id]/               # One directory per library
        ├── getting-started.md      # Topic-based chunks with frontmatter
        ├── api-reference.md
        └── hooks.md
```

### Architectural Boundaries

**Boundary 1: Shared → Fetcher + Server (compile-time)**

```
shared/src/schemas/ ──(import)──→ fetcher/src/bundle-writer/
                    ──(import)──→ server/src/registry-loader.ts
```

The `shared/` package defines the data contract. Both consumers import types and Zod schemas at compile time. No runtime coupling — `shared/` code is bundled into each consumer's output by tsup.

**Boundary 2: Fetcher → Doc Bundle → Server (filesystem, airgap)**

```
fetcher/ ──(writes)──→ [doc-bundle/] ──(copy via USB/share)──→ [doc-bundle/] ──(reads)──← server/
         online machine                   AIRGAP                              offline machine
```

This is the critical boundary. The Doc Bundle is a portable directory — the only artifact that crosses the airgap. Fetcher and server never run on the same machine in production. The `registry.json` schema is their only shared contract.

**Boundary 3: Server → Claude Code (MCP stdio protocol)**

```
server/src/mcp-server.ts ──(stdio: JSON-RPC)──→ Claude Code MCP client
```

The MCP protocol is the external interface. Server writes MCP responses to stdout, reads requests from stdin. All diagnostic output goes to stderr. No other communication channel.

**Boundary 4: Fetcher → Internet (HTTP, 3 source types)**

```
fetcher/src/adapters/llms-txt-adapter.ts  ──(HTTP GET)──→ llms.txt endpoints
fetcher/src/adapters/github-adapter.ts    ──(HTTP GET)──→ GitHub raw content / API
fetcher/src/adapters/context7-adapter.ts  ──(HTTP GET)──→ Context7 API
```

Each adapter encapsulates one source type. Adapters return `Result<FetchResult>` — errors are data, not exceptions. The adapter interface is the seam for testing (mock HTTP responses via fixtures).

### Data Flow

```
                    ONLINE                           │  AIRGAP  │           OFFLINE
                                                     │          │
 libraries.toml ──→ config-loader ──→ adapter-router │          │
                                         │           │          │
                          ┌──────────────┼───────────│──────────│─────────────────┐
                          │              ▼           │          │                 │
                          │     [adapter: fetch]     │          │                 │
                          │         │                │          │                 │
                          │         ▼                │          │                 │
                          │  chunk-processor         │          │                 │
                          │    (split + tag)          │          │                 │
                          │         │                │          │                 │
                          │         ▼                │          │                 │
                          │  bundle-writer           │          │                 │
                          │    (write + checksum)     │          │                 │
                          │         │                │          │                 │
                          │         ▼                │          │                 │
                          │  ┌─────────────┐         │          │  ┌───────────┐  │
                          │  │ Doc Bundle  │ ──(copy)─│──────────│─→│Doc Bundle │  │
                          │  │ registry.json│         │          │  │(identical)│  │
                          │  │ lib-a/       │         │          │  └─────┬─────┘  │
                          │  │ lib-b/       │         │          │        │        │
                          │  └─────────────┘         │          │        ▼        │
                          │                          │          │ registry-loader  │
                          │                          │          │   (validate)     │
                          │                          │          │        │        │
                          │                          │          │        ▼        │
                          │                          │          │  search-index    │
                          │                          │          │  (build index)   │
                          │                          │          │        │        │
                          │                          │          │        ▼        │
                          │                          │          │   mcp-server     │
                          │                          │          │  (stdio tools)   │
                          │                          │          │        │        │
                          └──────────────────────────│──────────│────────│────────┘
                                                     │          │        ▼
                                                     │          │   Claude Code
```

### Integration Points

**Internal Communication (within each package):**
- Function calls only — no event bus, no pub/sub, no message passing
- All cross-module communication is synchronous `import` + function call
- Async operations (`fetch`, `readFile`) use `async/await` at call sites

**External Integrations:**

| Integration | Package | Protocol | Auth |
|-------------|---------|----------|------|
| llms.txt endpoints | fetcher | HTTP GET | None |
| GitHub raw content | fetcher | HTTP GET | Optional `GITHUB_TOKEN` |
| GitHub REST API | fetcher | HTTP GET (fallback) | Optional `GITHUB_TOKEN` |
| Context7 API | fetcher | HTTP GET | None (public API) |
| Claude Code | server | MCP stdio (JSON-RPC) | None (local process) |

### Development Workflow Integration

**Local Development:**

```bash
# Install all dependencies
pnpm install

# Develop fetcher (watches for changes)
pnpm --filter @offlinedocs/fetcher dev

# Develop server (watches for changes)
pnpm --filter @offlinedocs/server dev

# Run all tests
pnpm test

# Run tests for one package
pnpm --filter @offlinedocs/shared test

# Build all packages
pnpm build

# Fetch docs (development)
pnpm --filter @offlinedocs/fetcher exec tsx src/cli.ts fetch --config ./libraries.toml

# Start MCP server (development)
pnpm --filter @offlinedocs/server exec tsx src/index.ts --bundle ./doc-bundle
```

**Build Process:**

```bash
# tsup builds each package independently
# shared → fetcher + server (shared must build first)
pnpm --filter @offlinedocs/shared build    # → packages/shared/dist/
pnpm --filter @offlinedocs/fetcher build   # → packages/fetcher/dist/cli.js
pnpm --filter @offlinedocs/server build    # → packages/server/dist/index.js
```

Build order matters: `shared` must build before `fetcher` and `server`. Root `package.json` script handles this: `"build": "pnpm --filter @offlinedocs/shared build && pnpm --filter @offlinedocs/{fetcher,server} build"`

**Distribution (what ships to users):**

```
# Fetcher (for online machine):
dist/cli.js              # Single bundled file
# Run: node cli.js fetch --config /path/to/libraries.toml

# Server (for airgapped machine):
dist/index.js            # Single bundled file
# Run: node index.js --bundle /path/to/doc-bundle
# Or configure in Claude Code: .claude/settings.json → mcpServers
```

No `node_modules` required at runtime. Both files are self-contained bundles produced by tsup.

## Architecture Validation Results

### Validation Issues Resolved

Three critical gaps were identified during validation and resolved before finalizing:

**RESOLVED — FR-3 Incremental Update Mechanism:**
Added `contentHash: string` (SHA-256 of raw fetched content) to each library entry in `registry.json`. On re-fetch, the Fetcher computes the hash of new source content before processing. If `contentHash` matches the existing entry, the library is skipped. The registry itself serves as the cache manifest — no separate lock file or cache store needed.

**RESOLVED — SHA-256 Target Clarification:**
Two distinct hash purposes now explicitly documented:
- `contentHash` (per library): SHA-256 of raw source content, used by Fetcher for incremental skip logic (FR-3)
- `checksums` (per chunk file): SHA-256 of each written chunk file, keyed by relative path, used by Server for bundle integrity verification (FR-5/FR-13)

These serve different purposes and coexist in `registry.json`.

**RESOLVED — FR-13 Atomic Bundle Swap Protocol:**
Specified mechanism: Fetcher writes updated bundle to a temp directory (`<bundle-path>.tmp/`), then performs an atomic directory rename (`rename('<bundle-path>.tmp', '<bundle-path>')` — atomic on both POSIX and Windows within the same volume). Server reads from the configured path only after restart. Write ownership is exclusive to the Fetcher; Server treats the bundle as read-only.

**RESOLVED — gray-matter / smol-toml Scope Clarification:**
- `@11ty/gray-matter`: parses YAML frontmatter in markdown doc chunks (used by both Fetcher writer and Server reader)
- `smol-toml`: parses `libraries.toml` config file (used by Fetcher only)
- These libraries serve different file formats and do not interact

### Coherence Validation

**Decision Compatibility:** ✅ PASS
- TypeScript + pnpm + tsup + vitest + Zod v4 + Commander.js + MCP SDK v1.29.0 + @11ty/gray-matter + smol-toml — all verified compatible
- No version conflicts detected; MCP SDK bundles its own Zod internally; tsup bundles each package independently so no deduplication issues
- Zod v4.4.3 pinned explicitly; MCP SDK ^1.29.0 with floor pin
- Node.js 22 minimum / 24 target covers both LTS lines

**Pattern Consistency:** ✅ PASS
- 3 load-bearing patterns (package imports, barrel exports, Result pattern) directly support the architectural decisions
- Naming conventions consistent across all examples (kebab files, camelCase code, PascalCase types)
- Error handling split (Result for adapters, try/catch for MCP) aligns with the two distinct failure contexts
- Dependency direction is strictly: `fetcher/` → `shared/` ← `server/` (never `shared/` → executable)

**Structure Alignment:** ✅ PASS
- Project tree maps directly to the 4 architectural boundaries
- Every FR category has a corresponding directory in the tree
- Integration points (Doc Bundle, MCP stdio, HTTP sources) are isolated in dedicated modules
- MCP transport: stdio only, no HTTP fallback — confirmed safe for airgapped environments

### Requirements Coverage Validation

**Functional Requirements Coverage:**

| FR | Status | Architectural Support |
|----|--------|----------------------|
| FR-1: Fetch from library list | ✅ | `fetcher/src/adapters/` + `cli.ts` + `config-loader.ts` |
| FR-2: Multiple sources (3 types) | ✅ | `llms-txt-adapter.ts`, `github-adapter.ts`, `context7-adapter.ts` |
| FR-3: Incremental updates | ✅ | `contentHash` in registry.json; hash comparison before re-fetch |
| FR-4: Configurable library list | ✅ | `libraries.toml` → `config-loader.ts` → `LibraryConfigSchema` |
| FR-5: Portable directory structure | ✅ | Doc Bundle format; forward-slash paths; OS-safe slugs; <200 char paths |
| FR-6: Registry manifest | ✅ | `registry.json` with Zod schema; `RegistrySchema` in shared/ |
| FR-7: Doc chunk structure | ✅ | `chunk-processor/`; frontmatter schema; 50KB max with heading-based splitting |
| FR-8: Library resolution tool | ✅ | `server/src/tools/resolve-library-id.ts`; input/output Zod schemas |
| FR-9: Documentation query tool | ✅ | `server/src/tools/query-docs.ts`; ranked matching; token budget; fallback |
| FR-10: Zero-config startup | ✅ | `node index.js --bundle /path` — single flag, no config file |
| FR-11: Claude Code integration | ✅ | MCP stdio transport; Context7-compatible tool names; settings.json config |
| FR-12: Shareable library config | ✅ | `libraries.toml` — human-editable, portable, version-controllable |
| FR-13: Bundle merge safety | ✅ | Atomic rename swap protocol; restart-to-reload; Server reads only |

**Non-Functional Requirements Coverage:**

| NFR | Status | Architectural Support |
|-----|--------|----------------------|
| Portability (Windows + Linux) | ✅ | Forward-slash paths; OS-safe slugs; CI matrix on both OSes |
| Performance (sub-5s startup, <200ms query) | ✅ | In-memory inverted index; pre-tokenized frontmatter |
| Simplicity (zero-config, human-readable) | ✅ | Single --bundle flag; TOML config; no database |
| Compatibility (MCP, Context7 parity) | ✅ | Matching tool names; compatible parameter shapes |
| Reliability (atomic replacement) | ✅ | Temp-dir + rename protocol; integrity checksums |
| Integrity (no drift) | ✅ | bundleFormatVersion; SHA-256 checksums; Zod validation |
| Auditability | ✅ | Plain markdown files; JSON registry; no binary blobs |

### Implementation Readiness Validation

**Decision Completeness:** ✅ PASS
- All 5 critical decisions documented with specific versions and rationale
- All 5 important decisions documented with trade-offs
- 5 deferred decisions explicitly listed with post-MVP timing
- Technology versions verified via web search (not hardcoded)

**Structure Completeness:** ✅ PASS
- ~50 files defined with annotations explaining purpose
- All barrel `index.ts` files present
- Integration test directories and fixtures specified for both packages
- Build order documented (shared first, then parallel)

**Pattern Completeness:** ✅ PASS
- 15 conflict points identified and resolved
- Load-bearing vs convention distinction made (per Winston's guidance)
- Concrete code examples for all major patterns (imports, exports, Result, error handling, logging)
- Anti-patterns documented alongside correct patterns

### Gap Analysis Results

**Critical Gaps:** None remaining (3 resolved during validation — see above)

**Important Gaps (non-blocking):**

| Gap | Impact | Recommendation |
|-----|--------|----------------|
| MCP SDK v2 migration path | Medium | Monitor SDK releases; v1.x supported 6 months post-v2 |
| Bundle size estimation | Low | Empirical testing needed with real libraries; PRD counter-metric SM-C1 says don't optimize at cost of completeness |
| Topic tag quality for retrieval | Medium | Implement basic extraction in v1; measure query satisfaction; improve iteratively |
| Standalone binary packaging | Low | Deferred to post-MVP; Node.js required on target for v1 |

**Nice-to-Have Gaps:**

| Gap | Recommendation |
|-----|----------------|
| ESLint/Biome configuration | Add after first 500 lines of real code, not at scaffold time |
| Pre-commit hooks (lint-staged) | Add when linter is configured |
| CHANGELOG generation | Add when first release ships |
| Contributing guide | Add when second contributor joins |

### Architecture Completeness Checklist

**Requirements Analysis**

- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**Architectural Decisions**

- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**Implementation Patterns**

- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**Project Structure**

- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

All 16 checklist items verified. No critical gaps remaining. Three gaps found during validation were resolved in-session.

**Confidence Level:** High

Based on:
- All 13 FRs have explicit architectural support with named files
- All NFRs have documented mechanisms
- Technology versions verified against current stable releases (May 2026)
- Risk profile comprehensive with mitigations for all identified risks
- Patterns tested against potential AI agent conflicts

**Key Strengths:**
- Bundle format as a formally specified API contract with versioning, JSON Schema, and Zod validation
- Clear separation of online (Fetcher) and offline (Server) components with no shared runtime
- Load-bearing patterns distinguish from style conventions — agents know what must not vary
- Complete file tree with annotations — no ambiguity about where code goes
- Data flow diagram makes the airgap boundary visible and obvious
- Validation resolved 3 gaps (incremental hash, integrity clarification, atomic swap) before handoff

**Areas for Future Enhancement:**
- Vector/semantic search when keyword matching proves insufficient (v2)
- Standalone binary packaging to eliminate Node.js requirement on target machines
- Hot-reload of bundle without server restart for faster iteration
- Auto-discovery of libraries from project dependency files
- HTML doc site scraping adapter for sources without llms.txt or GitHub markdown

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented
- Use implementation patterns consistently across all components
- Respect project structure and boundaries — files go where the tree says
- Use the load-bearing patterns (package imports, barrel exports, Result pattern) without exception
- Convention patterns are preferred but not blocking — focus on consistency within each package
- Refer to this document for all architectural questions before making independent choices

**First Implementation Priority:**
1. Scaffold the pnpm monorepo with all config files (package.json, tsconfig, pnpm-workspace.yaml, .npmrc, .node-version)
2. Create `packages/shared/` with Zod schemas (RegistrySchema, FrontmatterSchema, LibraryConfigSchema) and generate JSON Schema
3. Create `packages/server/` with MCP server instantiation and empty tool stubs
4. Create `packages/fetcher/` with CLI entrypoint and adapter interface
5. Write first integration test: Fetcher creates a minimal bundle → Server loads and serves a query

**Claude Code MCP Configuration (for end users):**

```jsonc
// .claude/settings.json
{
  "mcpServers": {
    "offlinedocs": {
      "command": "node",
      "args": ["/path/to/offlinedocs/server/dist/index.js", "--bundle", "/path/to/doc-bundle"]
    }
  }
}
```
