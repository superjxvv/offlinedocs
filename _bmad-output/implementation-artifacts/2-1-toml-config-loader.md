---
baseline_commit: 46341a46c2a8e43b90ae2eeaf02bdef4875c0f79
---

# Story 2.1: TOML Config Loader

Status: done

## Story

As a Fetcher operator,
I want to define my library list in a human-readable TOML config file,
so that I can easily add, remove, or update library documentation sources.

## Acceptance Criteria

1. **Given** a valid `libraries.toml` with 3 library entries of different source types, **When** I load it via config-loader, **Then** it returns 3 validated `LibraryConfig` objects matching the `LibraryConfigSchema`.

2. **Given** a TOML entry with `sourceType = "llms-txt"` and a `sourceUrl`, **When** I validate it, **Then** it passes validation.

3. **Given** a TOML entry with `sourceType = "github"` with repo and path fields, **When** I validate it, **Then** it passes validation.

4. **Given** a TOML entry with `sourceType = "context7"` with a `libraryId`, **When** I validate it, **Then** it passes validation.

5. **Given** a TOML file with a missing required field (e.g., no `sourceUrl`), **When** I load it, **Then** it returns an `AdapterError` with code `CONFIG_INVALID` naming the problematic entry and field.

6. **Given** a malformed TOML file with syntax errors, **When** I load it, **Then** it returns an `AdapterError` with code `CONFIG_INVALID` and a clear parse error message.

## Tasks / Subtasks

- [x] Task 1: Create config-loader module (AC: #1, #2, #3, #4, #5, #6)
  - [x] Create `packages/fetcher/src/config/config-loader.ts`
  - [x] Implement `loadConfig(configPath: string): Promise<Result<LibraryConfig[]>>`
  - [x] Parse TOML using `smol-toml` (`import { parse } from 'smol-toml'`)
  - [x] Validate each entry against `LibraryConfigSchema` from `@offlinedocs/shared`
  - [x] Return `ok(configs)` on success, `err(AdapterError)` with code `CONFIG_INVALID` on failure
  - [x] Include problematic entry ID and field name in error messages

- [x] Task 2: Write co-located tests (AC: #1-#6)
  - [x] Create `packages/fetcher/src/config/config-loader.test.ts`
  - [x] Test: valid TOML with 3 source types returns 3 `LibraryConfig` objects
  - [x] Test: llms-txt entry passes validation
  - [x] Test: github entry passes validation
  - [x] Test: context7 entry passes validation
  - [x] Test: missing required field returns `CONFIG_INVALID` error with entry/field info
  - [x] Test: malformed TOML syntax returns `CONFIG_INVALID` error with parse message

- [x] Task 3: Wire barrel export (AC: #1)
  - [x] Update `packages/fetcher/src/index.ts` to export `loadConfig` from `./config/config-loader.js`

### Review Findings

- [x] [Review][Patch] Test cleanup leaks temp directories — `rm(filePath)` should be `rm(dir)` [config-loader.test.ts]
- [x] [Review][Defer] Duplicate library IDs silently accepted — deferred, pre-existing schema-level concern
- [x] [Review][Defer] Unicode/special chars in `id` field unconstrained — deferred, schema constraint belongs in shared package

## Dev Notes

### Architecture Constraints

- **Return type:** `Promise<Result<LibraryConfig[]>>` — use Result pattern, never throw
- **Error type:** `AdapterError` with code `CONFIG_INVALID`
- **Parser:** `smol-toml` (already in fetcher `package.json` as `^1.3.1`)
- **Validation:** Zod v4 via `LibraryConfigSchema` from `@offlinedocs/shared`
- **File I/O:** `node:fs/promises` (`readFile`)

### TOML Config Format

The expected TOML structure uses `[[library]]` array-of-tables syntax:

```toml
[[library]]
id = "react"
name = "React"
sourceType = "llms-txt"
sourceUrl = "https://react.dev/llms.txt"

[[library]]
id = "express"
name = "Express"
sourceType = "github"
sourceUrl = "https://github.com/expressjs/express/tree/main/docs"

[[library]]
id = "nextjs"
name = "Next.js"
sourceType = "context7"
sourceUrl = "/vercel/next.js"
```

**Important:** The `LibraryConfigSchema` requires exactly 4 fields: `id`, `name`, `sourceType`, `sourceUrl`. Source-type-specific URL semantics (GitHub repo URLs, Context7 library IDs as paths, llms.txt endpoints) are validated by the individual adapters in Stories 2.2-2.4, NOT here. The config-loader only validates structural schema compliance.

### Import Pattern (must follow)

```typescript
// 1. Node.js built-ins
import { readFile } from 'node:fs/promises';
// 2. External deps
import { parse } from 'smol-toml';
// 3. Workspace packages
import { LibraryConfigSchema, type LibraryConfig, AdapterError, type Result, ok, err } from '@offlinedocs/shared';
```

### Critical: Zod v4 Import

Zod must be imported as `from 'zod/v4'` (NOT `from 'zod'`). This was a lesson from Story 1.2. However, the config-loader should not need to import Zod directly — use `LibraryConfigSchema` from shared which already handles this.

### LibraryConfigSchema Shape (from shared)

```typescript
// packages/shared/src/schemas/library-config.ts
z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sourceType: SourceTypeEnum,  // z.enum(['llms-txt', 'github', 'context7'])
  sourceUrl: z.string().min(1),
})
```

### AdapterError Constructor

```typescript
new AdapterError(code: AdapterErrorCode, libraryId: string, message: string, cause?: Error)
```
- For TOML syntax errors: `new AdapterError('CONFIG_INVALID', '', 'Failed to parse TOML: ...')`
- For validation errors: `new AdapterError('CONFIG_INVALID', entryId || 'unknown', 'Missing field "sourceUrl" in library entry "react"')`

### Result Pattern (from shared)

```typescript
import { ok, err } from '@offlinedocs/shared';
// Success: return ok(validatedConfigs)
// Failure: return err(new AdapterError(...))
```

### Existing File to Modify

**`packages/fetcher/src/index.ts`** — Currently empty with placeholder comment. Replace with:
```typescript
export { loadConfig } from './config/config-loader.js';
```
Note the `.js` extension — required for ESM with NodeNext module resolution.

### Testing Standards

- Framework: vitest with `globals: true`
- Pattern: co-located `.test.ts` files
- Use inline TOML strings as test fixtures (no separate fixture files needed)
- Use `safeParse` pattern for schema validation assertions
- Verify `result.ok === true` / `result.ok === false` and inspect `.data` / `.error` properties

### Project Structure Notes

- File path: `packages/fetcher/src/config/config-loader.ts` (must create `config/` directory)
- Test path: `packages/fetcher/src/config/config-loader.test.ts`
- Naming: kebab-case files, camelCase functions
- Barrel: `packages/fetcher/src/index.ts`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#Config Loader]
- [Source: packages/shared/src/schemas/library-config.ts]
- [Source: packages/shared/src/errors.ts]
- [Source: packages/shared/src/result.ts]
- [Source: _bmad-output/implementation-artifacts/1-2-bundle-format-schemas-and-shared-types.md - Zod v4 import lesson]

## Dev Agent Record

### Agent Model Used

Claude Opus 4 (via bmad-dev-story)

### Debug Log References

None — clean implementation with no debug cycles needed.

### Completion Notes List

- Implemented `loadConfig()` using smol-toml parser and LibraryConfigSchema validation
- Returns Result pattern: `ok(LibraryConfig[])` on success, `err(AdapterError)` with CONFIG_INVALID on failure
- Error messages include problematic entry ID and field names via Zod issue extraction
- Handles 3 failure modes: file read errors, TOML parse errors, schema validation errors
- 8 tests covering all 6 ACs plus file-not-found and invalid sourceType edge cases
- Added `@types/node` to fetcher devDependencies (was missing, caused DTS build failure)
- Build and full test suite (48 tests) pass with zero regressions

### Change Log

- 2026-05-26: Initial implementation of TOML config loader (Story 2.1)

### File List

- packages/fetcher/src/config/config-loader.ts (NEW)
- packages/fetcher/src/config/config-loader.test.ts (NEW)
- packages/fetcher/src/index.ts (MODIFIED — added barrel export)
- packages/fetcher/package.json (MODIFIED — added @types/node devDependency)
