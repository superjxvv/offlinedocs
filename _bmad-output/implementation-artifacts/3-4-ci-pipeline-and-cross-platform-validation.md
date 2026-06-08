---
baseline_commit: 46341a46c2a8e43b90ae2eeaf02bdef4875c0f79
---

> **NOTE (Story 4.1):** This artifact references pnpm throughout. The project migrated to npm in Story 4.1. The actual CI workflow at `.github/workflows/ci.yml` uses npm. Treat pnpm references below as historical.

# Story 3.4: CI Pipeline & Cross-Platform Validation

Status: done

## Story

As a developer,
I want automated CI that validates OfflineDocs on Windows and Linux with Node 22 and 24,
so that cross-platform issues are caught before merge.

## Acceptance Criteria

1. **Given** a push or pull request to any branch, **When** CI runs, **Then** it executes on a matrix of ubuntu-latest + windows-latest x Node.js 22 + 24.

2. **Given** the CI pipeline, **When** the build step runs, **Then** shared builds first, followed by fetcher and server.

3. **Given** the CI pipeline, **When** the test step runs, **Then** all unit and integration tests pass on all 4 matrix combinations.

4. **Given** cross-platform path tests, **When** run on Windows, **Then** bundle paths with forward-slash normalization are handled correctly.

5. **Given** a bundle created on ubuntu in CI, **When** integrity is validated on windows (or vice versa), **Then** SHA-256 checksums and fileCount match across platforms.

## Tasks / Subtasks

- [x] Task 1: Create GitHub Actions CI workflow (AC: #1, #2, #3)
  - [x] Create `.github/workflows/ci.yml`
  - [x] Trigger on `push` and `pull_request` to all branches
  - [x] Matrix strategy: `os: [ubuntu-latest, windows-latest]` x `node-version: [22, 24]`
  - [x] Steps: checkout, setup pnpm, setup Node.js with cache, install deps, build (shared first, then fetcher+server), run tests
  - [x] Use `pnpm/action-setup` for pnpm installation
  - [x] Use `actions/setup-node` with `cache: 'pnpm'` for dependency caching
  - [x] Build command: `pnpm build` (root script already builds shared first, then fetcher+server in parallel)
  - [x] Test command: `pnpm -r test` (runs all package tests)

- [x] Task 2: Add cross-platform path normalization test (AC: #4)
  - [x] Create `packages/shared/src/cross-platform.test.ts`
  - [x] Test `normalizeBundlePath()` converts backslashes to forward slashes
  - [x] Test path construction with `path.posix.join()` produces forward-slash paths
  - [x] Test OS-safe characters in bundle paths (no special chars that break on Windows)
  - [x] Test path length stays under 200 characters

- [x] Task 3: Add cross-platform integrity validation test (AC: #5)
  - [x] Create `packages/shared/src/cross-platform-integrity.test.ts`
  - [x] Test that SHA-256 checksums for identical content produce the same hash on any platform
  - [x] Test that fileCount validation works with forward-slash normalized paths
  - [x] Test that registry.json round-trip (write → read → validate) preserves integrity across path separators

### Review Findings

- [x] [Review][Defer] AC5: No cross-OS bundle artifact exchange in CI — deferred, acceptable for v1. Integrity logic is platform-independent (SHA-256 + forward-slash normalization), validated by unit tests on both OS matrix legs. Artifact exchange between CI jobs deferred as enhancement.
- [x] [Review][Patch] Remove hardcoded pnpm version from CI — `pnpm/action-setup@v4` should auto-detect from `packageManager` field, not pin `version: 9` [.github/workflows/ci.yml:23]
- [x] [Review][Patch] Add temp directory cleanup in integrity tests — `mkdtemp` creates dirs that are never removed [packages/shared/src/cross-platform-integrity.test.ts:40,83]
- [x] [Review][Patch] Restrict CI push trigger to main branch — Push + PR triggers on all branches causes duplicate runs on PR branches [.github/workflows/ci.yml:4]
- [x] [Review][Defer] Add path traversal test cases for normalizeBundlePath — deferred, pre-existing (path traversal protection exists in bundle-validator.ts, security tests belong to story 1.3 scope)

## Dev Notes

### Architecture Reference

Per architecture doc:
```
CI/CD:
- GitHub Actions with matrix strategy: ubuntu-latest + windows-latest
- Node.js versions in matrix: 22, 24 (minimum + target)
- Cross-platform path tests run on both OSes from day one
- Bundle integrity tests: create bundle on one OS, validate on the other
```

### GitHub Actions Workflow Structure

```yaml
name: CI

on:
  push:
    branches: ['**']
  pull_request:
    branches: ['**']

jobs:
  ci:
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
        node-version: [22, 24]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm -r test
```

Key decisions:
- `fail-fast: false` — run all matrix combinations even if one fails, to see the full picture
- `pnpm/action-setup@v4` — auto-detects pnpm version from `package.json` `packageManager` field or `.npmrc`
- `actions/setup-node@v4` — `cache: 'pnpm'` caches `~/.pnpm-store` for faster installs
- `--frozen-lockfile` — ensures CI uses exact lockfile versions, fails if lockfile is outdated
- Root `pnpm build` already handles build order: shared first, then fetcher+server in parallel

### Existing Build/Test Scripts (DO NOT CHANGE)

Root `package.json` already has the correct scripts:
```json
{
  "build": "pnpm --filter @offlinedocs/shared build && pnpm --filter @offlinedocs/fetcher --filter @offlinedocs/server build",
  "test": "vitest run",
  "test:coverage": "vitest run --coverage"
}
```

Per-package test: `pnpm -r test` runs `vitest run` in each package.

### pnpm Setup for GitHub Actions

The project uses pnpm workspaces. Check if `packageManager` field exists in root `package.json`. If not, specify pnpm version in the workflow via `pnpm/action-setup@v4` with a `version` input.

### Cross-Platform Path Testing

`@offlinedocs/shared` exports `normalizeBundlePath()` which converts OS paths to forward-slash format. Tests should verify:

```typescript
import { normalizeBundlePath } from '@offlinedocs/shared';

// Should normalize backslashes on Windows
expect(normalizeBundlePath('docs\\react\\hooks.md')).toBe('docs/react/hooks.md');

// Should preserve forward slashes
expect(normalizeBundlePath('docs/react/hooks.md')).toBe('docs/react/hooks.md');
```

### Cross-Platform Integrity Testing

SHA-256 checksums are computed via Node.js `crypto` module. Content-based hashing is platform-independent, but path separators in file references must be normalized. Test that:

1. `crypto.createHash('sha256').update(content).digest('hex')` produces identical results for identical content regardless of OS
2. Registry `checksums` keys use forward-slash paths (not OS-native paths)
3. `fileCount` matches the actual number of chunk files when paths are normalized

### Existing Code to Leverage

From `@offlinedocs/shared`:
- `normalizeBundlePath(path: string): string` — forward-slash normalization
- `validateBundle(bundlePath: string)` — full validation with checksums and fileCount

### Previous Story Learnings (from Stories 3.1-3.3)

- Co-locate tests with source files (`.test.ts` next to `.ts`)
- Import from `@offlinedocs/shared` for schemas and constants
- Use `import type` for type-only imports
- `.js` extensions in all local imports (ESM requirement)
- Use temp directories with `mkdtemp` for filesystem tests
- All tests in monorepo pass currently: 244 total (38 shared + 127 fetcher + 79 server)

### Files to Create

- `.github/workflows/ci.yml` (NEW)
- `packages/shared/src/cross-platform.test.ts` (NEW)
- `packages/shared/src/cross-platform-integrity.test.ts` (NEW)

### Files to Modify

None — this story only adds new files.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.4]
- [Source: _bmad-output/planning-artifacts/architecture.md#CI/CD]
- [Source: _bmad-output/planning-artifacts/architecture.md#Path Separators]
- [Source: packages/shared/src/bundle-validator.ts — normalizeBundlePath, validateBundle]
- [Source: package.json — build and test scripts]

## Dev Agent Record

### Agent Model Used

Claude Opus 4

### Debug Log References

### Completion Notes List

- Created GitHub Actions CI workflow with 2x2 matrix (ubuntu/windows x Node 22/24)
- fail-fast: false to see full matrix results
- Uses pnpm/action-setup@v4 + actions/setup-node@v4 with pnpm cache
- Build uses root pnpm build (shared first, then fetcher+server parallel)
- Tests use pnpm -r test (runs all package tests)
- 8 new cross-platform path tests verifying normalizeBundlePath, path.posix.join, OS-safe chars, path length
- 5 new cross-platform integrity tests verifying SHA-256 consistency, checksum key format, registry round-trip, fileCount validation
- Full monorepo: 257 tests passing, zero regressions

### File List

- .github/workflows/ci.yml (NEW)
- packages/shared/src/cross-platform.test.ts (NEW)
- packages/shared/src/cross-platform-integrity.test.ts (NEW)
