# Story 2.6: Bundle Writer with Integrity & Atomic Swap

Status: done
baseline_commit: 46341a46c2a8e43b90ae2eeaf02bdef4875c0f79

## Story

As a Fetcher operator,
I want the Doc Bundle written atomically with integrity checksums,
so that bundles are never left in a partial state and transfers can be verified.

## Acceptance Criteria

1. **Given** processed chunks for 3 libraries, **When** I call writeBundle(), **Then** it creates a directory with registry.json at the root and one subdirectory per library containing chunk markdown files.

2. **Given** written chunk files, **When** I inspect registry.json checksums field for each library, **Then** each entry has SHA-256 hashes keyed by relative forward-slash path for every chunk file.

3. **Given** registry.json, **When** I check the fileCount field, **Then** it matches the actual number of chunk files across all library subdirectories.

4. **Given** each library entry in registry.json, **When** I check the contentHash field, **Then** it contains the SHA-256 hash of the raw fetched source content (for incremental skip logic).

5. **Given** an existing bundle at the target path, **When** I call writeBundle() with updated content, **Then** it writes to `<bundle-path>.tmp/` first, then atomically renames to `<bundle-path>`.

6. **Given** an interrupted write (process killed during .tmp writing), **When** I inspect the filesystem, **Then** the original bundle at `<bundle-path>` is still intact.

7. **Given** the registry.json generatedAt field, **When** I inspect it, **Then** it contains an ISO 8601 UTC timestamp (e.g., `2026-05-26T12:00:00.000Z`).

8. **Given** the integrity module, **When** I inspect its dependencies, **Then** it uses Node.js built-in `crypto` module for SHA-256 (no external library).

## Tasks / Subtasks

- [x] Task 1: Implement integrity module (AC: #2, #4, #8)
  - [x] Create `packages/fetcher/src/bundle-writer/integrity.ts`
  - [x] `computeChecksum(content: Buffer | string): string` — SHA-256 hex digest using `node:crypto`
  - [x] `computeContentHash(rawContent: string): string` — SHA-256 of raw fetched source for incremental skip
  - [x] Create `packages/fetcher/src/bundle-writer/integrity.test.ts`

- [x] Task 2: Implement chunk writer (AC: #1, #2)
  - [x] Create `packages/fetcher/src/bundle-writer/chunk-writer.ts`
  - [x] `writeChunks(bundlePath: string, libraryId: string, chunks: ProcessedChunk[]): Promise<ChunkWriteResult>` — writes chunk files to `{bundlePath}/{libraryId}/` subdirectory
  - [x] Return checksums map: `Record<string, string>` keyed by `{libraryId}/{filename}` (forward-slash, via `path.posix.join`)
  - [x] Create `packages/fetcher/src/bundle-writer/chunk-writer.test.ts`

- [x] Task 3: Implement registry writer (AC: #1, #3, #4, #7)
  - [x] Create `packages/fetcher/src/bundle-writer/registry-writer.ts`
  - [x] `writeRegistry(bundlePath: string, libraries: LibraryWriteInput[]): Promise<void>` — writes `registry.json`
  - [x] Populate `bundleFormatVersion` from `BUNDLE_FORMAT_VERSION` constant
  - [x] Populate `fileCount` by summing `chunkCount` across all libraries
  - [x] Populate `generatedAt` with `new Date().toISOString()` (UTC)
  - [x] Validate output against `RegistrySchema` before writing
  - [x] Create `packages/fetcher/src/bundle-writer/registry-writer.test.ts`

- [x] Task 4: Implement atomic bundle writer with temp-dir + rename (AC: #1, #5, #6)
  - [x] Create `packages/fetcher/src/bundle-writer/bundle-writer.ts`
  - [x] `writeBundle(bundlePath: string, libraries: BundleWriteInput[]): Promise<void>`
  - [x] Write to `<bundlePath>.tmp/` first (create temp dir)
  - [x] Write all chunk files via chunk-writer into temp dir
  - [x] Write registry.json via registry-writer into temp dir
  - [x] If existing bundle at `bundlePath`, remove it, then rename `.tmp` to `bundlePath`
  - [x] Clean up `.tmp` dir on failure (best-effort)
  - [x] Create `packages/fetcher/src/bundle-writer/bundle-writer.test.ts`

- [x] Task 5: Create barrel and update fetcher exports (AC: #1-#8)
  - [x] Create `packages/fetcher/src/bundle-writer/index.ts` barrel
  - [x] Update `packages/fetcher/src/index.ts` to export bundle-writer functions

- [x] Task 6: Write comprehensive tests (AC: #1-#8)
  - [x] Test: writeBundle creates directory with registry.json + library subdirs + chunk files
  - [x] Test: checksums in registry.json match SHA-256 of written chunk files
  - [x] Test: fileCount matches actual chunk file count
  - [x] Test: contentHash is SHA-256 of raw source content
  - [x] Test: atomic swap via .tmp directory + rename
  - [x] Test: original bundle untouched during .tmp writing phase
  - [x] Test: generatedAt is ISO 8601 UTC string
  - [x] Test: integrity uses node:crypto only

### Review Findings

- [x] [Review][Patch] contentHash joins raw chunks without separator — fixed, now joins with \0 separator [registry-writer.ts:28]
- [x] [Review][Defer] Path traversal via libraryId/chunk.filename in chunk-writer — deferred, defense-in-depth (callers sanitize via toKebabFilename and LibraryConfigSchema)
- [x] [Review][Defer] Non-atomic window between rm and rename in bundle-writer — deferred, matches story spec's prescribed protocol
- [x] [Review][Defer] rename() fails with EXDEV across filesystem boundaries — deferred, .tmp is always same parent dir
- [x] [Review][Defer] No validation that chunk.filename values are unique in writer — deferred, processChunks handles deduplication
- [x] [Review][Defer] description hardcoded to empty string — deferred, LibraryConfig has no description field
- [x] [Review][Defer] Race condition with concurrent writeBundle calls — deferred, CLI runs as single process

## Dev Notes

### Architecture — Directory Structure

Per architecture doc, the bundle-writer directory is:
```
packages/fetcher/src/bundle-writer/
  index.ts              # Barrel
  registry-writer.ts    # Writes registry.json with checksums
  registry-writer.test.ts
  chunk-writer.ts       # Writes chunk files to library subdirs
  chunk-writer.test.ts
  integrity.ts          # SHA-256 checksum generation
  integrity.test.ts
  bundle-writer.ts      # Top-level writeBundle orchestrator (atomic swap)
  bundle-writer.test.ts
```

### Key Types and Interfaces

**Input to writeBundle — define in bundle-writer module:**

```typescript
interface BundleWriteInput {
  config: LibraryConfig;           // From TOML config (id, name, sourceType, sourceUrl, etc.)
  fetchResult: FetchResult;         // Raw fetch result (for contentHash + metadata)
  processedChunks: ProcessedChunk[]; // From chunk-processor (filename, content, frontmatter)
}
```

**Registry entry fields to populate per library:**

```typescript
{
  id: config.id,
  name: config.name,
  description: config.description ?? '',
  version: fetchResult.metadata.version,
  sourceType: config.sourceType,
  sourceUrl: config.sourceUrl,
  lastFetched: fetchResult.metadata.fetchedAt,
  contentHash: computeContentHash(rawContent),  // SHA-256 of concatenated raw chunk content
  chunkCount: processedChunks.length,
  checksums: { /* relative-path -> sha256 of written file */ }
}
```

### Critical Implementation Details

**Checksum types — two distinct hashes in registry.json (do NOT confuse):**
- `contentHash` (per library): SHA-256 of the **raw fetched source content** — used by Story 2.7's incremental skip logic to determine if a library needs re-fetching
- `checksums` (per chunk file): SHA-256 of each **written chunk file** (the final file with frontmatter) — used by Server for bundle integrity verification

**contentHash computation:** Hash the concatenation of all raw `DocChunk.content` strings from the FetchResult (before chunk processing). This ensures the same source content always produces the same hash regardless of processing changes.

**Checksums computation:** After writing each chunk file to disk, compute SHA-256 of the file's bytes. Key by forward-slash relative path: `path.posix.join(libraryId, filename)`.

**Atomic swap protocol:**
1. Create temp dir: `<bundlePath>.tmp`
2. Write all files into temp dir
3. If `bundlePath` exists, `rm -rf` it (or `fs.rm` with `recursive: true`)
4. Rename temp dir to `bundlePath` (`fs.rename`)
5. On any error during step 2: clean up temp dir (best-effort `rm -rf`)

Use `node:fs/promises` for all filesystem ops: `mkdir`, `writeFile`, `rename`, `rm`, `readFile`.

**Path handling:**
- Use `path.join()` for filesystem operations (local OS paths)
- Use `path.posix.join()` for keys in `checksums` record (always forward-slash)
- `normalizeBundlePath()` from `@offlinedocs/shared` is available but only needed for paths stored in registry

**generatedAt:** Use `new Date().toISOString()` — produces UTC ISO 8601 like `2026-05-26T12:00:00.000Z`

### Imports from @offlinedocs/shared

```typescript
import { RegistrySchema, type Registry, BUNDLE_FORMAT_VERSION } from '@offlinedocs/shared';
```

### Imports from within fetcher package

```typescript
import type { ProcessedChunk } from '../chunk-processor/index.js';
import type { FetchResult } from '../adapters/types.js';
import type { LibraryConfig } from '@offlinedocs/shared';
```

### Testing Approach

- Use `node:fs/promises` + `os.tmpdir()` to create temporary directories for test bundles
- After `writeBundle()`, read back `registry.json` and validate against `RegistrySchema`
- Independently compute SHA-256 of written chunk files and compare to registry checksums
- For atomic swap test: write an initial bundle, then call `writeBundle()` again with different content — verify old content is replaced
- For interrupted write test: verify that if temp dir exists but final rename hasn't happened, original bundle dir is intact
- Clean up temp dirs in `afterEach`

### Previous Story Learnings (from Story 2.5)

- Co-locate tests with source files (`.test.ts` next to `.ts`)
- Export through barrel `index.ts` files
- Import from `@offlinedocs/shared` for schemas and constants
- Use `import type` for type-only imports
- Validate outputs against Zod schemas at boundaries

### Project Structure Notes

- All new files go in `packages/fetcher/src/bundle-writer/` — this directory does NOT exist yet, create it
- Barrel export in `packages/fetcher/src/bundle-writer/index.ts`
- Update `packages/fetcher/src/index.ts` to re-export bundle-writer public API
- Follow existing patterns: kebab-case files, camelCase functions, PascalCase types

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.6]
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture (Bundle Format)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Atomic Bundle Swap Protocol]
- [Source: packages/shared/src/schemas/registry.ts — RegistrySchema, Registry type]
- [Source: packages/shared/src/constants.ts — BUNDLE_FORMAT_VERSION]
- [Source: packages/shared/src/bundle-validator.ts — validateBundle (consumer of our output)]
- [Source: packages/fetcher/src/chunk-processor/index.ts — ProcessedChunk type]
- [Source: packages/fetcher/src/adapters/types.ts — FetchResult, DocChunk types]

## Dev Agent Record

### Agent Model Used

Claude Opus 4

### Debug Log References

None.

### Completion Notes List

- Implemented integrity module: computeChecksum (SHA-256 hex digest) and computeContentHash using node:crypto only
- Implemented chunk writer: writes ProcessedChunk files to library subdirs, returns checksums keyed by forward-slash paths via path.posix.join
- Implemented registry writer: builds Registry object from LibraryWriteInput[], validates against RegistrySchema before writing, computes contentHash from concatenated raw FetchResult chunks
- Implemented atomic bundle writer: writes to .tmp dir first, then rm + rename for atomic swap, best-effort cleanup on failure
- Created barrel export and updated fetcher index.ts
- 31 new tests across 4 test files, 148 total tests pass, zero regressions

### Change Log

- 2026-05-26: Implemented bundle writer with integrity and atomic swap (Story 2.6)

### File List

- packages/fetcher/src/bundle-writer/integrity.ts (NEW)
- packages/fetcher/src/bundle-writer/integrity.test.ts (NEW)
- packages/fetcher/src/bundle-writer/chunk-writer.ts (NEW)
- packages/fetcher/src/bundle-writer/chunk-writer.test.ts (NEW)
- packages/fetcher/src/bundle-writer/registry-writer.ts (NEW)
- packages/fetcher/src/bundle-writer/registry-writer.test.ts (NEW)
- packages/fetcher/src/bundle-writer/bundle-writer.ts (NEW)
- packages/fetcher/src/bundle-writer/bundle-writer.test.ts (NEW)
- packages/fetcher/src/bundle-writer/index.ts (NEW)
- packages/fetcher/src/index.ts (MODIFIED)
