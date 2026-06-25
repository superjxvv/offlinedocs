import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { Registry } from '@offlinedocs/shared';

import type { SearchIndex, IndexedChunk } from '../search/index.js';
import { buildIndex } from '../search/index.js';
import type { LoadedChunk } from '../chunk-loader.js';
import { queryDocs } from './query-docs.js';
import type { QueryDocsResponse, QueryDocsError } from './query-docs.js';

function makeRegistry(
  libs: Partial<Registry['libraries'][number]>[],
): Registry {
  return {
    bundleFormatVersion: 1,
    fileCount: 0,
    generatedAt: '2026-05-01T00:00:00.000Z',
    libraries: libs.map((lib, i) => ({
      id: lib.id ?? `lib-${i}`,
      name: lib.name ?? `Library ${i}`,
      description: lib.description ?? 'A library description',
      sourceType: 'llms-txt' as const,
      sourceUrl: 'https://example.com',
      lastFetched: lib.lastFetched ?? new Date().toISOString(),
      contentHash: 'abc123',
      chunkCount: 1,
      checksums: {},
      ...lib,
    })),
  };
}

function makeChunks(chunks: Partial<LoadedChunk>[]): LoadedChunk[] {
  return chunks.map((c, i) => ({
    libraryId: c.libraryId ?? 'react',
    filename: c.filename ?? `chunk-${i}.md`,
    title: c.title ?? `Chunk ${i}`,
    topics: c.topics ?? [],
    content: c.content ?? `Content for chunk ${i}`,
    byteSize: c.byteSize ?? 100,
  }));
}

describe('queryDocs', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('returns full response shape with libraryId and query fields', () => {
    const registry = makeRegistry([
      { id: 'react', name: 'React', description: 'React library' },
    ]);
    const chunks = makeChunks([
      {
        libraryId: 'react',
        filename: 'hooks.md',
        title: 'React Hooks',
        topics: ['hooks', 'useEffect'],
        content: 'Hooks are a way to use state in function components',
        byteSize: 200,
      },
    ]);
    const index = buildIndex(chunks);

    const result = queryDocs(registry, index, 'react', 'hooks') as QueryDocsResponse;

    expect(result.libraryId).toBe('react');
    expect(result.query).toBe('hooks');
    expect(result.content).toContain('Hooks');
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks[0]!.title).toBe('React Hooks');
    expect(result.chunks[0]!.file).toBe('hooks.md');
    expect(result.chunks[0]!.score).toBeGreaterThan(0);
    expect(result.chunks[0]!.byteSize).toBe(200);
    expect(typeof result.truncated).toBe('boolean');
    expect(typeof result.tokenCount).toBe('number');
  });

  it('returns LIBRARY_NOT_FOUND when libraryId is not in registry', () => {
    const registry = makeRegistry([
      { id: 'react', name: 'React', description: 'React library' },
    ]);
    const index = buildIndex([]);

    const result = queryDocs(registry, index, 'angular', 'hooks') as QueryDocsError;

    expect(result.error).toBe('Library not found: angular');
    expect(result.code).toBe('LIBRARY_NOT_FOUND');
    expect(result.availableLibraries).toEqual([{ id: 'react', name: 'React' }]);
  });

  it('falls back to getting-started.md chunk when no matches', () => {
    const registry = makeRegistry([
      { id: 'react', name: 'React', description: 'React library' },
    ]);
    const chunks = makeChunks([
      {
        libraryId: 'react',
        filename: 'getting-started.md',
        title: 'Getting Started',
        topics: ['intro'],
        content: 'Welcome to React! Get started here.',
        byteSize: 120,
      },
    ]);
    const index = buildIndex(chunks);

    // Query that won't match any chunk content
    const result = queryDocs(registry, index, 'react', 'zzzznonexistent') as QueryDocsResponse;

    expect(result.content).toBe('Welcome to React! Get started here.');
    expect(result.chunks.length).toBe(1);
    expect(result.chunks[0]!.file).toBe('getting-started.md');
    expect(result.chunks[0]!.score).toBe(0);
    expect(result.libraryId).toBe('react');
  });

  it('falls back to library description when no matches and no getting-started', () => {
    const registry = makeRegistry([
      { id: 'react', name: 'React', description: 'A JavaScript library for building UIs' },
    ]);
    const chunks = makeChunks([
      {
        libraryId: 'react',
        filename: 'advanced.md',
        title: 'Advanced Patterns',
        topics: ['patterns'],
        content: 'Advanced usage patterns',
        byteSize: 80,
      },
    ]);
    const index = buildIndex(chunks);

    const result = queryDocs(registry, index, 'react', 'zzzznonexistent') as QueryDocsResponse;

    expect(result.content).toBe('A JavaScript library for building UIs');
    expect(result.chunks).toEqual([]);
    expect(result.libraryId).toBe('react');
  });

  it('prepends staleness warning when library docs are stale', () => {
    // Use a date 60 days ago
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const registry = makeRegistry([
      { id: 'react', name: 'React', description: 'React library', lastFetched: sixtyDaysAgo },
    ]);
    const chunks = makeChunks([
      {
        libraryId: 'react',
        filename: 'hooks.md',
        title: 'Hooks',
        topics: ['hooks'],
        content: 'React hooks content',
        byteSize: 80,
      },
    ]);
    const index = buildIndex(chunks);

    const result = queryDocs(registry, index, 'react', 'hooks') as QueryDocsResponse;

    expect(result.content).toMatch(/^> ⚠️ These docs were fetched \d+ days ago and may be outdated\.\n\n/);
    expect(result.content).toContain('React hooks content');
  });

  it('does not show staleness warning when within threshold', () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const registry = makeRegistry([
      { id: 'react', name: 'React', description: 'React library', lastFetched: fiveDaysAgo },
    ]);
    const chunks = makeChunks([
      {
        libraryId: 'react',
        filename: 'hooks.md',
        title: 'Hooks',
        topics: ['hooks'],
        content: 'React hooks content',
        byteSize: 80,
      },
    ]);
    const index = buildIndex(chunks);

    const result = queryDocs(registry, index, 'react', 'hooks') as QueryDocsResponse;

    expect(result.content).not.toContain('⚠️');
    expect(result.content).toBe('React hooks content');
  });

  it('respects custom staleThresholdDays', () => {
    const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    const registry = makeRegistry([
      { id: 'react', name: 'React', description: 'React library', lastFetched: twentyDaysAgo },
    ]);
    const chunks = makeChunks([
      {
        libraryId: 'react',
        filename: 'hooks.md',
        title: 'Hooks',
        topics: ['hooks'],
        content: 'React hooks content',
        byteSize: 80,
      },
    ]);
    const index = buildIndex(chunks);

    // Default 30 days — not stale
    const fresh = queryDocs(registry, index, 'react', 'hooks') as QueryDocsResponse;
    expect(fresh.content).not.toContain('⚠️');

    // Custom 14 days — stale
    const stale = queryDocs(registry, index, 'react', 'hooks', { staleThresholdDays: 14 }) as QueryDocsResponse;
    expect(stale.content).toMatch(/^> ⚠️/);
  });

  it('passes maxTokens to queryIndex', () => {
    const registry = makeRegistry([
      { id: 'react', name: 'React', description: 'React library' },
    ]);
    const chunks = makeChunks([
      {
        libraryId: 'react',
        filename: 'hooks.md',
        title: 'Hooks',
        topics: ['hooks'],
        content: 'A'.repeat(10000),
        byteSize: 10000,
      },
      {
        libraryId: 'react',
        filename: 'state.md',
        title: 'State',
        topics: ['hooks', 'state'],
        content: 'B'.repeat(10000),
        byteSize: 10000,
      },
    ]);
    const index = buildIndex(chunks);

    // With a small token budget, should limit results
    const result = queryDocs(registry, index, 'react', 'hooks', { maxTokens: 3000 }) as QueryDocsResponse;
    expect(result.chunks.length).toBeGreaterThan(0);
  });

  it('returns getting-started fallback for empty query (tokenizes to no terms)', () => {
    const registry = makeRegistry([
      { id: 'react', name: 'React', description: 'React library' },
    ]);
    const chunks = makeChunks([
      {
        libraryId: 'react',
        filename: 'getting-started.md',
        title: 'Getting Started',
        topics: ['intro'],
        content: 'Welcome to React!',
        byteSize: 60,
      },
      {
        libraryId: 'react',
        filename: 'hooks.md',
        title: 'Hooks',
        topics: ['hooks'],
        content: 'React hooks content',
        byteSize: 80,
      },
    ]);
    const index = buildIndex(chunks);

    // Empty string query tokenizes to [] → no matches → fallback chain
    const result = queryDocs(registry, index, 'react', '   ') as QueryDocsResponse;
    expect(result.content).toBe('Welcome to React!');
    expect(result.chunks[0]!.file).toBe('getting-started.md');
    expect(result.truncated).toBe(false);
  });

  it('prepends staleness warning to getting-started fallback content', () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const registry = makeRegistry([
      { id: 'react', name: 'React', description: 'React library', lastFetched: sixtyDaysAgo },
    ]);
    const chunks = makeChunks([
      {
        libraryId: 'react',
        filename: 'getting-started.md',
        title: 'Getting Started',
        topics: ['intro'],
        content: 'Welcome to React!',
        byteSize: 60,
      },
    ]);
    const index = buildIndex(chunks);

    const result = queryDocs(registry, index, 'react', 'zzzznonexistent') as QueryDocsResponse;
    expect(result.content).toMatch(/^> ⚠️ These docs were fetched \d+ days ago/);
    expect(result.content).toContain('Welcome to React!');
  });

  it('prepends staleness warning to description fallback content', () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const registry = makeRegistry([
      { id: 'react', name: 'React', description: 'A JavaScript library for building UIs', lastFetched: sixtyDaysAgo },
    ]);
    const index = buildIndex([]);

    const result = queryDocs(registry, index, 'react', 'zzzznonexistent') as QueryDocsResponse;
    expect(result.content).toMatch(/^> ⚠️ These docs were fetched \d+ days ago/);
    expect(result.content).toContain('A JavaScript library for building UIs');
  });
});
