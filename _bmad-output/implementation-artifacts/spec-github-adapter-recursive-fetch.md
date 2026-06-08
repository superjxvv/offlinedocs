---
title: 'Recursive Doc Fetching with Link Following'
type: 'feature'
created: '2026-06-08'
status: 'done'
baseline_commit: 'a5b303c60927778d97297ab32f647a05028271fe'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The GitHub adapter only fetches `.md` files from the top-level directory — repos with nested structures (MUI, ESLint) or `.mdx` files (Tailwind) fail with `EMPTY_RESPONSE`. The llms-txt adapter fetches the index page but ignores the markdown links listed in it. Both adapters miss linked documentation.

**Approach:** (1) Add optional `maxDepth` and `followLinks` fields to `LibraryConfig`. (2) Extend the GitHub adapter to recursively traverse subdirectories and match `.md`/`.mdx`. (3) Add link-following to both GitHub and llms-txt adapters — extract markdown links from fetched content and fetch linked `.md`/`.mdx` files. (4) Extract shared link-extraction logic into a reusable utility.

## Boundaries & Constraints

**Always:** Detect and skip circular links via a `Set<string>` of fetched URLs/paths. Default `maxDepth` to 20, `followLinks` to `true`. Preserve the `SourceAdapter` interface. Include subdirectory path in GitHub chunk titles for disambiguation.

**Ask First:** Changing the chunk title format in a way that breaks existing bundles.

**Never:** Fetch non-markdown files. Follow links to external domains (outside the repo or source site). Add a markdown parsing dependency — use regex.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| GitHub: nested .md files | Dir with `docs/guides/intro.md` | Chunk titled `guides/intro` | N/A |
| GitHub: .mdx files | Dir with `pages/setup.mdx` | Chunk included | N/A |
| GitHub: circular links | A.md links B.md links A.md | Each fetched once | Skip seen paths |
| GitHub: link outside base path | `[ref](../../README.md)` | Ignored | N/A |
| GitHub: depth > maxDepth | 25-level deep, maxDepth=20 | Stop at 20 | N/A |
| llms-txt: links in index | Index has `- [Guide](https://x.com/guide.md)` | guide.md fetched and added as chunk | N/A |
| llms-txt: linked page links further | guide.md links to advanced.md | advanced.md also fetched | N/A |
| llms-txt: link to non-md URL | `[API](https://x.com/api)` | Ignored (no .md/.mdx extension) | N/A |
| Config: followLinks=false | Set in libraries.toml | No link following, directory traversal only | N/A |
| Config: maxDepth=5 | Set in libraries.toml | GitHub stops at 5 levels | N/A |

</frozen-after-approval>

## Code Map

- `packages/shared/src/schemas/library-config.ts` -- Add optional `maxDepth` and `followLinks` to schema
- `packages/shared/src/schemas/library-config.test.ts` -- Test new optional fields
- `packages/fetcher/src/adapters/link-extractor.ts` -- NEW: shared regex utility to extract relative markdown links
- `packages/fetcher/src/adapters/link-extractor.test.ts` -- NEW: tests for link extraction
- `packages/fetcher/src/adapters/github-adapter.ts` -- Recursive traversal, .mdx support, link following
- `packages/fetcher/src/adapters/github-adapter.test.ts` -- Tests for recursion, .mdx, links
- `packages/fetcher/src/adapters/llms-txt-adapter.ts` -- Follow markdown links from fetched content
- `packages/fetcher/src/adapters/llms-txt-adapter.test.ts` -- Tests for link following

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/schemas/library-config.ts` -- Add `maxDepth: z.number().int().positive().optional()` (default 20) and `followLinks: z.boolean().optional()` (default true) to `LibraryConfigSchema`.
- [x] `packages/shared/src/schemas/library-config.test.ts` -- Add tests for optional fields: present, absent, invalid values.
- [x] `packages/fetcher/src/adapters/link-extractor.ts` -- NEW: export `extractMarkdownLinks(content: string): string[]` using regex `\[([^\]]*)\]\(([^)]+\.mdx?)\)`. Filter out absolute URLs with different origins, fragment-only links, and anchors. Return deduplicated relative paths.
- [x] `packages/fetcher/src/adapters/link-extractor.test.ts` -- NEW: test relative links, absolute URLs filtered, fragments filtered, .mdx links, dedup.
- [x] `packages/fetcher/src/adapters/github-adapter.ts` -- Add `listDirectoryRecursive()` that recurses into `type: 'dir'` entries up to `config.maxDepth ?? 20`. Filter for `.md` and `.mdx`. After fetching content, if `config.followLinks !== false`, extract links, resolve relative to file's directory, filter to paths within base path and not yet fetched, and fetch those too.
- [x] `packages/fetcher/src/adapters/github-adapter.ts` -- Update chunk titles to `{relativePath}/{name}` format (strip base path prefix and extension).
- [x] `packages/fetcher/src/adapters/github-adapter.test.ts` -- Add tests: recursive traversal, .mdx, link following, circular protection, depth limit, followLinks=false.
- [x] `packages/fetcher/src/adapters/llms-txt-adapter.ts` -- After initial fetch, if `config.followLinks !== false`, extract markdown links from content. For each link that is an absolute URL ending in `.md`/`.mdx` on the same origin as `sourceUrl`, fetch it and add as a chunk. Track fetched URLs to prevent cycles. Recurse on newly fetched content up to `config.maxDepth ?? 20` levels.
- [x] `packages/fetcher/src/adapters/llms-txt-adapter.test.ts` -- Add tests: link following from llms.txt content, same-origin filtering, cycle prevention, followLinks=false, maxDepth respected.
- [x] `packages/fetcher/src/adapters/index.ts` -- Export `link-extractor` if needed by external consumers.

**Acceptance Criteria:**
- Given a GitHub config pointing to nested subdirectories with `.md`/`.mdx` files, when `fetch()` is called, then chunks for all levels are returned.
- Given an llms-txt source with markdown links to `.md` pages, when `fetch()` is called, then linked pages are fetched and included as chunks.
- Given circular links in either adapter, when `fetch()` is called, then each resource is fetched exactly once.
- Given `followLinks: false` in config, when `fetch()` is called, then no links are followed (GitHub still recurses directories).
- Given `maxDepth: 5` in config, when `fetch()` is called, then traversal/following stops at 5 levels.
- Given all existing tests, when the test suite runs, then no regressions occur.

## Design Notes

**Link extraction regex:** `\[([^\]]*)\]\(([^)]+\.mdx?)\)` — captures markdown links to `.md`/`.mdx` files. For GitHub: resolve as relative paths. For llms-txt: resolve as absolute URLs, filter to same origin as `sourceUrl`.

**GitHub chunk titles:** `{relativePath}/{filename}` stripped of base path and extension. E.g. base=`docs/`, file=`docs/guides/setup.md` → title=`guides/setup`. Top-level files keep current format.

**llms-txt link following:** The llms.txt format lists links like `- [Title](https://example.com/page.md)`. After fetching the index, extract these URLs, fetch each, and split into chunks. Each linked page's content may contain further links — follow recursively up to maxDepth.

## Verification

**Commands:**
- `cd /workspace && npm test` -- expected: all tests pass including new tests
- `npx offlinedocs-fetch fetch --config libraries.toml` -- expected: GitHub sources that previously failed now return chunks; llms-txt sources return more chunks from followed links

## Suggested Review Order

**Schema & shared utilities**

- New optional config fields that drive all behavior
  [`library-config.ts:8`](../../packages/shared/src/schemas/library-config.ts#L8)

- Shared link extraction regex — single source of truth for both adapters
  [`link-extractor.ts:7`](../../packages/fetcher/src/adapters/link-extractor.ts#L7)

- Path resolution helpers used by GitHub adapter link following
  [`link-extractor.ts:47`](../../packages/fetcher/src/adapters/link-extractor.ts#L47)

**GitHub adapter — recursive traversal & link following**

- Entry point: new recursive listing + link following orchestration
  [`github-adapter.ts:78`](../../packages/fetcher/src/adapters/github-adapter.ts#L78)

- Recursive directory walker — depth-limited BFS over GitHub Contents API
  [`github-adapter.ts:152`](../../packages/fetcher/src/adapters/github-adapter.ts#L152)

- Link following BFS with cycle detection via file path map
  [`github-adapter.ts:192`](../../packages/fetcher/src/adapters/github-adapter.ts#L192)

- Chunk title includes subdirectory path for disambiguation
  [`github-adapter.ts:143`](../../packages/fetcher/src/adapters/github-adapter.ts#L143)

**llms-txt adapter — link following**

- Same-origin link following with depth tracking
  [`llms-txt-adapter.ts:74`](../../packages/fetcher/src/adapters/llms-txt-adapter.ts#L74)

**Tests**

- GitHub: recursion, .mdx, links, cycles, depth, followLinks=false
  [`github-adapter.test.ts:195`](../../packages/fetcher/src/adapters/github-adapter.test.ts#L195)

- llms-txt: link following, same-origin, cycles, config options
  [`llms-txt-adapter.test.ts:97`](../../packages/fetcher/src/adapters/llms-txt-adapter.test.ts#L97)

- Link extractor unit tests
  [`link-extractor.test.ts:1`](../../packages/fetcher/src/adapters/link-extractor.test.ts#L1)

- Schema: optional maxDepth/followLinks validation
  [`library-config.test.ts:58`](../../packages/shared/src/schemas/library-config.test.ts#L58)
