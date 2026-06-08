import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { LoadedChunk } from '../chunk-loader.js';

import { buildIndex } from './inverted-index.js';
import { queryIndex } from './ranking.js';

function makeChunk(overrides: Partial<LoadedChunk> = {}): LoadedChunk {
  return {
    libraryId: 'react',
    filename: 'hooks.md',
    title: 'React Hooks',
    topics: ['hooks', 'state'],
    content: '# Hooks\nReact hooks let you use state.',
    byteSize: 100,
    ...overrides,
  };
}

function buildTestIndex(chunks: LoadedChunk[]) {
  return buildIndex(chunks);
}

describe('queryIndex', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('scores topics matches at 3 points per term', () => {
    const index = buildTestIndex([
      makeChunk({ topics: ['useeffect', 'cleanup'], content: 'unrelated body text' }),
    ]);

    const result = queryIndex(index, 'react', 'useEffect');
    expect(result.chunks).toHaveLength(1);
    // 'useeffect' matches in topics → 3 pts
    expect(result.chunks[0]!.score).toBe(3);
  });

  it('scores title matches at 2 points per term', () => {
    const index = buildTestIndex([
      makeChunk({ title: 'useEffect Guide', topics: [], content: 'no match here' }),
    ]);

    const result = queryIndex(index, 'react', 'useEffect');
    expect(result.chunks).toHaveLength(1);
    // 'useeffect' matches in title → 2 pts
    expect(result.chunks[0]!.score).toBe(2);
  });

  it('scores body matches at 1 point per term', () => {
    const index = buildTestIndex([
      makeChunk({ title: 'Guide', topics: [], content: 'Learn about useEffect here.' }),
    ]);

    const result = queryIndex(index, 'react', 'useEffect');
    expect(result.chunks).toHaveLength(1);
    // 'useeffect' matches in body → 1 pt
    expect(result.chunks[0]!.score).toBe(1);
  });

  it('accumulates scores across multiple fields', () => {
    const index = buildTestIndex([
      makeChunk({
        title: 'React Hooks',
        topics: ['hooks'],
        content: 'All about hooks and state.',
      }),
    ]);

    const result = queryIndex(index, 'react', 'hooks');
    expect(result.chunks).toHaveLength(1);
    // 'hooks' in topics(3) + title(2) + body(1) = 6
    // Note: 'hooks' appears in title as 'hooks' after tokenization of 'React Hooks'
    expect(result.chunks[0]!.score).toBe(6);
  });

  it('accumulates scores across multiple query terms', () => {
    const index = buildTestIndex([
      makeChunk({
        title: 'Hooks Guide',
        topics: ['hooks', 'state'],
        content: 'About hooks and state management.',
      }),
    ]);

    const result = queryIndex(index, 'react', 'hooks state');
    expect(result.chunks).toHaveLength(1);
    // hooks: topics(3) + title(2) + body(1) = 6
    // state: topics(3) + body(1) = 4
    // total = 10
    expect(result.chunks[0]!.score).toBe(10);
  });

  it('sorts by score descending', () => {
    const index = buildTestIndex([
      makeChunk({ filename: 'low.md', title: 'Other', topics: [], content: 'mentions hooks once.' }),
      makeChunk({ filename: 'high.md', title: 'Hooks Deep Dive', topics: ['hooks'], content: 'Deep hooks content.' }),
    ]);

    const result = queryIndex(index, 'react', 'hooks');
    expect(result.chunks).toHaveLength(2);
    expect(result.chunks[0]!.file).toBe('high.md');
    expect(result.chunks[1]!.file).toBe('low.md');
    expect(result.chunks[0]!.score).toBeGreaterThan(result.chunks[1]!.score);
  });

  it('breaks ties alphabetically by filename', () => {
    const index = buildTestIndex([
      makeChunk({ filename: 'z-doc.md', title: 'Guide', topics: ['hooks'], content: 'content' }),
      makeChunk({ filename: 'a-doc.md', title: 'Guide', topics: ['hooks'], content: 'content' }),
    ]);

    const result = queryIndex(index, 'react', 'hooks');
    expect(result.chunks).toHaveLength(2);
    expect(result.chunks[0]!.score).toBe(result.chunks[1]!.score);
    expect(result.chunks[0]!.file).toBe('a-doc.md');
    expect(result.chunks[1]!.file).toBe('z-doc.md');
  });

  it('expands synonyms: "auth" matches "authentication" and "authorization"', () => {
    const index = buildTestIndex([
      makeChunk({ filename: 'auth.md', topics: ['authentication'], content: 'Auth module.' }),
      makeChunk({ filename: 'authz.md', topics: ['authorization'], content: 'Authz module.' }),
    ]);

    const result = queryIndex(index, 'react', 'auth');
    expect(result.chunks).toHaveLength(2);
    // Both should be found via synonym expansion
    const files = result.chunks.map((c) => c.file).sort();
    expect(files).toEqual(['auth.md', 'authz.md']);
  });

  it('filters to the specified libraryId', () => {
    const index = buildTestIndex([
      makeChunk({ libraryId: 'react', filename: 'hooks.md', topics: ['hooks'] }),
      makeChunk({ libraryId: 'vue', filename: 'hooks.md', topics: ['hooks'] }),
    ]);

    const result = queryIndex(index, 'react', 'hooks');
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]!.file).toBe('hooks.md');
  });

  it('respects maxTokens budget', () => {
    // Each chunk is ~100 bytes ≈ 25 tokens
    const chunks = Array.from({ length: 10 }, (_, i) =>
      makeChunk({
        filename: `doc-${String(i).padStart(2, '0')}.md`,
        topics: ['hooks'],
        content: 'A'.repeat(100),
        byteSize: 100,
      }),
    );
    const index = buildTestIndex(chunks);

    // Budget of 50 tokens = ~2 chunks of 25 tokens each
    const result = queryIndex(index, 'react', 'hooks', 50);
    expect(result.chunks.length).toBe(2);
    expect(result.truncated).toBe(true);
  });

  it('applies top-chunk exception when first chunk exceeds maxTokens', () => {
    const index = buildTestIndex([
      makeChunk({
        filename: 'big.md',
        topics: ['hooks'],
        content: 'A'.repeat(10000),
        byteSize: 10000,
      }),
    ]);

    // maxTokens = 50, but chunk is ~2500 tokens
    const result = queryIndex(index, 'react', 'hooks', 50);
    expect(result.chunks).toHaveLength(1);
    expect(result.truncated).toBe(true);
    expect(result.chunks[0]!.file).toBe('big.md');
  });

  it('returns empty result for empty query', () => {
    const index = buildTestIndex([makeChunk()]);

    const result = queryIndex(index, 'react', '');
    expect(result.chunks).toHaveLength(0);
    expect(result.content).toBe('');
    expect(result.truncated).toBe(false);
    expect(result.tokenCount).toBe(0);
  });

  it('returns empty result when no chunks match', () => {
    const index = buildTestIndex([makeChunk({ topics: ['state'], content: 'state content' })]);

    const result = queryIndex(index, 'react', 'nonexistent');
    expect(result.chunks).toHaveLength(0);
    expect(result.content).toBe('');
  });

  it('concatenates chunk content in response', () => {
    const index = buildTestIndex([
      makeChunk({ filename: 'a.md', topics: ['hooks'], content: 'First chunk.' }),
      makeChunk({ filename: 'b.md', topics: ['hooks'], content: 'Second chunk.' }),
    ]);

    const result = queryIndex(index, 'react', 'hooks');
    expect(result.content).toContain('First chunk.');
    expect(result.content).toContain('Second chunk.');
    expect(result.content).toContain('\n\n'); // separator
  });

  it('returns empty result for empty index', () => {
    const index = buildTestIndex([]);
    const result = queryIndex(index, 'react', 'hooks');
    expect(result.chunks).toHaveLength(0);
    expect(result.content).toBe('');
    expect(result.truncated).toBe(false);
  });

  it('includes tokenCount in response', () => {
    const index = buildTestIndex([
      makeChunk({ topics: ['hooks'], byteSize: 400 }),
    ]);

    const result = queryIndex(index, 'react', 'hooks');
    expect(result.tokenCount).toBe(100); // 400 / 4
  });
});
