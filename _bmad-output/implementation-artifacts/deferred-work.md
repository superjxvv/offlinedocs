# Deferred Work

## Deferred from: code review of 2-4-context7-source-adapter (2026-05-26)

- ~~404 detection relies on fragile string matching in error message — retry.ts returns status code embedded in error message string; adapter checks `message.includes('404')`. Same pattern in github-adapter. Root fix: add structured `statusCode` field to AdapterError or a dedicated error code.~~ **RESOLVED** — Added `statusCode` field to `AdapterError`; retry.ts and github-adapter `fetchWithHeaders` now pass HTTP status; adapters check `statusCode === 404` instead of string matching.
- ~~`splitByTopLevelHeadings` duplicated verbatim from llms-txt-adapter — extract to shared utility when Story 2.5 chunk processor centralizes splitting logic.~~ **RESOLVED** — Extracted to `chunk-processor/markdown-splitter.ts`; both adapters import from shared location.
- No URL encoding/sanitization of sourceUrl in URL construction — config is trusted input per FR-4; same pattern in github-adapter. **Accepted: trusted input boundary.**
- `validate()` doesn't check `MAX_CHUNK_SIZE` — consistent with other adapters; Story 2.5 chunk processor handles size enforcement. **Accepted: enforced downstream by chunk processor.**

## Deferred from: code review of 2-6-bundle-writer-with-integrity-and-atomic-swap (2026-05-26)

- ~~Path traversal via libraryId/chunk.filename in chunk-writer — callers sanitize via toKebabFilename and LibraryConfigSchema, but writer doesn't validate independently~~ **RESOLVED** — Added `path.resolve()` defense-in-depth check in `chunk-writer.ts`.
- Non-atomic window between rm and rename in bundle-writer — matches story spec; safer rename-old-then-rename-new approach could be future enhancement. **Accepted: single-process CLI, acceptable risk.**
- rename() fails with EXDEV across filesystem boundaries — .tmp is always same parent dir by construction; cross-mount symlinks would break. **Accepted: same-dir by construction.**
- ~~No validation that chunk.filename values are unique in writer — processChunks handles deduplication upstream~~ **RESOLVED** — Chunk processor's `processChunks` deduplicates filenames with counter suffix.
- description hardcoded to empty string in registry-writer — LibraryConfig has no description field yet. **Accepted: no schema field yet.**
- Race condition with concurrent writeBundle calls to same path — CLI runs as single process; no locking needed. **Accepted: single-process CLI.**

## Deferred from: code review of story-2.7 (2026-05-26)

- ~~Swallowed exceptions in `loadExistingRegistry` — silent fallback with no warning on corrupted registry.json or permission errors (fetch-libraries.ts:57-62)~~ **RESOLVED** — Now warns on non-ENOENT errors; ENOENT (first run) silently returns null.
- Non-atomic `rm` + `rename` in `writeBundle` — concurrent runs can lose both old and new bundles (bundle-writer.ts:58-59, pre-existing from story 2.6). **Accepted: single-process CLI (same as 2.6 item).**

## Deferred from: code review of 3-1-registry-loader-and-bundle-startup-validation (2026-05-28)

- ~~No CLI entry point with process.exit for startup failures — Story 3.3 will implement CLI with Commander.js that converts Result errors into process.exit(1) with stderr messages~~ **RESOLVED** — Implemented in Story 3.3 (cli.ts:40-42).
- ~~--skip-integrity CLI flag not implemented — only the programmatic StartupOptions.skipIntegrity exists; Story 3.3 CLI will wire the flag~~ **RESOLVED** — Implemented in Story 3.3 (cli.ts:21).

## Deferred from: code review of story-3.3 (2026-05-28)

- Partial match ranking by name length is suboptimal for short queries (e.g., "re" matches many libraries) — shortest-name heuristic acceptable for v1; consider startsWith preference or Levenshtein distance in future. **Accepted: v1 scope.**
- ~~No graceful shutdown handler on SIGTERM/SIGINT — MCP server doesn't send proper shutdown notification when killed; add process signal handlers post-MVP~~ **RESOLVED** — Added SIGTERM/SIGINT handlers in cli.ts that call `server.close()` before exiting.

## Deferred from: code review of 3-4-ci-pipeline-and-cross-platform-validation (2026-06-08)

- ~~Add path traversal test cases for normalizeBundlePath — path traversal protection exists in bundle-validator.ts but lacks dedicated cross-platform test coverage; security tests belong to story 1.3 scope~~ **RESOLVED** — Tests exist in `shared/src/bundle-validator.test.ts` (lines 160-228).
- AC5: No cross-OS bundle artifact exchange in CI — CI runs each matrix leg independently; no upload/download artifact steps to create bundle on one OS and validate on another. Integrity logic is platform-independent, validated by unit tests on both OSes. Enhancement for future. **Accepted: by design for v1.**

## Deferred from: code review of story-4.1 (2026-06-08)

- ~~Story 3-4 artifact still references pnpm CI workflow — historical implementation doc shows old pnpm-based CI; could cause confusion if used to regenerate CI~~ **RESOLVED** — Added deprecation notice at top of artifact.
- ~~Story 3-5 artifact still references pnpm README commands — historical doc shows old pnpm prerequisites and commands~~ **RESOLVED** — Added deprecation notice at top of artifact.
- ~~Architecture.md references pnpm extensively — pnpm-workspace.yaml in file tree, pnpm workspaces in tech stack, pnpm commands in developer workflow; canonical reference is now stale~~ **RESOLVED** — Added deprecation notice at top of artifact.
- ~~Epics.md references pnpm decisions — planning artifact specifies "pnpm workspaces" as technical decision~~ **RESOLVED** — Added deprecation notice at top of artifact.

## Deferred from: review of recursive-doc-fetching (2026-06-08)

- No cap on total files fetched — large repos (10k+ markdown files) could exhaust API rate limits and memory. Consider adding a `maxFiles` config option.
- Link extraction regex doesn't handle angle-bracket links `[text](<path.md>)`, title attributes `[text](path.md "title")`, or query strings. Uncommon but valid markdown.
- Sequential file fetching — no concurrency for HTTP requests. Bounded `Promise.all` batches would improve throughput for large repos.
