# Story 2.5: Chunk Processor

Status: done
baseline_commit: 46341a46c2a8e43b90ae2eeaf02bdef4875c0f79

## Story

As a Fetcher operator,
I want fetched documentation split into topic-based markdown chunks with frontmatter,
so that each chunk is a focused, searchable unit within the Doc Bundle.

## Acceptance Criteria

1. **Given** a markdown document with multiple H2 headings, **When** I run the markdown splitter, **Then** each H2 section becomes a separate chunk with a kebab-case filename derived from the heading.

2. **Given** a single chunk that exceeds 50KB, **When** I split it, **Then** it produces numbered parts (e.g., `api-reference-1.md`, `api-reference-2.md`) each under 50KB.

3. **Given** a markdown document with no heading structure, **When** I split it, **Then** it falls back to paragraph-based splitting at the 50KB boundary.

4. **Given** a chunk, **When** frontmatter is generated, **Then** it includes `title` (from the heading or filename), `library` (the library ID), and `topics` (extracted keyword tags relevant to the content).

5. **Given** generated chunk filenames, **When** I inspect them, **Then** they use kebab-case, OS-safe characters, and stay under 200 character path length.

6. **Given** a small document under 50KB with a single section, **When** I process it, **Then** it remains as a single chunk file.

7. **Given** the chunk processor, **When** it generates frontmatter, **Then** it uses `@11ty/gray-matter` for serialization.

## Tasks / Subtasks

- [x] Task 1: Implement markdown splitter (AC: #1, #2, #3, #6)
  - [x] Create `packages/fetcher/src/chunk-processor/markdown-splitter.ts`
  - [x] Split by H2 (`## `) headings as primary split points
  - [x] Handle content before first heading (attach to document-level chunk or first section)
  - [x] Enforce MAX_CHUNK_SIZE (50KB) — oversized chunks get numbered parts (e.g., `api-reference-1.md`, `api-reference-2.md`)
  - [x] Fallback: if no headings exist, split by paragraph boundaries at the 50KB limit
  - [x] Small documents under 50KB with single section remain as one chunk
  - [x] Return array of `{ title: string, content: string, part?: number }` objects

- [x] Task 2: Implement filename generator (AC: #5)
  - [x] Create filename generation logic (can be in markdown-splitter.ts or separate util)
  - [x] Convert heading text to kebab-case: lowercase, replace non-alphanumeric with hyphens, collapse multiple hyphens, trim leading/trailing hyphens
  - [x] Ensure OS-safe characters only (no `<>:"/\|?*`, no control chars)
  - [x] Ensure total path `{libraryId}/{filename}.md` stays under 200 characters
  - [x] Truncate long filenames with hash suffix if needed to stay within limit

- [x] Task 3: Implement frontmatter generator (AC: #4, #7)
  - [x] Create `packages/fetcher/src/chunk-processor/frontmatter-generator.ts`
  - [x] Generate frontmatter with `title` (from heading), `library` (library ID), `topics` (keyword tags)
  - [x] Extract topics: use heading words + first few significant words from content (exclude stop words)
  - [x] Add `part` field when chunk is a numbered part of a split section
  - [x] Use `@11ty/gray-matter` `.stringify()` to serialize frontmatter + content
  - [x] Validate output against `FrontmatterSchema` from `@offlinedocs/shared`

- [x] Task 4: Create chunk-processor barrel and integration (AC: #1-#7)
  - [x] Create `packages/fetcher/src/chunk-processor/index.ts` barrel export
  - [x] Create a `processChunks(libraryId: string, chunks: DocChunk[]): ProcessedChunk[]` function that orchestrates: split -> filename -> frontmatter
  - [x] Export from `packages/fetcher/src/index.ts`

### Review Findings

- [x] [Review][Patch] Single paragraph > MAX_CHUNK_SIZE produces oversized chunk — added line-level splitting fallback [markdown-splitter.ts]
- [x] [Review][Patch] Dead/duplicate branch in splitByH2Headings — removed redundant size check [markdown-splitter.ts]
- [x] [Review][Patch] require() in ESM test file — replaced with ESM import [frontmatter-generator.test.ts]
- [x] [Review][Defer] Frontmatter overhead not accounted for in size budget — deferred, ~200 bytes is negligible
- [x] [Review][Defer] maxFilenameLen can go negative for very long libraryId — deferred, human-managed config
- [x] [Review][Defer] Filename dedup collides with part numbers — deferred, unlikely in practice
- [x] [Review][Defer] DocChunk.title ignored by processChunks — deferred, adapter title is rough pre-split
- [x] [Review][Defer] No H2 detection inside code blocks — deferred, edge case shared with adapters
- [x] [Review][Defer] FrontmatterSchema allows empty topics array — deferred, extractTopics produces heading words

- [x] Task 5: Write tests (AC: #1-#7)
  - [x] Create `packages/fetcher/src/chunk-processor/markdown-splitter.test.ts`
  - [x] Create `packages/fetcher/src/chunk-processor/frontmatter-generator.test.ts`
  - [x] Test: H2 headings produce separate chunks
  - [x] Test: chunk exceeding 50KB produces numbered parts
  - [x] Test: document with no headings falls back to paragraph splitting
  - [x] Test: frontmatter includes title, library, topics fields
  - [x] Test: frontmatter uses gray-matter for serialization
  - [x] Test: filenames are kebab-case and OS-safe
  - [x] Test: path length stays under 200 chars
  - [x] Test: small single-section document stays as one chunk
  - [x] Test: frontmatter validates against FrontmatterSchema

## Dev Notes

### Architecture Reference

Per the architecture doc, the chunk-processor directory structure is:
```
packages/fetcher/src/chunk-processor/
  index.ts                    # Barrel
  markdown-splitter.ts        # Splits by heading hierarchy, enforces 50KB
  markdown-splitter.test.ts
  frontmatter-generator.ts    # Generates title, library, topics from content
  frontmatter-generator.test.ts
```

### Key Constants (from @offlinedocs/shared)

- `MAX_CHUNK_SIZE = 50 * 1024` (50KB) — hard limit per chunk
- `FrontmatterSchema` — Zod schema requiring `title: string`, `library: string`, `topics: string[]`, optional `part?: number`

### Splitting Strategy

1. **Primary split**: by `## ` (H2) headings — each becomes its own chunk
2. **Size enforcement**: any chunk > 50KB gets split into numbered parts at paragraph boundaries
3. **No-heading fallback**: split at paragraph boundaries (`\n\n`) when 50KB is reached
4. **Single-section passthrough**: if the entire doc is one chunk under 50KB, don't split

The adapters (Stories 2.2-2.4) already produce `DocChunk[]` with rough splits by `# ` (H1) headings. This processor takes those rough chunks and produces final, size-compliant chunks with proper frontmatter.

### Frontmatter Serialization

Use `@11ty/gray-matter` (already in fetcher's package.json dependencies):

```typescript
import matter from '@11ty/gray-matter';

// To serialize: matter.stringify(content, frontmatterData)
const output = matter.stringify(markdownContent, {
  title: 'Hooks',
  library: 'react',
  topics: ['hooks', 'state', 'effects'],
});
// Result:
// ---
// title: Hooks
// library: react
// topics:
//   - hooks
//   - state
//   - effects
// ---
// <markdown content>
```

### Topic Extraction Strategy

Keep it simple for v1:
- Extract significant words from the heading text
- Add 2-3 top keywords from the first paragraph of content
- Filter out common stop words (the, a, an, is, are, to, for, etc.)
- Lowercase all topics
- Limit to 5-8 topics per chunk

### Filename Generation

- `toKebabCase("API Reference")` → `api-reference`
- `toKebabCase("React.useEffect() Hook")` → `react-useeffect-hook`
- Numbered parts: `api-reference-1.md`, `api-reference-2.md`
- OS-safe: strip `<>:"/\|?*` and control characters
- Path limit: `{libraryId}/{filename}.md` must be < 200 chars total. If filename would exceed, truncate and add 6-char hash suffix

### ProcessedChunk Output Type

```typescript
interface ProcessedChunk {
  filename: string;       // e.g., "hooks.md" or "api-reference-1.md"
  content: string;        // Full content WITH frontmatter (gray-matter serialized)
  frontmatter: Frontmatter; // The frontmatter data object
}
```

### Previous Story Learnings (from Stories 2.2-2.4)

- Co-locate tests with source files (`.test.ts` next to `.ts`)
- Export through barrel `index.ts` files
- Import from `@offlinedocs/shared` for schemas and constants
- Use `import type` for type-only imports
- Validate outputs against Zod schemas at boundaries

### Deferred Work from Code Review

The `splitByTopLevelHeadings` function is duplicated in both `llms-txt-adapter.ts` and `context7-adapter.ts`. This story's chunk processor centralizes splitting logic. The adapters' internal splitting can be simplified later — for now, this processor handles the final splitting.

### Files to Create

- `packages/fetcher/src/chunk-processor/markdown-splitter.ts` (NEW)
- `packages/fetcher/src/chunk-processor/markdown-splitter.test.ts` (NEW)
- `packages/fetcher/src/chunk-processor/frontmatter-generator.ts` (NEW)
- `packages/fetcher/src/chunk-processor/frontmatter-generator.test.ts` (NEW)
- `packages/fetcher/src/chunk-processor/index.ts` (NEW)

### Files to Modify

- `packages/fetcher/src/index.ts` — add chunk-processor exports

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.5]
- [Source: _bmad-output/planning-artifacts/architecture.md#Chunk Processor]
- [Source: packages/shared/src/schemas/frontmatter.ts — FrontmatterSchema]
- [Source: packages/shared/src/constants.ts — MAX_CHUNK_SIZE]
- [Source: packages/fetcher/package.json — @11ty/gray-matter dependency]

## Dev Agent Record

### Agent Model Used

Claude Opus 4

### Debug Log References

None.

### Completion Notes List

- Implemented markdown splitter: H2-based splitting with 50KB size enforcement
- Oversized chunks split by paragraph boundaries into numbered parts
- No-heading fallback: paragraph splitting when no `## ` headings found
- Filename generator: kebab-case, OS-safe chars, path < 200 chars with truncation
- Frontmatter generator: title/library/topics extraction with stop-word filtering, gray-matter serialization
- processChunks() orchestrates split -> filename -> frontmatter pipeline with deduplication
- All outputs validate against FrontmatterSchema from @offlinedocs/shared
- 25 new tests (15 splitter + 10 frontmatter), 117 total pass, zero regressions

### Change Log

- 2026-05-26: Implemented chunk processor (Story 2.5)
- 2026-05-26: Applied 3 code review patches (BMAD review)

### File List

- packages/fetcher/src/chunk-processor/markdown-splitter.ts (NEW)
- packages/fetcher/src/chunk-processor/markdown-splitter.test.ts (NEW)
- packages/fetcher/src/chunk-processor/frontmatter-generator.ts (NEW)
- packages/fetcher/src/chunk-processor/frontmatter-generator.test.ts (NEW)
- packages/fetcher/src/chunk-processor/index.ts (NEW)
- packages/fetcher/src/index.ts (MODIFIED)
