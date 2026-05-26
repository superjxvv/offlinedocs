---
baseline_commit: e3f0a52
---

# Story 1.3: JSON Schema Generation & Bundle Validation Helpers

Status: done

## Story

As a developer,
I want JSON Schema generated from Zod schemas and bundle validation utilities,
So that the bundle format is formally specified and both components can validate bundles at their boundaries.

## Acceptance Criteria

1. **Given** the RegistrySchema, **When** I run the schema generation script, **Then** schemas/registry.schema.json is produced at the repo root matching the Zod schema structure.

2. **Given** a valid Doc Bundle directory with correct registry.json, matching fileCount, and valid checksums, **When** I call validateBundle(bundlePath), **Then** it returns `{ valid: true, errors: [], warnings: [] }`.

3. **Given** a bundle with fileCount of 10 but only 8 chunk files on disk, **When** I call validateBundle(bundlePath), **Then** it returns `{ valid: false }` with an error describing the file count mismatch.

4. **Given** a bundle with a chunk file whose SHA-256 doesn't match the registry checksum, **When** I call validateBundle(bundlePath), **Then** it returns `{ valid: false }` with an error identifying the affected file path.

5. **Given** a path string with backslashes (e.g., `react\hooks.md`), **When** I call normalizeBundlePath(), **Then** it returns `react/hooks.md` (forward-slash normalized).

6. **Given** the generated JSON Schema file, **When** I check it into the repo, **Then** it lives at schemas/registry.schema.json.

## Tasks / Subtasks

- [x] Task 1: Create JSON Schema generation script (AC: #1, #6)
  - [x] 1.1: Create `packages/shared/src/schema-gen.ts` using zod-to-json-schema
  - [x] 1.2: Add `generate:schema` script to shared package.json
  - [x] 1.3: Generate `schemas/registry.schema.json` and check into repo

- [x] Task 2: Implement bundle validation helpers (AC: #2, #3, #4, #5)
  - [x] 2.1: Create `packages/shared/src/bundle-validator.ts` with normalizeBundlePath and validateBundle
  - [x] 2.2: normalizeBundlePath replaces backslashes with forward slashes
  - [x] 2.3: validateBundle reads registry.json, validates schema, checks fileCount, verifies SHA-256 checksums
  - [x] 2.4: Create `packages/shared/src/bundle-validator.test.ts` with 12 tests

- [x] Task 3: Update barrel exports (AC: #5)
  - [x] 3.1: Export validateBundle, normalizeBundlePath, BundleValidationResult from index.ts

- [x] Task 4: Verify build and tests (AC: all)
  - [x] 4.1: pnpm build passes
  - [x] 4.2: pnpm test passes (34 total tests)

## Dev Notes

### Architecture Compliance

- Uses Node.js built-in `crypto` module for SHA-256 checksums
- Uses `node:fs/promises` for file operations
- Forward-slash normalization for all bundle paths
- zod-to-json-schema added as devDep for schema generation

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture]
- [Source: _bmad-output/planning-artifacts/architecture.md#Integrity Model]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.3]

## Dev Agent Record

### Agent Model Used

Claude Opus 4

### Completion Notes List

- All 6 acceptance criteria satisfied
- 12 new tests added (34 total across shared package)
- JSON Schema generated and checked into schemas/registry.schema.json
- Bundle validator handles: valid bundles, file count mismatch, checksum mismatch, missing registry

### File List

- packages/shared/src/schema-gen.ts (NEW)
- packages/shared/src/bundle-validator.ts (NEW)
- packages/shared/src/bundle-validator.test.ts (NEW)
- packages/shared/src/index.ts (MODIFIED — added exports)
- packages/shared/package.json (MODIFIED — added generate:schema script, devDeps)
- schemas/registry.schema.json (NEW — generated)

## Code Review

**Date:** 2026-05-26

**Summary:** 1 patch applied, 2 deferred, 1 dismissed

### Patches Applied

- [x] **`bundle-validator.ts:79` — Remove unnecessary `filePath !== resolvedBundlePath` escape hatch in path traversal check for checksum keys.** The condition `&& filePath !== resolvedBundlePath` allowed a checksum key of `""` or `"."` to resolve to the bundle root and bypass the traversal guard. Removed the escape hatch so the check is strictly `!filePath.startsWith(resolvedBundlePath + path.sep)`.

### Deferred

- `bundle-validator.ts:59` — `readdir` is non-recursive, so nested chunk files (e.g., `react/api/hooks.md`) would not be counted, causing false file count mismatches. Not an issue with current flat bundle format, but should be revisited if nested structures are introduced.
- `bundle-validator.ts:59` — `readdir` returns all directory entries including subdirectories, which would inflate the chunk file count. Same scope as above.

### Dismissed

- No deduplication of chunk files across libraries — library IDs are unique and paths are scoped by `lib.id/`, so duplicates cannot occur in practice.
