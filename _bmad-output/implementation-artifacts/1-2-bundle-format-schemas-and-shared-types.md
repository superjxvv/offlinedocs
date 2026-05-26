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
