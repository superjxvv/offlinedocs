import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { LoadedChunk } from '../chunk-loader.js';

import { buildIndex, tokenize } from './inverted-index.js';

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

describe('tokenize', () => {
  it('splits on whitespace and lowercases', () => {
    const tokens = tokenize('Hello World');
    expect(tokens).toContain('hello');
    expect(tokens).toContain('world');
  });

  it('splits on punctuation', () => {
    const tokens = tokenize('foo.bar,baz;qux');
    expect(tokens).toContain('foo');
    expect(tokens).toContain('bar');
    expect(tokens).toContain('baz');
    expect(tokens).toContain('qux');
  });

  it('deduplicates tokens', () => {
    const tokens = tokenize('hello hello hello');
    expect(tokens).toEqual(['hello']);
  });

  it('filters empty strings', () => {
    const tokens = tokenize('  spaced   out  ');
    expect(tokens).not.toContain('');
    expect(tokens).toContain('spaced');
    expect(tokens).toContain('out');
  });
});

describe('buildIndex', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('indexes topics, title, and body fields', () => {
    const chunks = [makeChunk()];
    const index = buildIndex(chunks);

    // 'hooks' should appear in topics and body
    const hooksPostings = index.invertedIndex.get('hooks');
    expect(hooksPostings).toBeDefined();
    const fields = hooksPostings!.map((p) => p.field);
    expect(fields).toContain('topics');
    expect(fields).toContain('body');

    // 'react' should appear in title and body
    const reactPostings = index.invertedIndex.get('react');
    expect(reactPostings).toBeDefined();
    const reactFields = reactPostings!.map((p) => p.field);
    expect(reactFields).toContain('title');
    expect(reactFields).toContain('body');
  });

  it('stores chunk metadata in indexed chunks', () => {
    const chunks = [makeChunk({ libraryId: 'vue', title: 'Router' })];
    const index = buildIndex(chunks);

    expect(index.chunks).toHaveLength(1);
    expect(index.chunks[0]!.libraryId).toBe('vue');
    expect(index.chunks[0]!.title).toBe('Router');
  });

  it('indexes multiple chunks from different libraries', () => {
    const chunks = [
      makeChunk({ libraryId: 'react', filename: 'hooks.md', topics: ['hooks'] }),
      makeChunk({ libraryId: 'vue', filename: 'router.md', topics: ['router'], title: 'Vue Router', content: 'Vue router docs.' }),
    ];
    const index = buildIndex(chunks);

    expect(index.chunks).toHaveLength(2);

    const routerPostings = index.invertedIndex.get('router');
    expect(routerPostings).toBeDefined();
    // router should be in vue's topics, title, and body
    const vuePostings = routerPostings!.filter((p) => p.chunkIndex === 1);
    expect(vuePostings.length).toBeGreaterThanOrEqual(1);
  });

  it('strips code blocks from body before indexing', () => {
    const chunks = [
      makeChunk({
        content: 'Use hooks.\n```js\nconst secretVar = true;\n```\nMore text.',
      }),
    ];
    const index = buildIndex(chunks);

    // 'secretvar' from code block should NOT be indexed
    expect(index.invertedIndex.has('secretvar')).toBe(false);
    // 'hooks' from body text should be indexed
    expect(index.invertedIndex.has('hooks')).toBe(true);
  });

  it('strips URLs from body before indexing', () => {
    const chunks = [
      makeChunk({
        content: 'Visit https://example.com/api/v2 for docs. Use the API.',
      }),
    ];
    const index = buildIndex(chunks);

    // URL parts should not be indexed
    expect(index.invertedIndex.has('https')).toBe(false);
    expect(index.invertedIndex.has('example')).toBe(false);
    // Regular words should be indexed
    expect(index.invertedIndex.has('api')).toBe(true);
    expect(index.invertedIndex.has('docs')).toBe(true);
  });

  it('logs index build duration to stderr', () => {
    buildIndex([makeChunk()]);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('Search index built: 1 chunks in'),
    );
  });

  it('handles empty chunk array', () => {
    const index = buildIndex([]);
    expect(index.chunks).toHaveLength(0);
    expect(index.invertedIndex.size).toBe(0);
  });

  it('builds index for many chunks within performance budget', () => {
    // Generate ~1000 synthetic chunks
    const chunks: LoadedChunk[] = [];
    for (let i = 0; i < 1000; i++) {
      chunks.push(
        makeChunk({
          libraryId: `lib-${i % 50}`,
          filename: `doc-${i}.md`,
          title: `Document ${i} about topic ${i % 10}`,
          topics: [`topic-${i % 20}`, `category-${i % 5}`],
          content: `This is document ${i} with content about feature ${i % 30} and concept ${i % 15}. `.repeat(10),
          byteSize: 500,
        }),
      );
    }

    const start = performance.now();
    const index = buildIndex(chunks);
    const duration = performance.now() - start;

    expect(index.chunks).toHaveLength(1000);
    expect(duration).toBeLessThan(2000); // Well within 1s budget, allow 2s for slow CI
  });
});
