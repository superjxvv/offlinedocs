---
baseline_commit: 46341a46c2a8e43b90ae2eeaf02bdef4875c0f79
---

# Story 2.7: Fetcher CLI with Incremental Updates & Progress Reporting

Status: done

## Story

As a Fetcher operator,
I want a CLI tool that fetches docs incrementally with clear progress feedback,
so that I can efficiently update the Doc Bundle and know which libraries succeeded or failed.

## Acceptance Criteria

1. **Given** a valid libraries.toml config, **When** I run `offlinedocs-fetch fetch --config libraries.toml`, **Then** it fetches all configured libraries and writes a Doc Bundle to the default output path.

2. **Given** the --bundle-path flag, **When** I run `offlinedocs-fetch fetch --config libraries.toml --bundle-path ./my-docs`, **Then** the bundle is written to `./my-docs`.

3. **Given** an existing bundle where some libraries haven't changed (contentHash matches), **When** I run fetch without --force, **Then** unchanged libraries are skipped and their existing chunks are preserved.

4. **Given** the --force flag, **When** I run fetch with --force, **Then** all libraries are re-fetched regardless of existing contentHash.

5. **Given** the fetch is running, **When** I observe stdout, **Then** I see per-library progress lines like `[1/50] react ... fetching -> done (23 chunks)`.

6. **Given** a library that fails during fetch, **When** I observe stdout, **Then** I see a line like `[2/50] express ... FAILED (RATE_LIMITED) -- skipped` **And** the fetch continues with remaining libraries (does not abort).

7. **Given** the fetch completes, **When** I observe the summary line, **Then** I see `Fetched: N | Failed: N | Skipped (unchanged): N | Duration: Xm Xs`.

8. **Given** the CLI source code, **When** I inspect cli.ts, **Then** it contains only Commander.js argument parsing that calls library functions exported from index.ts **And** no business logic lives in cli.ts.

## Tasks / Subtasks

- [x] Task 1: Implement progress reporter (AC: #5, #6, #7)
  - [x] Create `packages/fetcher/src/progress.ts`
  - [x] `reportStart(index: number, total: number, libraryId: string): void` — prints `[1/50] react ... fetching`
  - [x] `reportDone(index: number, total: number, libraryId: string, chunkCount: number): void` — prints `[1/50] react ... done (23 chunks)`
  - [x] `reportFailed(index: number, total: number, libraryId: string, errorCode: string): void` — prints `[2/50] express ... FAILED (RATE_LIMITED) -- skipped`
  - [x] `reportSkipped(index: number, total: number, libraryId: string): void` — prints `[3/50] vue ... skipped (unchanged)`
  - [x] `reportSummary(fetched: number, failed: number, skipped: number, durationMs: number): void` — prints `Fetched: N | Failed: N | Skipped (unchanged): N | Duration: Xm Xs`
  - [x] Create `packages/fetcher/src/progress.test.ts`

- [x] Task 2: Implement fetchLibraries orchestrator (AC: #1, #3, #4, #6)
  - [x] Create `packages/fetcher/src/fetch-libraries.ts`
  - [x] `fetchLibraries(configs: LibraryConfig[], options: FetchOptions): Promise<FetchLibrariesResult>`
  - [x] `FetchOptions: { bundlePath: string; force?: boolean }`
  - [x] For each library config: select adapter by `sourceType`, call `adapter.fetch()`, call `processChunks()`, collect `BundleWriteInput`
  - [x] Incremental skip: if existing bundle has a registry.json, read it, compare `contentHash` for each library — skip if unchanged and `!force`
  - [x] For skipped libraries: preserve existing chunks by reading from existing bundle (copy to new bundle input)
  - [x] On adapter failure: log via progress reporter, continue with next library (do not abort)
  - [x] After all libraries: call `writeBundle()` with all results (fetched + preserved)
  - [x] Return `FetchLibrariesResult: { fetched: number; failed: number; skipped: number; errors: AdapterError[] }`
  - [x] Create `packages/fetcher/src/fetch-libraries.test.ts`

- [x] Task 3: Implement CLI with Commander.js (AC: #1, #2, #4, #8)
  - [x] Update `packages/fetcher/src/cli.ts` with Commander.js
  - [x] `fetch` command with options: `--config <path>` (required), `--bundle-path <path>` (default: `./doc-bundle`), `--force`
  - [x] CLI calls `loadConfig()` then `fetchLibraries()` — NO business logic in cli.ts
  - [x] Exit code 0 on success (even with partial failures), exit code 1 on total failure (config error)

- [x] Task 4: Update barrel exports (AC: #1-#8)
  - [x] Update `packages/fetcher/src/index.ts` to export `fetchLibraries` and progress functions

- [x] Task 5: Write integration-level tests (AC: #1-#7)
  - [x] Test: full fetch flow with mock adapters writes valid bundle
  - [x] Test: incremental skip when contentHash matches
  - [x] Test: --force re-fetches despite matching contentHash
  - [x] Test: failed library logged and skipped, fetch continues
  - [x] Test: summary line reports correct counts
  - [x] Test: progress output format matches expected patterns

### Review Findings

- [x] [Review][Decision] AC3: Incremental skip fetches before checking hash — dismissed: contentHash requires fetched content to compute; this is by design per Dev Notes
- [x] [Review][Decision] AC5: Progress line format — dismissed: `\r` overwrite produces equivalent visual result on TTY; spec shows progression, not literal arrow
- [x] [Review][Patch] `program.parse()` → `await program.parseAsync()` — FIXED [cli.ts:41]
- [x] [Review][Patch] `reportSkipped` missing `\r` prefix — FIXED [progress.ts:28]
- [x] [Review][Patch] Unused `formatDuration` import removed — FIXED [fetch-libraries.ts:22]
- [x] [Review][Patch] `preserveLibrary` now parses actual YAML frontmatter from preserved files — FIXED [fetch-libraries.ts:80-81]
- [x] [Review][Patch] `getAdapter` returns null + per-library AdapterError instead of throwing — FIXED [fetch-libraries.ts:46]
- [x] [Review][Defer] Swallowed exceptions in `loadExistingRegistry` — silent fallback with no warning on corrupted registry.json [fetch-libraries.ts:57-62] — deferred, pre-existing pattern
- [x] [Review][Defer] Non-atomic `rm` + `rename` in `writeBundle` — concurrent runs can lose both old and new bundles [bundle-writer.ts:58-59] — deferred, pre-existing from story 2.6

## Dev Notes

### Architecture Reference

Per architecture doc, the fetcher source structure for this story:
```
packages/fetcher/src/
  cli.ts                    # Commander.js entrypoint (thin wrapper, NO business logic)
  index.ts                  # Barrel: all library exports
  fetch-libraries.ts        # Orchestrator: config -> fetch -> process -> write
  fetch-libraries.test.ts
  progress.ts               # Per-library progress reporter (stdout)
  progress.test.ts
```

### CLI Architecture — Thin Wrapper Pattern

**cli.ts MUST be a thin wrapper.** Per architecture: "CLI entrypoint separation — `cli.ts` is only responsible for: arg parsing, calling library functions, formatting output. No business logic in cli.ts."

```typescript
// cli.ts skeleton:
import { Command } from 'commander';
import { loadConfig } from './index.js';
import { fetchLibraries } from './fetch-libraries.js';

const program = new Command();
program
  .name('offlinedocs-fetch')
  .description('Fetch library documentation for offline use');

program
  .command('fetch')
  .requiredOption('--config <path>', 'Path to libraries.toml config')
  .option('--bundle-path <path>', 'Output bundle directory', './doc-bundle')
  .option('--force', 'Re-fetch all libraries regardless of cache', false)
  .action(async (options) => {
    // Load config
    // Call fetchLibraries
    // Exit with appropriate code
  });

program.parse();
```

### Adapter Selection by sourceType

Select adapter based on `config.sourceType`:
```typescript
function getAdapter(sourceType: string): SourceAdapter {
  switch (sourceType) {
    case 'llms-txt': return new LlmsTxtAdapter();
    case 'github': return new GitHubAdapter();
    case 'context7': return new Context7Adapter();
    default: throw new Error(`Unknown sourceType: ${sourceType}`);
  }
}
```

### Incremental Skip Logic

**How contentHash-based incremental updates work:**

1. Before fetching, check if an existing bundle exists at `bundlePath`
2. If it exists, read `registry.json` and build a map: `libraryId -> contentHash`
3. For each library to fetch:
   a. Fetch from source adapter
   b. Compute contentHash of raw fetched content (concatenated with `\0` separator — matches registry-writer.ts)
   c. Compare with existing contentHash from registry
   d. If match AND `!force`: skip this library, preserve existing entry
4. For skipped libraries: read existing chunk files from old bundle and include in new bundle write
5. Call `writeBundle()` with all libraries (fetched + preserved)

**Preserving skipped libraries:** When a library is skipped, its existing `BundleWriteInput` must be reconstructed:
- Read existing chunk files from `{bundlePath}/{libraryId}/` directory
- Reconstruct `ProcessedChunk[]` from the files on disk
- Reconstruct `FetchResult` metadata from the existing registry entry
- Pass to `writeBundle()` alongside freshly fetched libraries

**Alternative simpler approach:** Since `writeBundle` does atomic swap (writes to .tmp then renames), skipped libraries' files need to be copied/included in the new bundle. The simplest approach:
- Read existing chunk files as `ProcessedChunk[]` (filename + content from disk)
- Create a synthetic `FetchResult` with the existing `contentHash` and metadata from registry
- Include in the `BundleWriteInput[]` passed to `writeBundle()`

### Progress Output Format

Per architecture doc, stdout output format:
```
[1/50] react ... fetching -> done (23 chunks)
[2/50] express ... FAILED (RATE_LIMITED) -- skipped
[3/50] vue ... skipped (unchanged)
...
Fetched: 48 | Failed: 1 | Skipped (unchanged): 1 | Duration: 4m 32s
```

Use `process.stdout.write()` or `console.log()` for progress (fetcher uses stdout per architecture logging contract).

### Duration Formatting

Format duration as `Xm Ys` (e.g., `4m 32s`). If under 1 minute, show `0m Xs`. Calculate from `Date.now()` before/after.

### Error Handling Pattern

Per architecture: adapters return `Result<FetchResult>`. The orchestrator uses the Result pattern:
```typescript
const result = await adapter.fetch(config);
if (!result.ok) {
  reportFailed(i, total, config.id, result.error.code);
  errors.push(result.error);
  continue; // do not abort
}
```

### Imports

```typescript
// From @offlinedocs/shared
import type { LibraryConfig, Registry, Result } from '@offlinedocs/shared';
import { AdapterError } from '@offlinedocs/shared';

// From within fetcher
import { loadConfig } from './config/config-loader.js';
import { LlmsTxtAdapter, GitHubAdapter, Context7Adapter } from './adapters/index.js';
import type { SourceAdapter, FetchResult } from './adapters/types.js';
import { processChunks } from './chunk-processor/index.js';
import type { ProcessedChunk } from './chunk-processor/index.js';
import { writeBundle } from './bundle-writer/index.js';
import type { BundleWriteInput } from './bundle-writer/index.js';
import { computeContentHash } from './bundle-writer/index.js';
```

### Testing Approach

**progress.ts tests:** Capture stdout by mocking `console.log` or using a writable stream. Verify output format matches expected patterns.

**fetch-libraries.ts tests:** Mock the adapters to return controlled `Result<FetchResult>` values. Use temp directories for bundle paths. Key scenarios:
- All libraries fetch successfully
- Some libraries fail (verify continuation + error collection)
- Incremental skip when contentHash matches
- Force flag overrides skip logic
- Empty config (no libraries)

**Do NOT test CLI argument parsing in detail** — Commander.js is well-tested. Focus on the orchestrator function.

### Previous Story Learnings (from Stories 2.1-2.6)

- Co-locate tests with source files (`.test.ts` next to `.ts`)
- Export through barrel `index.ts` files
- Import from `@offlinedocs/shared` for schemas and constants
- Use `import type` for type-only imports
- contentHash uses `\0` separator when joining raw chunks (fixed in Story 2.6 review)
- `loadConfig()` returns `Result<LibraryConfig[]>` — handle the error case
- Adapters are classes instantiated per-use: `new LlmsTxtAdapter()`
- `processChunks(libraryId, chunks)` returns `ProcessedChunk[]`
- `writeBundle(bundlePath, BundleWriteInput[])` handles atomic swap

### Files to Create

- `packages/fetcher/src/progress.ts` (NEW)
- `packages/fetcher/src/progress.test.ts` (NEW)
- `packages/fetcher/src/fetch-libraries.ts` (NEW)
- `packages/fetcher/src/fetch-libraries.test.ts` (NEW)

### Files to Modify

- `packages/fetcher/src/cli.ts` (UPDATE — currently a stub, add Commander.js)
- `packages/fetcher/src/index.ts` (UPDATE — add new exports)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.7]
- [Source: _bmad-output/planning-artifacts/architecture.md#Source Adapter Architecture]
- [Source: _bmad-output/planning-artifacts/architecture.md#Progress Reporting]
- [Source: _bmad-output/planning-artifacts/architecture.md#CLI entrypoint separation]
- [Source: packages/fetcher/src/adapters/types.ts — SourceAdapter interface]
- [Source: packages/fetcher/src/config/config-loader.ts — loadConfig]
- [Source: packages/fetcher/src/bundle-writer/bundle-writer.ts — writeBundle, BundleWriteInput]
- [Source: packages/fetcher/src/bundle-writer/registry-writer.ts — contentHash computation]
- [Source: packages/fetcher/src/chunk-processor/index.ts — processChunks]

## Dev Agent Record

### Agent Model Used

Claude Opus 4 (claude-sonnet-4-20250514)

### Debug Log References

No debug sessions required.

### Completion Notes List

- Task 1: Implemented progress reporter (progress.ts) with reportStart, reportDone, reportFailed, reportSkipped, reportSummary, formatDuration. Index padding for aligned output. 10 tests all passing.
- Task 2: Implemented fetchLibraries orchestrator (fetch-libraries.ts) with adapter selection by sourceType, incremental skip via contentHash comparison against existing registry, library preservation for skipped libs, error continuation (no abort on failure), atomic bundle write. 8 tests all passing.
- Task 3: Implemented CLI (cli.ts) with Commander.js — thin wrapper pattern, `fetch` command with `--config`, `--bundle-path`, `--force`. Exit 0 on success/partial, exit 1 on total failure.
- Task 4: Updated barrel exports in index.ts to include fetchLibraries, FetchOptions, FetchLibrariesResult, and all progress functions.
- Task 5: Integration-level tests covered in fetch-libraries.test.ts — full fetch flow, incremental skip, force override, failure continuation, summary counts, adapter selection.
- All 166 tests pass (zero regressions). Build succeeds for both shared and fetcher packages.

### Change Log

- 2026-05-26: Implemented Story 2.7 — Fetcher CLI with incremental updates and progress reporting

### File List

- packages/fetcher/src/progress.ts (NEW)
- packages/fetcher/src/progress.test.ts (NEW)
- packages/fetcher/src/fetch-libraries.ts (NEW)
- packages/fetcher/src/fetch-libraries.test.ts (NEW)
- packages/fetcher/src/cli.ts (MODIFIED)
- packages/fetcher/src/index.ts (MODIFIED)
