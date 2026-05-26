# Story 1.2: Bundle Format Schemas & Shared Types

## Status: done

## Story

- **As a** developer working on OfflineDocs
- **I want** Zod schemas, error types, result types, and constants defined in the shared package
- **So that** the fetcher and server packages have a single source of truth for all data contracts

## Acceptance Criteria

1. RegistrySchema validates registry.json format with bundleFormatVersion, libraries array, fileCount, generatedAt
2. FrontmatterSchema validates chunk frontmatter with required title, library, topics and optional part
3. LibraryConfigSchema validates library config entries with id, name, sourceType enum, sourceUrl
4. AdapterError class with typed error codes (NETWORK, AUTH_REQUIRED, RATE_LIMITED, FORMAT_CHANGED, EMPTY_RESPONSE, CONFIG_INVALID)
5. Result<T> type with ok() and err() factory functions for adapter error handling
6. Constants exported: SEARCH_WEIGHTS, RETRY_BASE_MS, MAX_CHUNK_SIZE, DEFAULT_MAX_TOKENS, BUNDLE_FORMAT_VERSION, STALE_THRESHOLD_DAYS, SYNONYM_MAP, MAX_RETRIES_CDN, MAX_RETRIES_API
7. All types inferred from Zod schemas via z.infer
8. Barrel export re-exports everything from index.ts
9. All schemas and types have co-located unit tests
10. Build passes and all tests pass

## Technical Notes

- Zod v3.x: `import { z } from 'zod'`
- Types derived via `z.infer<typeof Schema>`
- Follow naming: PascalCase+Schema suffix for schemas, UPPER_SNAKE for constants
- Tests use vitest (describe, it, expect)
- Co-located test files (*.test.ts next to source)

## Dependencies

- Story 1.1 (monorepo scaffold) — completed

## Code Review

**Date:** 2026-05-26
**Reviewer:** BMAD Code Review (3-layer: Blind Hunter, Edge Case Hunter, Acceptance Auditor)
**Baseline:** 595ea8e → HEAD (commits e3f0a52 + 5d51b43)

### Summary

- **4 patches applied**
- **0 deferred**
- **4 dismissed** (false positives / intentional design)

### Patches Applied

- [x] **`AdapterError.cause` shadows native `Error.cause`** (`errors.ts`) — Constructor declared its own `cause` field instead of forwarding to `super(message, { cause })`. Fixed to use the native ES2022 error cause mechanism.
- [x] **Unused `zod-to-json-schema` in devDependencies** (`package.json`) — The fix commit switched to `z.toJSONSchema()` from `zod/v4` but left the old package in devDependencies. Removed.
- [x] **Duplicate SourceType enum definition** (`registry.ts`, `library-config.ts`) — The source type enum `['llms-txt', 'github', 'context7']` was defined independently in both files. Extracted to shared `schemas/source-type.ts` to prevent drift.
- [x] **`FrontmatterSchema.topics` allows empty strings** (`frontmatter.ts`) — `z.array(z.string())` permitted empty-string topics which would degrade search quality. Added `.min(1)` to topic string validation.

### Dismissed

- `sourceUrl` not validated as URL format — intentionally permissive for flexibility
- `normalizeBundlePath` not used internally by `validateBundle` — utility export for callers
- Checksums not validated as hex SHA-256 format — runtime validation in bundle-validator is sufficient
- Path traversal edge case where `filePath === resolvedBundlePath` — extremely unlikely; defensive check is adequate
