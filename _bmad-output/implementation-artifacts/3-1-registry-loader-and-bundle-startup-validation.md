---
baseline_commit: 46341a46c2a8e43b90ae2eeaf02bdef4875c0f79
---

# Story 3.1: Registry Loader & Bundle Startup Validation

Status: done

## Story

As an Offline Developer,
I want the MCP Server to validate the Doc Bundle at startup,
so that I'm immediately told if the bundle is corrupt or missing rather than getting silent failures.

## Acceptance Criteria

1. **Given** a valid bundle path with correct registry.json, **When** the server starts, **Then** it loads and validates registry.json against RegistrySchema successfully.

2. **Given** a registry.json with wrong bundleFormatVersion (e.g., 99), **When** the server starts, **Then** it exits with a clear error message stating the expected vs actual version.

3. **Given** a bundle path with no registry.json file, **When** the server starts, **Then** it exits with a clear error message: registry.json not found at the specified path.

4. **Given** a bundle where registry.json fileCount says 20 but only 15 chunk files exist, **When** the server starts, **Then** it exits with an error reporting the file count discrepancy.

5. **Given** the --skip-integrity flag, **When** the server starts, **Then** it skips SHA-256 checksum verification for faster startup during development.

6. **Given** a valid bundle without --skip-integrity, **When** the server starts, **Then** it verifies SHA-256 checksums for all chunk files against the registry.

7. **Given** a chunk file with invalid or unparseable frontmatter, **When** the server loads chunks for indexing, **Then** it logs a warning to stderr and skips the invalid chunk (does not crash).

## Tasks / Subtasks

- [ ] Task 1: Implement registry-loader.ts (AC: #1, #2, #3)
  - [ ] Create `packages/server/src/registry-loader.ts`
  - [ ] `loadRegistry(bundlePath: string): Promise<Result<Registry>>` — reads and validates registry.json against RegistrySchema
  - [ ] On missing file: return err with message "registry.json not found at: {path}"
  - [ ] On invalid JSON: return err with message "registry.json contains invalid JSON"
  - [ ] On schema validation failure: return err with descriptive Zod error
  - [ ] On wrong bundleFormatVersion: return err with "Expected bundleFormatVersion {BUNDLE_FORMAT_VERSION}, got {actual}"
  - [ ] Create `packages/server/src/registry-loader.test.ts`

- [ ] Task 2: Implement bundle-validator for server startup (AC: #4, #5, #6)
  - [ ] Create `packages/server/src/bundle-validator.ts`
  - [ ] `validateBundleStartup(bundlePath: string, registry: Registry, options: { skipIntegrity?: boolean }): Promise<Result<BundleValidationResult>>`
  - [ ] File count check: count all .md files across library subdirs, compare to registry.fileCount
  - [ ] When `skipIntegrity` is false: verify SHA-256 checksums for every chunk file against registry checksums
  - [ ] When `skipIntegrity` is true: skip checksum verification, only do file count check
  - [ ] Return structured validation result with errors array
  - [ ] Create `packages/server/src/bundle-validator.test.ts`

- [ ] Task 3: Implement chunk-loader with frontmatter parsing (AC: #7)
  - [ ] Create `packages/server/src/chunk-loader.ts`
  - [ ] `loadChunks(bundlePath: string, registry: Registry): Promise<LoadedChunk[]>`
  - [ ] For each library in registry, read all .md files from library subdirectory
  - [ ] Parse frontmatter using @11ty/gray-matter, validate against FrontmatterSchema
  - [ ] On invalid frontmatter: log warning to stderr (`console.error`), skip chunk, continue
  - [ ] Return `LoadedChunk[]` with: `{ libraryId, filename, title, topics, content, byteSize }`
  - [ ] Create `packages/server/src/chunk-loader.test.ts`

- [ ] Task 4: Implement startup orchestrator (AC: #1-#7)
  - [ ] Create `packages/server/src/startup.ts`
  - [ ] `startupBundle(bundlePath: string, options: { skipIntegrity?: boolean }): Promise<Result<StartupResult>>`
  - [ ] Orchestrates: loadRegistry -> validateBundleStartup -> loadChunks
  - [ ] On any failure: return err with descriptive message (process.exit handled by caller)
  - [ ] `StartupResult: { registry: Registry, chunks: LoadedChunk[] }`
  - [ ] All diagnostic output goes to stderr (stdout reserved for MCP stdio)
  - [ ] Create `packages/server/src/startup.test.ts`

- [ ] Task 5: Update barrel exports (AC: #1-#7)
  - [ ] Update `packages/server/src/index.ts` to export all public functions and types

## Dev Notes

### Architecture Reference

Per architecture doc, the server source structure for this story:
```
packages/server/src/
  index.ts              # Barrel: public API exports
  cli.ts                # CLI entrypoint (thin wrapper, will be updated in Story 3.3)
  registry-loader.ts    # Loads + validates registry.json via Zod
  registry-loader.test.ts
  bundle-validator.ts   # Server-side bundle validation at startup
  bundle-validator.test.ts
  chunk-loader.ts       # Reads and parses chunk files with frontmatter
  chunk-loader.test.ts
  startup.ts            # Orchestrates registry load -> validation -> chunk loading
  startup.test.ts
```

### Logging Contract — CRITICAL

Per architecture: Server stdout is **reserved exclusively for MCP stdio transport**. ALL diagnostic output (logging, warnings, errors) MUST go to `stderr` only.

```typescript
// CORRECT — Server diagnostic logging
console.error('Warning: Invalid frontmatter in react/hooks.md — skipping');

// WRONG — NEVER use console.log in server package
console.log('anything'); // ← This would corrupt MCP stdio channel
```

### Existing Code to Leverage

**`@offlinedocs/shared` already provides:**
- `RegistrySchema` + `Registry` type — Zod schema for registry.json validation
- `FrontmatterSchema` + `Frontmatter` type — Zod schema for chunk frontmatter
- `BUNDLE_FORMAT_VERSION` constant (currently `1`)
- `validateBundle()` in `bundle-validator.ts` — full validation with checksums (can reference this implementation but server needs its own version that returns Result<T> and supports `skipIntegrity`)
- `normalizeBundlePath()` — forward-slash normalization
- `Result<T>`, `ok()`, `err()` — Result pattern utilities
- `AdapterError` — can be used for error reporting

**Server package already has:**
- `@11ty/gray-matter` as dependency (for frontmatter parsing)
- `@offlinedocs/shared` as workspace dependency
- Empty `search/` and `tools/` directories (for future stories)
- Stub `cli.ts` and `index.ts` files

### Error Handling Pattern

Per architecture: MCP handlers use try/catch (Story 3.3), but the startup layer uses the Result pattern since it runs before MCP is initialized.

```typescript
// Registry loader returns Result<T>
const registryResult = await loadRegistry(bundlePath);
if (!registryResult.ok) {
  console.error(`Error: ${registryResult.error.message}`);
  process.exit(1);
}
```

### Frontmatter Parsing

Use `@11ty/gray-matter` (already a dependency):
```typescript
import matter from '@11ty/gray-matter';
import { FrontmatterSchema } from '@offlinedocs/shared';

const parsed = matter(fileContent);
const result = FrontmatterSchema.safeParse(parsed.data);
if (!result.success) {
  console.error(`Warning: Invalid frontmatter in ${filePath} — skipping`);
  continue;
}
```

### BundleFormatVersion Check

The server MUST check `bundleFormatVersion` explicitly, not just via general schema validation. This ensures a clear error message when Fetcher/Server versions drift.

```typescript
if (registry.bundleFormatVersion !== BUNDLE_FORMAT_VERSION) {
  return err(new AdapterError(
    'FORMAT_CHANGED', '',
    `Expected bundleFormatVersion ${BUNDLE_FORMAT_VERSION}, got ${registry.bundleFormatVersion}`
  ));
}
```

### Testing Approach

- Use temp directories with `mkdtemp` for all filesystem tests
- Create minimal test fixtures: valid registry.json, valid chunk files with frontmatter
- Test invalid cases: missing registry, wrong version, bad JSON, fileCount mismatch, bad checksums, invalid frontmatter
- Mock `console.error` to verify warning messages for invalid frontmatter
- All tests co-located with source files (`.test.ts` next to `.ts`)

### Previous Story Learnings (from Stories 1.1-2.7)

- Co-locate tests with source files (`.test.ts` next to `.ts`)
- Export through barrel `index.ts` files
- Import from `@offlinedocs/shared` for schemas and constants
- Use `import type` for type-only imports
- contentHash uses `\0` separator when joining raw chunks
- Use `path.posix.join()` for bundle-relative paths, `path.join()` for local filesystem
- Validate against Zod schemas at system boundaries
- `@11ty/gray-matter` parses frontmatter from markdown files (import as `matter`)

### Files to Create

- `packages/server/src/registry-loader.ts` (NEW)
- `packages/server/src/registry-loader.test.ts` (NEW)
- `packages/server/src/bundle-validator.ts` (NEW)
- `packages/server/src/bundle-validator.test.ts` (NEW)
- `packages/server/src/chunk-loader.ts` (NEW)
- `packages/server/src/chunk-loader.test.ts` (NEW)
- `packages/server/src/startup.ts` (NEW)
- `packages/server/src/startup.test.ts` (NEW)

### Files to Modify

- `packages/server/src/index.ts` (UPDATE — replace stub with barrel exports)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture (Bundle Format)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Communication Patterns — Logging Contract]
- [Source: _bmad-output/planning-artifacts/architecture.md#Validation Timing]
- [Source: _bmad-output/planning-artifacts/architecture.md#Process Patterns]
- [Source: packages/shared/src/schemas/registry.ts — RegistrySchema, Registry type]
- [Source: packages/shared/src/schemas/frontmatter.ts — FrontmatterSchema, Frontmatter type]
- [Source: packages/shared/src/bundle-validator.ts — validateBundle implementation (reference)]
- [Source: packages/shared/src/constants.ts — BUNDLE_FORMAT_VERSION]
- [Source: packages/shared/src/result.ts — Result<T>, ok(), err()]
- [Source: packages/shared/src/errors.ts — AdapterError]

### Review Findings

- [x] [Review][Patch] Path traversal vulnerability: no guard on `lib.id` or checksum keys [bundle-validator.ts:31, chunk-loader.ts:28] — added `path.resolve` + `startsWith` guards matching shared validator pattern.
- [x] [Review][Patch] File count should count all files, not just `.md`, to match shared validator behavior [bundle-validator.ts:34] — removed `.endsWith('.md')` filter to match shared validator.
- [x] [Review][Patch] Non-positive bundleFormatVersion gets generic schema error instead of clear expected-vs-actual message [registry-loader.ts:39-50] — moved explicit version check before schema validation.
- [x] [Review][Patch] Test uses dynamic import unnecessarily [startup.test.ts:92] — replaced with already-imported `readFile`.
- [x] [Review][Patch] No test for gray-matter parse error code path [chunk-loader.test.ts] — added test for malformed YAML frontmatter.
- [x] [Review][Defer] No CLI entry point with process.exit for startup failures [cli.ts] — deferred, Story 3.3 scope
- [x] [Review][Defer] --skip-integrity CLI flag not implemented [cli.ts] — deferred, Story 3.3 scope

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
