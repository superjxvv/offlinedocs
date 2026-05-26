---
stepsCompleted: [1, 2, 3, 4]
status: complete
completedAt: '2026-05-26'
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-workspace-2026-05-26/prd.md
  - _bmad-output/planning-artifacts/architecture.md
---

# OfflineDocs - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for OfflineDocs, decomposing the requirements from the PRD and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

FR-1: Fetch docs from a library list — The Fetcher reads a configuration file listing libraries and their documentation sources, fetches the docs, and writes them into the Doc Bundle. Given a config listing 3 libraries with valid sources, the Fetcher produces a Doc Bundle containing docs for all 3.

FR-2: Support multiple documentation sources — The Fetcher pulls docs from three source types: llms.txt endpoints, GitHub repository doc folders (raw markdown), and Context7's API. Each source type has a dedicated adapter.

FR-3: Incremental updates — The Fetcher updates an existing Doc Bundle without re-fetching unchanged libraries. Running twice with no source changes produces no file modifications. A `--force` flag re-fetches all.

FR-4: Configurable library list — A human-readable TOML config file that any team member can edit to add, remove, or update library sources. Invalid entries produce clear error messages.

FR-5: Portable directory structure — The Doc Bundle is a single directory (no database, no binary blobs) copyable via USB, file share, or any mechanism. All paths use OS-safe characters and stay under 200 characters. Targets Windows and Linux.

FR-6: Registry manifest — A single JSON file at the bundle root lists all available libraries and metadata (ID, name, version, source type, source URL, fetch date, description). The MCP Server uses this for lookups without scanning the filesystem.

FR-7: Doc chunk structure — The Fetcher splits each library's docs into topic-based markdown files with YAML frontmatter (title, library, topics). No chunk exceeds 50KB; oversized sections are split into numbered parts.

FR-8: Library resolution tool — The MCP Server exposes `resolve-library-id` that searches the Registry for libraries matching a name or query. Partial matches work. No match returns available libraries list.

FR-9: Documentation query tool — The MCP Server exposes `query-docs` that retrieves relevant doc chunks ranked by: (1) frontmatter topics, (2) title, (3) body keyword match. Returns concatenated markdown capped at configurable token limit (default 5000). Falls back to overview chunk if no matches.

FR-10: Zero-configuration startup — The MCP Server starts with `--bundle /path/to/docs` and serves queries within 5 seconds for 50 libraries. No database, no indexing step, no env vars beyond bundle path.

FR-11: Claude Code integration — Adding the MCP Server to `.claude/settings.json` enables tools in Claude Code. Tool names match Context7 (`resolve-library-id`, `query-docs`) for drop-in compatibility.

FR-12: Shareable library config — The library config lives at a well-known path within or alongside the Doc Bundle. Two team members editing the config and running the Fetcher produce consistent results.

FR-13: Bundle merge safety — Replacing a local Doc Bundle with an updated copy uses atomic directory rename. Restarting the MCP Server picks up changes without reconfiguration.

### NonFunctional Requirements

NFR-1: Cross-platform portability — Plain directory with OS-safe paths (<200 chars), forward-slash normalization, works on Windows and Linux.

NFR-2: Startup performance — MCP Server starts and serves queries within 5 seconds of startup for a bundle with 50 libraries (cold start, measured on both platforms).

NFR-3: Query latency — Sub-200ms response time for both `resolve-library-id` and `query-docs` MCP tools in offline operation.

NFR-4: Fetch performance — Full Doc Bundle refresh completes under 15 minutes for 50 libraries.

NFR-5: Simplicity — Zero-config server startup, human-readable TOML config, no databases or indexing steps required.

NFR-6: MCP protocol compliance — Standard MCP protocol via stdio transport, compatible with Claude Code's MCP client.

NFR-7: Context7 tool parity — Tool names, parameter shapes, and response shapes compatible with Context7's `resolve-library-id` and `query-docs` tools.

NFR-8: Bundle integrity — SHA-256 per-file checksums in registry manifest, file count validation, detects partial bundle transfers.

NFR-9: Auditability — Bundle contents must be inspectable (plain markdown files, JSON registry, no binary blobs) for security review by airgapped environment operators.

NFR-10: Reliability — Atomic bundle replacement via temp-dir + rename; no partial state on interrupted copy. Server fails fast on corrupt/missing bundle.

NFR-11: Staleness detection — Server warns at query time when library docs exceed configurable TTL (default 30 days). Warning annotates response, never blocks it.

### Additional Requirements

- Starter template: Manual pnpm monorepo scaffold with 3 packages (shared, fetcher, server) — no existing template fits
- Language: TypeScript with strict mode, ESM modules throughout
- Runtime: Node.js 24 target LTS, Node.js 22 minimum
- Monorepo: pnpm workspaces (no Turborepo)
- Build: tsup (wraps esbuild) producing single bundled .js files per package — no node_modules at runtime
- Schema validation: Zod v4 for runtime validation; types derived from schemas via z.infer<>
- Testing: vitest with @vitest/coverage-v8, 80% line coverage minimum, co-located unit tests
- CLI framework: Commander.js for Fetcher CLI
- MCP SDK: @modelcontextprotocol/sdk@^1.29.0, stdio transport
- Frontmatter parser: @11ty/gray-matter ^2.0.2
- TOML parser: smol-toml (zero-dependency, TOML 1.1.0)
- HTTP client: Node.js built-in fetch (no external dependency)
- Retry strategy: Exponential backoff with jitter (2 retries CDN, 3 retries API)
- CI: GitHub Actions matrix — ubuntu + windows x Node 22 + 24
- Distribution: Both components ship as single compiled .js files; no node_modules needed at runtime
- Shared package is private:true, never published; serves as architectural keystone
- Build order: shared first, then fetcher + server in parallel
- Logging: Server uses stderr only (stdout reserved for MCP stdio); Fetcher uses stdout for progress
- Integrity: Node.js built-in crypto module for SHA-256 checksums
- JSON Schema: Generated from Zod schemas and checked into repo
- README documentation: User-facing README covering setup, configuration, library config format, airgap transfer workflow, and Claude Code MCP server configuration

### UX Design Requirements

N/A — CLI-only project, no UX design document.

### FR Coverage Map

| FR | Epic | Description |
|----|------|-------------|
| FR-1 | Epic 2 (Story 2.7) | Fetch docs from library list |
| FR-2 | Epic 2 (Stories 2.2, 2.3, 2.4) | Multiple documentation sources (3 adapters) |
| FR-3 | Epic 2 (Story 2.7) | Incremental updates (contentHash skip) |
| FR-4 | Epic 2 (Story 2.1) | Configurable library list (TOML) |
| FR-5 | Epic 1 (Story 1.1) + Epic 2 (Story 2.6) | Portable directory structure (schema + writer) |
| FR-6 | Epic 1 (Story 1.2) + Epic 2 (Story 2.6) | Registry manifest (schema + writer) |
| FR-7 | Epic 1 (Story 1.2) + Epic 2 (Story 2.5) | Doc chunk structure (schema + splitter) |
| FR-8 | Epic 3 (Story 3.3) | Library resolution tool |
| FR-9 | Epic 3 (Stories 3.2, 3.3) | Documentation query tool (index + tool) |
| FR-10 | Epic 3 (Stories 3.1, 3.3) | Zero-configuration startup |
| FR-11 | Epic 3 (Story 3.3) | Claude Code integration |
| FR-12 | Epic 2 (Story 2.1) | Shareable library config |
| FR-13 | Epic 2 (Story 2.6) | Bundle merge safety (atomic swap) |

## Epic List

### Epic 1: Project Foundation & Bundle Format Contract
Establish the monorepo, define all shared data contracts (Registry, Frontmatter, LibraryConfig schemas), and create the architectural keystone that both Fetcher and Server depend on. After this epic, all format contracts are testable and the bundle structure is formally specified.
**FRs covered:** FR-5, FR-6, FR-7 (schema definition)
**NFRs addressed:** NFR-1, NFR-8, NFR-9

### Epic 2: Online Doc Fetching & Bundle Creation
Any team member can run the Fetcher CLI to pull docs from 3 source types (llms.txt, GitHub, Context7), split them into topic-based chunks, produce a portable Doc Bundle with integrity checksums, update incrementally, and share the TOML config with the team.
**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-7 (chunk splitting), FR-12, FR-13
**NFRs addressed:** NFR-4, NFR-10

### Epic 3: Offline MCP Server & Production Readiness
Developers query library docs offline through Claude Code with Context7-compatible tools. The server builds an in-memory search index at startup, ranks results by topic/title/body relevance, and manages token budgets. Staleness warnings keep the team aware of aging docs. CI validates cross-platform compatibility. README enables new team members to onboard in under 5 minutes.
**FRs covered:** FR-8, FR-9, FR-10, FR-11
**NFRs addressed:** NFR-2, NFR-3, NFR-5, NFR-6, NFR-7, NFR-11

---

## Epic 1: Project Foundation & Bundle Format Contract

Establish the monorepo, define all shared data contracts, and create the architectural keystone that both Fetcher and Server depend on.

### Story 1.1: Monorepo Scaffold & Build Pipeline

As a developer,
I want a properly configured pnpm monorepo with TypeScript, build tools, and test infrastructure,
So that I have a working foundation to build OfflineDocs components.

**Acceptance Criteria:**

**Given** a fresh clone of the repository
**When** I run `pnpm install`
**Then** all dependencies install without errors
**And** the workspace contains three packages: @offlinedocs/shared, @offlinedocs/fetcher, @offlinedocs/server

**Given** the monorepo is installed
**When** I run `pnpm build`
**Then** tsup compiles all three packages with shared building first
**And** each package produces output in its dist/ directory

**Given** the monorepo is installed
**When** I run `pnpm test`
**Then** vitest runs across all packages via vitest.workspace.ts with zero errors

**Given** the root package.json
**When** I inspect the engines field
**Then** it requires Node.js >=22
**And** .node-version specifies Node.js 24

**Given** each package's tsconfig.json
**When** I inspect it
**Then** it extends tsconfig.base.json with strict: true, module: NodeNext, moduleResolution: NodeNext

**Given** pnpm-workspace.yaml
**When** I read it
**Then** it declares `packages: ['packages/*']`

**Given** .npmrc
**When** I read it
**Then** it sets shamefully-hoist=false

**Given** each package's package.json
**When** I inspect it
**Then** it has `"type": "module"` and an `exports` field mapping `.` to dist output

### Story 1.2: Bundle Format Schemas & Shared Types

As a developer,
I want all shared data contracts, error types, and constants defined in the shared package,
So that both Fetcher and Server have a single source of truth for the bundle format.

**Acceptance Criteria:**

**Given** the RegistrySchema
**When** I validate a complete registry object
**Then** it passes with bundleFormatVersion (integer), libraries[] (each with id, name, description, sourceType, sourceUrl, lastFetched, contentHash, chunkCount, checksums), fileCount, and generatedAt

**Given** the RegistrySchema
**When** I validate an object missing bundleFormatVersion
**Then** it fails with a descriptive Zod error

**Given** the FrontmatterSchema
**When** I validate chunk frontmatter
**Then** it requires title (string), library (string), topics (string[])
**And** accepts optional part (number)

**Given** the LibraryConfigSchema
**When** I validate a library config entry
**Then** it requires id, name, sourceType (one of "llms-txt", "github", "context7"), and sourceUrl

**Given** AdapterError class
**When** I construct one with code "RATE_LIMITED", libraryId "react", and a message
**Then** it has all fields accessible including optional cause

**Given** the AdapterErrorCode type
**When** I inspect it
**Then** it includes exactly: NETWORK, AUTH_REQUIRED, RATE_LIMITED, FORMAT_CHANGED, EMPTY_RESPONSE, CONFIG_INVALID

**Given** the Result<T> type
**When** I use ok(data)
**Then** it returns `{ ok: true, data: T }`
**And** when I use err(error) it returns `{ ok: false, error: AdapterError }`

**Given** the constants module
**When** I import it
**Then** SEARCH_WEIGHTS, RETRY_BASE_MS, MAX_CHUNK_SIZE (50KB), DEFAULT_MAX_TOKENS (5000), BUNDLE_FORMAT_VERSION (1), STALE_THRESHOLD_DAYS (30), and SYNONYM_MAP are all exported

**Given** shared/src/index.ts
**When** I import from @offlinedocs/shared
**Then** all public types, schemas, errors, Result, and constants are accessible via the barrel export

**Given** each schema and type
**When** I run the co-located unit tests
**Then** all valid inputs pass and invalid inputs fail with descriptive errors

### Story 1.3: JSON Schema Generation & Bundle Validation Helpers

As a developer,
I want JSON Schema generated from Zod schemas and bundle validation utilities,
So that the bundle format is formally specified and both components can validate bundles at their boundaries.

**Acceptance Criteria:**

**Given** the RegistrySchema
**When** I run the schema generation script
**Then** schemas/registry.schema.json is produced at the repo root matching the Zod schema structure

**Given** a valid Doc Bundle directory with correct registry.json, matching fileCount, and valid checksums
**When** I call validateBundle(bundlePath)
**Then** it returns `{ valid: true, errors: [], warnings: [] }`

**Given** a bundle with fileCount of 10 but only 8 chunk files on disk
**When** I call validateBundle(bundlePath)
**Then** it returns `{ valid: false }` with an error describing the file count mismatch

**Given** a bundle with a chunk file whose SHA-256 doesn't match the registry checksum
**When** I call validateBundle(bundlePath)
**Then** it returns `{ valid: false }` with an error identifying the affected file path

**Given** a path string with backslashes (e.g., `react\hooks.md`)
**When** I call normalizeBundlePath()
**Then** it returns `react/hooks.md` (forward-slash normalized)

**Given** the generated JSON Schema file
**When** I check it into the repo
**Then** it lives at schemas/registry.schema.json

---

## Epic 2: Online Doc Fetching & Bundle Creation

Any team member can run the Fetcher CLI to pull docs from 3 source types, produce a portable Doc Bundle, update incrementally, and share the config.

### Story 2.1: TOML Config Loader

As a Fetcher operator,
I want to define my library list in a human-readable TOML config file,
So that I can easily add, remove, or update library documentation sources.

**Acceptance Criteria:**

**Given** a valid libraries.toml with 3 library entries of different source types
**When** I load it via config-loader
**Then** it returns 3 validated LibraryConfig objects matching the LibraryConfigSchema

**Given** a TOML entry with `sourceType = "llms-txt"` and a sourceUrl
**When** I validate it
**Then** it passes validation

**Given** a TOML entry with `sourceType = "github"` with repo and path fields
**When** I validate it
**Then** it passes validation

**Given** a TOML entry with `sourceType = "context7"` with a libraryId
**When** I validate it
**Then** it passes validation

**Given** a TOML file with a missing required field (e.g., no sourceUrl)
**When** I load it
**Then** it returns an AdapterError with code CONFIG_INVALID naming the problematic entry and field

**Given** a malformed TOML file with syntax errors
**When** I load it
**Then** it returns an AdapterError with code CONFIG_INVALID and a clear parse error message

**Given** the config-loader implementation
**When** I inspect its parser dependency
**Then** it uses smol-toml

### Story 2.2: Source Adapter Interface & llms.txt Adapter

As a Fetcher operator,
I want to fetch documentation from llms.txt endpoints,
So that I can include libraries that publish their docs in the llms.txt format.

**Acceptance Criteria:**

**Given** the SourceAdapter interface in adapters/types.ts
**When** I inspect it
**Then** it declares `readonly sourceType`, `fetch(config: LibraryConfig): Promise<Result<FetchResult>>`, and `validate(result: FetchResult): ValidationResult`

**Given** a valid llms.txt URL that returns documentation content
**When** I call the llms-txt adapter's fetch()
**Then** it returns `{ ok: true, data: { chunks: DocChunk[], metadata: { fetchedAt: string } } }`

**Given** a URL that returns HTTP 404
**When** I call fetch()
**Then** it returns `{ ok: false, error: AdapterError }` with code NETWORK

**Given** a URL that returns HTTP 429
**When** I call fetch()
**Then** it retries with exponential backoff (2 retries, RETRY_BASE_MS=1000ms, ±200ms jitter)
**And** returns err with code RATE_LIMITED if still failing after retries

**Given** a URL that returns HTTP 200 but empty content
**When** I call fetch()
**Then** it returns err with code EMPTY_RESPONSE

**Given** a successful fetch result
**When** I call validate()
**Then** it checks chunks are non-empty and returns `{ valid: boolean, errors: string[], warnings: string[] }`

**Given** the adapter implementation
**When** I inspect its HTTP client
**Then** it uses Node.js built-in fetch (no external HTTP library)

### Story 2.3: GitHub Source Adapter

As a Fetcher operator,
I want to fetch documentation from GitHub repository markdown folders,
So that I can include libraries that maintain their docs on GitHub.

**Acceptance Criteria:**

**Given** a config entry pointing to a public repo docs/ folder
**When** I call the github adapter's fetch()
**Then** it returns ok with DocChunk[] containing all markdown files from that folder

**Given** a public repo
**When** the adapter fetches content
**Then** it uses raw.githubusercontent.com URLs (no auth, no API rate limits)

**Given** a private repo or rate-limited response and GITHUB_TOKEN is set in the environment
**When** I call fetch()
**Then** it falls back to the GitHub REST API with the token for authentication

**Given** no GITHUB_TOKEN and a 403 response from raw URLs
**When** I call fetch()
**Then** it returns err with code AUTH_REQUIRED

**Given** a repo where the configured docs path doesn't exist
**When** I call fetch()
**Then** it returns err with code FORMAT_CHANGED

**Given** a successful fetch
**When** I call validate()
**Then** all chunks have non-empty content

**Given** the adapter
**When** it encounters transient failures
**Then** it retries with 2 retries, exponential backoff, and ±200ms jitter

### Story 2.4: Context7 Source Adapter

As a Fetcher operator,
I want to fetch documentation from Context7's API for initial seeding,
So that I can bootstrap my Doc Bundle with comprehensive library docs.

**Acceptance Criteria:**

**Given** a config entry with sourceType "context7" and a valid library ID
**When** I call the context7 adapter's fetch()
**Then** it returns ok with DocChunk[] parsed from the API response

**Given** an invalid or non-existent Context7 library ID
**When** I call fetch()
**Then** it returns err with code FORMAT_CHANGED

**Given** a network timeout or connection failure
**When** I call fetch()
**Then** it retries 3 times (MAX_RETRIES_API) with exponential backoff and ±200ms jitter
**And** returns err with code NETWORK if still failing

**Given** a successful fetch result
**When** I call validate()
**Then** all chunks contain valid markdown content

**Given** the adapter implementation
**When** I inspect its HTTP client
**Then** it uses Node.js built-in fetch

### Story 2.5: Chunk Processor

As a Fetcher operator,
I want fetched documentation split into topic-based markdown chunks with frontmatter,
So that each chunk is a focused, searchable unit within the Doc Bundle.

**Acceptance Criteria:**

**Given** a markdown document with multiple H2 headings
**When** I run the markdown splitter
**Then** each H2 section becomes a separate chunk with a kebab-case filename derived from the heading

**Given** a single chunk that exceeds 50KB
**When** I split it
**Then** it produces numbered parts (e.g., `api-reference-1.md`, `api-reference-2.md`) each under 50KB

**Given** a markdown document with no heading structure
**When** I split it
**Then** it falls back to paragraph-based splitting at the 50KB boundary

**Given** a chunk
**When** frontmatter is generated
**Then** it includes `title` (from the heading or filename), `library` (the library ID), and `topics` (extracted keyword tags relevant to the content)

**Given** generated chunk filenames
**When** I inspect them
**Then** they use kebab-case, OS-safe characters, and stay under 200 character path length

**Given** a small document under 50KB with a single section
**When** I process it
**Then** it remains as a single chunk file

**Given** the chunk processor
**When** it generates frontmatter
**Then** it uses @11ty/gray-matter for serialization

### Story 2.6: Bundle Writer with Integrity & Atomic Swap

As a Fetcher operator,
I want the Doc Bundle written atomically with integrity checksums,
So that bundles are never left in a partial state and transfers can be verified.

**Acceptance Criteria:**

**Given** processed chunks for 3 libraries
**When** I call writeBundle()
**Then** it creates a directory with registry.json at the root and one subdirectory per library containing chunk markdown files

**Given** written chunk files
**When** I inspect registry.json checksums field for each library
**Then** each entry has SHA-256 hashes keyed by relative forward-slash path for every chunk file

**Given** registry.json
**When** I check the fileCount field
**Then** it matches the actual number of chunk files across all library subdirectories

**Given** each library entry in registry.json
**When** I check the contentHash field
**Then** it contains the SHA-256 hash of the raw fetched source content (for incremental skip logic)

**Given** an existing bundle at the target path
**When** I call writeBundle() with updated content
**Then** it writes to `<bundle-path>.tmp/` first, then atomically renames to `<bundle-path>`

**Given** an interrupted write (process killed during .tmp writing)
**When** I inspect the filesystem
**Then** the original bundle at `<bundle-path>` is still intact

**Given** the registry.json generatedAt field
**When** I inspect it
**Then** it contains an ISO 8601 UTC timestamp (e.g., `2026-05-26T12:00:00.000Z`)

**Given** the integrity module
**When** I inspect its dependencies
**Then** it uses Node.js built-in `crypto` module for SHA-256 (no external library)

### Story 2.7: Fetcher CLI with Incremental Updates & Progress Reporting

As a Fetcher operator,
I want a CLI tool that fetches docs incrementally with clear progress feedback,
So that I can efficiently update the Doc Bundle and know which libraries succeeded or failed.

**Acceptance Criteria:**

**Given** a valid libraries.toml config
**When** I run `offlinedocs-fetch fetch --config libraries.toml`
**Then** it fetches all configured libraries and writes a Doc Bundle to the default output path

**Given** the --bundle-path flag
**When** I run `offlinedocs-fetch fetch --config libraries.toml --bundle-path ./my-docs`
**Then** the bundle is written to `./my-docs`

**Given** an existing bundle where some libraries haven't changed (contentHash matches)
**When** I run fetch without --force
**Then** unchanged libraries are skipped and their existing chunks are preserved

**Given** the --force flag
**When** I run fetch with --force
**Then** all libraries are re-fetched regardless of existing contentHash

**Given** the fetch is running
**When** I observe stdout
**Then** I see per-library progress lines like `[1/50] react ... fetching → done (23 chunks)`

**Given** a library that fails during fetch
**When** I observe stdout
**Then** I see a line like `[2/50] express ... FAILED (RATE_LIMITED) — skipped`
**And** the fetch continues with remaining libraries (does not abort)

**Given** the fetch completes
**When** I observe the summary line
**Then** I see `Fetched: N | Failed: N | Skipped (unchanged): N | Duration: Xm Xs`

**Given** the CLI source code
**When** I inspect cli.ts
**Then** it contains only Commander.js argument parsing that calls library functions exported from index.ts
**And** no business logic lives in cli.ts

---

## Epic 3: Offline MCP Server & Production Readiness

Developers query library docs offline through Claude Code with Context7-compatible tools. CI validates cross-platform compatibility. README enables fast onboarding.

### Story 3.1: Registry Loader & Bundle Startup Validation

As an Offline Developer,
I want the MCP Server to validate the Doc Bundle at startup,
So that I'm immediately told if the bundle is corrupt or missing rather than getting silent failures.

**Acceptance Criteria:**

**Given** a valid bundle path with correct registry.json
**When** the server starts
**Then** it loads and validates registry.json against RegistrySchema successfully

**Given** a registry.json with wrong bundleFormatVersion (e.g., 99)
**When** the server starts
**Then** it exits with a clear error message stating the expected vs actual version

**Given** a bundle path with no registry.json file
**When** the server starts
**Then** it exits with a clear error message: registry.json not found at the specified path

**Given** a bundle where registry.json fileCount says 20 but only 15 chunk files exist
**When** the server starts
**Then** it exits with an error reporting the file count discrepancy

**Given** the --skip-integrity flag
**When** the server starts
**Then** it skips SHA-256 checksum verification for faster startup during development

**Given** a valid bundle without --skip-integrity
**When** the server starts
**Then** it verifies SHA-256 checksums for all chunk files against the registry

**Given** a chunk file with invalid or unparseable frontmatter
**When** the server loads chunks for indexing
**Then** it logs a warning to stderr and skips the invalid chunk (does not crash)

### Story 3.2: In-Memory Search Index & Ranking Algorithm

As an Offline Developer,
I want fast, relevance-ranked search across library documentation,
So that Claude Code returns the most useful doc sections for my queries.

**Acceptance Criteria:**

**Given** a loaded bundle with chunks from multiple libraries
**When** the in-memory inverted index is built at startup
**Then** it tokenizes content by splitting on whitespace + punctuation, lowercasing, and deduplicating per chunk

**Given** indexed chunks
**When** I query "useEffect cleanup" against the React library
**Then** chunks with "useEffect" or "cleanup" in their frontmatter topics score 3 points per matching term

**Given** indexed chunks
**When** a query term matches a chunk's frontmatter title
**Then** it scores 2 points per matching term

**Given** indexed chunks
**When** a query term matches only in the markdown body text
**Then** it scores 1 point per matching term

**Given** two chunks with equal total scores
**When** they are ranked
**Then** they maintain stable sort order (alphabetical by file path within the library)

**Given** a query containing the term "auth"
**When** synonym expansion runs
**Then** the query also searches for "authentication" and "authorization" from the SYNONYM_MAP

**Given** SEARCH_WEIGHTS
**When** I inspect the exported constant
**Then** it defines `{ topics: 3, title: 2, body: 1 }` in a single config object

**Given** a query with maxTokens=5000 and 10 matching chunks
**When** chunks are assembled into the response
**Then** whole chunks are included in ranked order until the 5000-token budget is exhausted

**Given** the highest-ranked chunk alone exceeds maxTokens
**When** it is the top result
**Then** it is returned anyway (top-chunk exception) with `truncated: true`

**Given** the index build
**When** I measure startup time for ~1000 chunks
**Then** it completes within approximately 1 second (well within the 5-second startup budget)

### Story 3.3: MCP Server with resolve-library-id & query-docs Tools

As an Offline Developer,
I want Claude Code to resolve libraries and query their docs through MCP tools,
So that I get current library documentation answers without internet access.

**Acceptance Criteria:**

**Given** the MCP Server started with `--bundle /path/to/docs`
**When** it initializes
**Then** it registers `resolve-library-id` and `query-docs` tools via stdio transport using @modelcontextprotocol/sdk

**Given** resolve-library-id called with name "react"
**When** the library exists in the registry
**Then** it returns `{ id, name, description, version?, lastFetched }` matching the ResolveSuccess shape

**Given** resolve-library-id called with name "next"
**When** the registry contains "Next.js"
**Then** it matches via partial, case-insensitive comparison and returns the Next.js entry

**Given** resolve-library-id called with a name that doesn't match any library
**When** the tool responds
**Then** it returns `{ error, code: "LIBRARY_NOT_FOUND", availableLibraries: [{ id, name }...] }`

**Given** query-docs called with libraryId "react" and query "hooks"
**When** matching chunks exist
**Then** it returns `{ content, chunks: [{ title, file, score, byteSize }...], truncated, tokenCount, libraryId, query }`

**Given** query-docs called with a query that matches no chunks
**When** a getting-started.md chunk exists for the library
**Then** it returns the getting-started chunk as fallback

**Given** query-docs called with a query that matches no chunks and no getting-started exists
**When** the library has a description in the registry
**Then** it returns the library description as minimal context

**Given** query-docs called with a libraryId not in the bundle
**When** the tool responds
**Then** it returns `{ error, code: "LIBRARY_NOT_FOUND", availableLibraries: [{ id, name }...] }`

**Given** a library with lastFetched older than 30 days (default STALE_THRESHOLD_DAYS)
**When** query-docs is called for that library
**Then** the response content is prepended with `> ⚠️ These docs were fetched {N} days ago and may be outdated.\n\n`
**And** the actual documentation content still follows (warning annotates, never blocks)

**Given** the server started with `--stale-threshold-days 14`
**When** a library was fetched 20 days ago
**Then** the staleness warning appears in the response

**Given** the MCP Server is running
**When** all diagnostic logging occurs
**Then** it goes to stderr only (stdout is reserved exclusively for MCP stdio JSON-RPC transport)

### Story 3.4: CI Pipeline & Cross-Platform Validation

As a developer,
I want automated CI that validates OfflineDocs on Windows and Linux with Node 22 and 24,
So that cross-platform issues are caught before merge.

**Acceptance Criteria:**

**Given** a push or pull request to any branch
**When** CI runs
**Then** it executes on a matrix of ubuntu-latest + windows-latest × Node.js 22 + 24

**Given** the CI pipeline
**When** the build step runs
**Then** shared builds first, followed by fetcher and server

**Given** the CI pipeline
**When** the test step runs
**Then** all unit and integration tests pass on all 4 matrix combinations

**Given** cross-platform path tests
**When** run on Windows
**Then** bundle paths with forward-slash normalization are handled correctly

**Given** a bundle created on ubuntu in CI
**When** integrity is validated on windows (or vice versa)
**Then** SHA-256 checksums and fileCount match across platforms

### Story 3.5: README & User Documentation

As a new team member,
I want clear documentation for setting up and using OfflineDocs,
So that I can onboard in under 5 minutes following the README alone.

**Acceptance Criteria:**

**Given** the README
**When** I read the quick-start section
**Then** it explains prerequisites (Node.js >=22), installation (`pnpm install`), and building (`pnpm build`)

**Given** the README
**When** I read the configuration section
**Then** it documents the libraries.toml format with examples for all 3 source types (llms-txt, github, context7)

**Given** the README
**When** I read the fetcher usage section
**Then** it explains how to run the Fetcher CLI with common flags: `--config`, `--force`, `--bundle-path`

**Given** the README
**When** I read the airgap transfer workflow section
**Then** it explains the complete transfer process step by step: fetch on online machine → copy bundle to airgapped machine → restart MCP Server

**Given** the README
**When** I read the Claude Code setup section
**Then** it shows the exact `.claude/settings.json` MCP server configuration block with the correct command and args

**Given** the README
**When** I read the troubleshooting section
**Then** it covers: missing or corrupt bundle errors, stale docs warning, tool name collision with Context7 (mutual exclusivity guidance)

**Given** a new team member following only the README
**When** they complete all steps (copy bundle, configure settings.json, start Claude Code)
**Then** the MCP Server runs and both tools are available in Claude Code
