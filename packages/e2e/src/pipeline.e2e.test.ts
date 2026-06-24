/**
 * End-to-end pipeline tests: fetcher writes a bundle, server loads it, MCP tools query it.
 *
 * Adapters are mocked so no real network calls are made. Everything else
 * (chunk processing, bundle writing, integrity checks, search indexing, tool logic)
 * runs against real code.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { ok, err, AdapterError } from '@offlinedocs/shared';
import type { LibraryConfig } from '@offlinedocs/shared';

// ---------------------------------------------------------------------------
// Adapter mocks — relative paths match what fetch-libraries.ts imports so that
// vitest intercepts the same resolved module.
// ---------------------------------------------------------------------------

const mockLlmsFetch = vi.fn();
const mockGitHubFetch = vi.fn();

vi.mock('../../fetcher/src/adapters/llms-txt-adapter.js', () => ({
  LlmsTxtAdapter: vi.fn().mockImplementation(function () {
    return { sourceType: 'llms-txt', fetch: mockLlmsFetch, validate: vi.fn() };
  }),
}));

vi.mock('../../fetcher/src/adapters/github-adapter.js', () => ({
  GitHubAdapter: vi.fn().mockImplementation(function () {
    return { sourceType: 'github', fetch: mockGitHubFetch, validate: vi.fn() };
  }),
}));

vi.mock('../../fetcher/src/adapters/context7-adapter.js', () => ({
  Context7Adapter: vi.fn().mockImplementation(function () {
    return { sourceType: 'context7', fetch: vi.fn(), validate: vi.fn() };
  }),
}));

vi.mock('../../fetcher/src/progress.js', () => ({
  reportStart: vi.fn(),
  reportDone: vi.fn(),
  reportFailed: vi.fn(),
  reportSkipped: vi.fn(),
  reportSummary: vi.fn(),
  formatDuration: vi.fn(() => '0m 0s'),
}));

import { fetchLibraries } from '../../fetcher/src/fetch-libraries.js';
import { startupBundle } from '../../server/src/startup.js';
import { resolveLibraryId } from '../../server/src/tools/resolve-library-id.js';
import { queryDocs } from '../../server/src/tools/query-docs.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<LibraryConfig> = {}): LibraryConfig {
  return {
    id: 'mylib',
    name: 'My Library',
    sourceType: 'llms-txt',
    sourceUrl: 'https://example.com/llms.txt',
    ...overrides,
  };
}

function makeFetchResult(chunks: Array<{ content: string; title: string }>) {
  return ok({
    chunks,
    metadata: { fetchedAt: new Date().toISOString() },
  });
}

const REACT_CHUNKS = [
  {
    title: 'Getting Started',
    content: '# Getting Started\nWelcome to React. Install with npm install react.',
  },
  {
    title: 'Hooks',
    content: '# Hooks\nUse useState and useEffect to manage component state and side effects.',
  },
  {
    title: 'API Reference',
    content: '# API Reference\ncreatElement renders a React element. createRoot mounts the app.',
  },
];

const VUE_CHUNKS = [
  {
    title: 'Introduction',
    content: '# Introduction\nVue is a progressive JavaScript framework for building user interfaces.',
  },
  {
    title: 'Reactivity',
    content: '# Reactivity\nUse ref and reactive to declare reactive state in Vue components.',
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('end-to-end pipeline', () => {
  let bundlePath: string;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    bundlePath = await mkdtemp(path.join(os.tmpdir(), 'e2e-test-'));
    stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(async () => {
    stderrSpy.mockRestore();
    await rm(bundlePath, { recursive: true, force: true });
  });

  it('fetches a library and makes it queryable via MCP tools', async () => {
    mockLlmsFetch.mockResolvedValue(makeFetchResult(REACT_CHUNKS));

    const fetchResult = await fetchLibraries(
      [makeConfig({ id: 'react', name: 'React' })],
      { bundlePath },
    );
    expect(fetchResult.fetched).toBe(1);
    expect(fetchResult.failed).toBe(0);

    const startup = await startupBundle(bundlePath, { skipIntegrity: false });
    expect(startup.ok).toBe(true);
    if (!startup.ok) return;

    const { registry, index } = startup.data;

    // resolve-library-id: exact name match
    const resolved = resolveLibraryId(registry, 'React');
    expect('id' in resolved).toBe(true);
    if (!('id' in resolved)) return;
    expect(resolved.id).toBe('react');
    expect(resolved.name).toBe('React');

    // query-docs: search for hooks-related content
    const hooksResult = queryDocs(registry, index, 'react', 'useState hooks', {
      staleThresholdDays: 9999,
    });
    expect('content' in hooksResult).toBe(true);
    if (!('content' in hooksResult)) return;
    expect(hooksResult.content).toContain('useState');
    expect(hooksResult.libraryId).toBe('react');
  });

  it('indexes multiple libraries and keeps queries isolated', async () => {
    mockLlmsFetch
      .mockResolvedValueOnce(makeFetchResult(REACT_CHUNKS))
      .mockResolvedValueOnce(makeFetchResult(VUE_CHUNKS));

    const fetchResult = await fetchLibraries(
      [
        makeConfig({ id: 'react', name: 'React' }),
        makeConfig({ id: 'vue', name: 'Vue' }),
      ],
      { bundlePath },
    );
    expect(fetchResult.fetched).toBe(2);

    const startup = await startupBundle(bundlePath, { skipIntegrity: false });
    expect(startup.ok).toBe(true);
    if (!startup.ok) return;

    const { registry, index } = startup.data;
    expect(registry.libraries).toHaveLength(2);
    expect(startup.data.chunks.length).toBeGreaterThanOrEqual(5);

    // React query scoped to react library — should not bleed into Vue
    const reactResult = queryDocs(registry, index, 'react', 'useState', {
      staleThresholdDays: 9999,
    });
    expect('content' in reactResult).toBe(true);
    if (!('content' in reactResult)) return;
    expect(reactResult.content).not.toContain('Vue is a progressive');

    // Vue query scoped to vue library — should not return React content
    const vueResult = queryDocs(registry, index, 'vue', 'reactive ref', {
      staleThresholdDays: 9999,
    });
    expect('content' in vueResult).toBe(true);
    if (!('content' in vueResult)) return;
    expect(vueResult.content).not.toContain('createElement');
  });

  it('resolves a library by partial name match', async () => {
    mockLlmsFetch.mockResolvedValue(makeFetchResult(REACT_CHUNKS));
    await fetchLibraries([makeConfig({ id: 'react', name: 'React' })], { bundlePath });

    const startup = await startupBundle(bundlePath, { skipIntegrity: false });
    expect(startup.ok).toBe(true);
    if (!startup.ok) return;

    const result = resolveLibraryId(startup.data.registry, 'rea');
    expect('id' in result).toBe(true);
    if (!('id' in result)) return;
    expect(result.id).toBe('react');
  });

  it('returns LIBRARY_NOT_FOUND for a library that was never fetched', async () => {
    mockLlmsFetch.mockResolvedValue(makeFetchResult(REACT_CHUNKS));
    await fetchLibraries([makeConfig({ id: 'react', name: 'React' })], { bundlePath });

    const startup = await startupBundle(bundlePath, { skipIntegrity: false });
    expect(startup.ok).toBe(true);
    if (!startup.ok) return;

    const result = queryDocs(startup.data.registry, startup.data.index, 'angular', 'components');
    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.code).toBe('LIBRARY_NOT_FOUND');
    expect(result.availableLibraries).toEqual([{ id: 'react', name: 'React' }]);
  });

  it('skips unchanged library on second fetch and bundle remains queryable', async () => {
    mockLlmsFetch.mockResolvedValue(makeFetchResult(REACT_CHUNKS));
    const first = await fetchLibraries(
      [makeConfig({ id: 'react', name: 'React' })],
      { bundlePath },
    );
    expect(first.fetched).toBe(1);

    // Second fetch with identical content — should be skipped
    mockLlmsFetch.mockResolvedValue(makeFetchResult(REACT_CHUNKS));
    const second = await fetchLibraries(
      [makeConfig({ id: 'react', name: 'React' })],
      { bundlePath },
    );
    expect(second.fetched).toBe(0);
    expect(second.skipped).toBe(1);

    // Bundle from first fetch still valid and queryable
    const startup = await startupBundle(bundlePath, { skipIntegrity: false });
    expect(startup.ok).toBe(true);
    if (!startup.ok) return;

    const result = queryDocs(startup.data.registry, startup.data.index, 'react', 'hooks', {
      staleThresholdDays: 9999,
    });
    expect('content' in result).toBe(true);
    if (!('content' in result)) return;
    expect(result.content).toContain('Hooks');
  });

  it('force flag re-fetches updated content and server sees new data', async () => {
    const original = [{ title: 'Intro', content: '# Intro\nOriginal content.' }];
    const updated = [{ title: 'Intro', content: '# Intro\nNew API details added here.' }];

    mockLlmsFetch.mockResolvedValue(makeFetchResult(original));
    await fetchLibraries([makeConfig({ id: 'mylib', name: 'My Library' })], { bundlePath });

    mockLlmsFetch.mockResolvedValue(makeFetchResult(updated));
    const second = await fetchLibraries(
      [makeConfig({ id: 'mylib', name: 'My Library' })],
      { bundlePath, force: true },
    );
    expect(second.fetched).toBe(1);
    expect(second.skipped).toBe(0);

    const startup = await startupBundle(bundlePath, { skipIntegrity: false });
    expect(startup.ok).toBe(true);
    if (!startup.ok) return;

    const result = queryDocs(
      startup.data.registry,
      startup.data.index,
      'mylib',
      'new API details',
      { staleThresholdDays: 9999 },
    );
    expect('content' in result).toBe(true);
    if (!('content' in result)) return;
    expect(result.content).toContain('New API details');
  });

  it('partial adapter failure: failed library absent, successful one queryable', async () => {
    mockLlmsFetch
      .mockResolvedValueOnce(err(new AdapterError('RATE_LIMITED', 'react', 'Rate limited')))
      .mockResolvedValueOnce(makeFetchResult(VUE_CHUNKS));

    const fetchResult = await fetchLibraries(
      [
        makeConfig({ id: 'react', name: 'React' }),
        makeConfig({ id: 'vue', name: 'Vue' }),
      ],
      { bundlePath },
    );
    expect(fetchResult.fetched).toBe(1);
    expect(fetchResult.failed).toBe(1);

    const startup = await startupBundle(bundlePath, { skipIntegrity: false });
    expect(startup.ok).toBe(true);
    if (!startup.ok) return;

    const { registry, index } = startup.data;
    expect(registry.libraries).toHaveLength(1);
    expect(registry.libraries[0]!.id).toBe('vue');

    const vueResult = queryDocs(registry, index, 'vue', 'reactive state', {
      staleThresholdDays: 9999,
    });
    expect('content' in vueResult).toBe(true);

    const reactResult = queryDocs(registry, index, 'react', 'hooks');
    expect('error' in reactResult).toBe(true);
    if (!('error' in reactResult)) return;
    expect(reactResult.code).toBe('LIBRARY_NOT_FOUND');
  });

  it('all adapters fail: no bundle is written and server startup fails', async () => {
    mockLlmsFetch
      .mockResolvedValueOnce(err(new AdapterError('NETWORK', 'react', 'Network error')))
      .mockResolvedValueOnce(err(new AdapterError('NETWORK', 'vue', 'Network error')));

    const fetchResult = await fetchLibraries(
      [
        makeConfig({ id: 'react', name: 'React' }),
        makeConfig({ id: 'vue', name: 'Vue' }),
      ],
      { bundlePath },
    );
    expect(fetchResult.fetched).toBe(0);
    expect(fetchResult.failed).toBe(2);

    // writeBundle was never called — registry.json doesn't exist
    const startup = await startupBundle(bundlePath, { skipIntegrity: false });
    expect(startup.ok).toBe(false);
    if (startup.ok) return;
    expect(startup.error.message).toMatch(/registry\.json not found/i);
  });

  it('changed content on second fetch triggers re-fetch without --force', async () => {
    const original = [{ title: 'Intro', content: '# Intro\nOriginal content here.' }];
    const changed = [{ title: 'Intro', content: '# Intro\nCompletely different content now.' }];

    mockLlmsFetch.mockResolvedValue(makeFetchResult(original));
    const first = await fetchLibraries(
      [makeConfig({ id: 'mylib', name: 'My Library' })],
      { bundlePath },
    );
    expect(first.fetched).toBe(1);

    // Different hash → should re-fetch even without --force
    mockLlmsFetch.mockResolvedValue(makeFetchResult(changed));
    const second = await fetchLibraries(
      [makeConfig({ id: 'mylib', name: 'My Library' })],
      { bundlePath },
    );
    expect(second.fetched).toBe(1);
    expect(second.skipped).toBe(0);

    const startup = await startupBundle(bundlePath, { skipIntegrity: false });
    expect(startup.ok).toBe(true);
    if (!startup.ok) return;

    const result = queryDocs(
      startup.data.registry,
      startup.data.index,
      'mylib',
      'completely different',
      { staleThresholdDays: 9999 },
    );
    expect('content' in result).toBe(true);
    if (!('content' in result)) return;
    expect(result.content).toContain('Completely different');
    expect(result.content).not.toContain('Original content');
  });

  it('queryDocs result includes correct chunk metadata fields', async () => {
    mockLlmsFetch.mockResolvedValue(makeFetchResult(REACT_CHUNKS));
    await fetchLibraries([makeConfig({ id: 'react', name: 'React' })], { bundlePath });

    const startup = await startupBundle(bundlePath, { skipIntegrity: false });
    expect(startup.ok).toBe(true);
    if (!startup.ok) return;

    const result = queryDocs(startup.data.registry, startup.data.index, 'react', 'hooks', {
      staleThresholdDays: 9999,
    });
    expect('content' in result).toBe(true);
    if (!('content' in result)) return;

    expect(result.chunks.length).toBeGreaterThan(0);
    const top = result.chunks[0]!;
    expect(top.title).toBeTruthy();
    expect(top.file).toMatch(/\.md$/);
    expect(top.score).toBeGreaterThan(0);
    expect(top.byteSize).toBeGreaterThan(0);
    expect(result.truncated).toBe(false);
    expect(result.query).toBe('hooks');
    expect(result.libraryId).toBe('react');
    expect(result.tokenCount).toBeGreaterThan(0);
  });

  it('queryDocs falls back to getting-started chunk when query has no matches', async () => {
    // splitMarkdown splits on H2 (##), so use H2 headings to get meaningful filenames.
    // "## Getting Started" → getting-started.md, which the fallback chain looks for.
    const chunks = [
      {
        title: 'My Library Docs',
        content: '## Getting Started\nWelcome to the library. Basic setup here.\n\n## Advanced\nAdvanced configuration options.',
      },
    ];
    mockLlmsFetch.mockResolvedValue(makeFetchResult(chunks));
    await fetchLibraries([makeConfig({ id: 'mylib', name: 'My Library' })], { bundlePath });

    const startup = await startupBundle(bundlePath, { skipIntegrity: false });
    expect(startup.ok).toBe(true);
    if (!startup.ok) return;

    // Sanity: verify the chunk was named correctly by the processor
    expect(startup.data.chunks.find((c) => c.filename === 'getting-started.md')).toBeDefined();

    // A query with no matching tokens triggers the getting-started fallback
    const result = queryDocs(
      startup.data.registry,
      startup.data.index,
      'mylib',
      'xyznonexistentterm',
      { staleThresholdDays: 9999 },
    );
    expect('content' in result).toBe(true);
    if (!('content' in result)) return;
    expect(result.chunks[0]?.file).toBe('getting-started.md');
    expect(result.content).toContain('Getting Started');
    expect(result.chunks[0]?.score).toBe(0);
  });

  it('startup fails when a chunk file has been tampered with', async () => {
    mockLlmsFetch.mockResolvedValue(makeFetchResult(REACT_CHUNKS));
    await fetchLibraries([makeConfig({ id: 'react', name: 'React' })], { bundlePath });

    const chunkFiles = await readdir(path.join(bundlePath, 'react'));
    await writeFile(path.join(bundlePath, 'react', chunkFiles[0]!), 'tampered content');

    const startup = await startupBundle(bundlePath, { skipIntegrity: false });
    expect(startup.ok).toBe(false);
    if (startup.ok) return;
    expect(startup.error.message).toMatch(/checksum mismatch/i);
  });
});
