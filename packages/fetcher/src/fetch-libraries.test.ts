import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import type { LibraryConfig, Registry } from '@offlinedocs/shared';
import { AdapterError, ok, err, BUNDLE_FORMAT_VERSION } from '@offlinedocs/shared';

import type { FetchResult } from './adapters/types.js';
import { computeContentHash } from './bundle-writer/integrity.js';

// Shared mock fetch functions — every adapter instance uses these
const mockLlmsFetch = vi.fn();
const mockGitHubFetch = vi.fn();
const mockContext7Fetch = vi.fn();

vi.mock('./adapters/llms-txt-adapter.js', () => ({
  LlmsTxtAdapter: vi.fn().mockImplementation(function () {
    return { sourceType: 'llms-txt', fetch: mockLlmsFetch, validate: vi.fn() };
  }),
}));

vi.mock('./adapters/github-adapter.js', () => ({
  GitHubAdapter: vi.fn().mockImplementation(function () {
    return { sourceType: 'github', fetch: mockGitHubFetch, validate: vi.fn() };
  }),
}));

vi.mock('./adapters/context7-adapter.js', () => ({
  Context7Adapter: vi.fn().mockImplementation(function () {
    return { sourceType: 'context7', fetch: mockContext7Fetch, validate: vi.fn() };
  }),
}));

// Suppress stdout during tests
vi.mock('./progress.js', () => ({
  reportStart: vi.fn(),
  reportDone: vi.fn(),
  reportFailed: vi.fn(),
  reportSkipped: vi.fn(),
  reportSummary: vi.fn(),
  formatDuration: vi.fn(() => '0m 1s'),
}));

import * as progress from './progress.js';
import { fetchLibraries } from './fetch-libraries.js';

function makeConfig(overrides: Partial<LibraryConfig> = {}): LibraryConfig {
  return {
    id: 'test-lib',
    name: 'Test Library',
    sourceType: 'llms-txt',
    sourceUrl: 'https://example.com/llms.txt',
    ...overrides,
  };
}

function makeFetchResult(content = '# Test\nSome content'): FetchResult {
  return {
    chunks: [{ content, title: 'Test' }],
    metadata: { fetchedAt: new Date().toISOString() },
  };
}

describe('fetchLibraries', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'fetch-test-'));
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('fetches all libraries and writes bundle', async () => {
    const config = makeConfig();
    const fetchResult = makeFetchResult();
    mockLlmsFetch.mockResolvedValue(ok(fetchResult));

    const bundlePath = path.join(tmpDir, 'bundle');
    const result = await fetchLibraries([config], { bundlePath });

    expect(result.fetched).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    // Verify bundle was written
    const registryContent = await readFile(path.join(bundlePath, 'registry.json'), 'utf-8');
    const registry = JSON.parse(registryContent);
    expect(registry.libraries).toHaveLength(1);
    expect(registry.libraries[0].id).toBe('test-lib');
  });

  it('continues on adapter failure and reports it', async () => {
    const configs = [
      makeConfig({ id: 'lib-a' }),
      makeConfig({ id: 'lib-b' }),
    ];
    const fetchResult = makeFetchResult();
    mockLlmsFetch
      .mockResolvedValueOnce(err(new AdapterError('RATE_LIMITED', 'lib-a', 'Rate limited')))
      .mockResolvedValueOnce(ok(fetchResult));

    const bundlePath = path.join(tmpDir, 'bundle');
    const result = await fetchLibraries(configs, { bundlePath });

    expect(result.fetched).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.code).toBe('RATE_LIMITED');

    expect(progress.reportFailed).toHaveBeenCalledWith(1, 2, 'lib-a', 'RATE_LIMITED');
    expect(progress.reportDone).toHaveBeenCalledWith(2, 2, 'lib-b', expect.any(Number));
  });

  it('skips unchanged libraries when contentHash matches', async () => {
    const config = makeConfig();
    const fetchResult = makeFetchResult('# Test\nSome content');
    const rawContent = fetchResult.chunks.map((c) => c.content).join('\0');
    const contentHash = computeContentHash(rawContent);

    // Create existing bundle with same contentHash
    const bundlePath = path.join(tmpDir, 'bundle');
    await mkdir(path.join(bundlePath, 'test-lib'), { recursive: true });
    await writeFile(
      path.join(bundlePath, 'test-lib', 'test.md'),
      '---\ntitle: Test\nlibrary: test-lib\ntopics: []\n---\n# Test\nSome content',
    );

    const registry: Registry = {
      bundleFormatVersion: BUNDLE_FORMAT_VERSION,
      libraries: [{
        id: 'test-lib',
        name: 'Test Library',
        description: '',
        sourceType: 'llms-txt',
        sourceUrl: 'https://example.com/llms.txt',
        lastFetched: new Date().toISOString(),
        contentHash,
        chunkCount: 1,
        checksums: { 'test-lib/test.md': 'abc123' },
      }],
      fileCount: 1,
      generatedAt: new Date().toISOString(),
    };
    await writeFile(path.join(bundlePath, 'registry.json'), JSON.stringify(registry));

    mockLlmsFetch.mockResolvedValue(ok(fetchResult));

    const result = await fetchLibraries([config], { bundlePath });

    expect(result.fetched).toBe(0);
    expect(result.skipped).toBe(1);
    expect(progress.reportSkipped).toHaveBeenCalledWith(1, 1, 'test-lib');
  });

  it('re-fetches with --force even when contentHash matches', async () => {
    const config = makeConfig();
    const fetchResult = makeFetchResult('# Test\nSome content');
    const rawContent = fetchResult.chunks.map((c) => c.content).join('\0');
    const contentHash = computeContentHash(rawContent);

    // Create existing bundle with same contentHash
    const bundlePath = path.join(tmpDir, 'bundle');
    await mkdir(path.join(bundlePath, 'test-lib'), { recursive: true });

    const registry: Registry = {
      bundleFormatVersion: BUNDLE_FORMAT_VERSION,
      libraries: [{
        id: 'test-lib',
        name: 'Test Library',
        description: '',
        sourceType: 'llms-txt',
        sourceUrl: 'https://example.com/llms.txt',
        lastFetched: new Date().toISOString(),
        contentHash,
        chunkCount: 0,
        checksums: {},
      }],
      fileCount: 0,
      generatedAt: new Date().toISOString(),
    };
    await writeFile(path.join(bundlePath, 'registry.json'), JSON.stringify(registry));

    mockLlmsFetch.mockResolvedValue(ok(fetchResult));

    const result = await fetchLibraries([config], { bundlePath, force: true });

    expect(result.fetched).toBe(1);
    expect(result.skipped).toBe(0);
    expect(progress.reportDone).toHaveBeenCalled();
  });

  it('handles empty config list', async () => {
    const bundlePath = path.join(tmpDir, 'bundle');
    const result = await fetchLibraries([], { bundlePath });

    expect(result.fetched).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(progress.reportSummary).toHaveBeenCalledWith(0, 0, 0, expect.any(Number));
  });

  it('selects github adapter for github sourceType', async () => {
    const config = makeConfig({ sourceType: 'github', sourceUrl: 'owner/repo/docs' });
    const fetchResult = makeFetchResult();
    mockGitHubFetch.mockResolvedValue(ok(fetchResult));

    const bundlePath = path.join(tmpDir, 'bundle');
    const result = await fetchLibraries([config], { bundlePath });

    expect(result.fetched).toBe(1);
    expect(mockGitHubFetch).toHaveBeenCalled();
  });

  it('selects context7 adapter for context7 sourceType', async () => {
    const config = makeConfig({ sourceType: 'context7', sourceUrl: '/org/project' });
    const fetchResult = makeFetchResult();
    mockContext7Fetch.mockResolvedValue(ok(fetchResult));

    const bundlePath = path.join(tmpDir, 'bundle');
    const result = await fetchLibraries([config], { bundlePath });

    expect(result.fetched).toBe(1);
    expect(mockContext7Fetch).toHaveBeenCalled();
  });

  it('reports summary with correct counts', async () => {
    const configs = [
      makeConfig({ id: 'lib-a' }),
      makeConfig({ id: 'lib-b' }),
    ];
    const fetchResult = makeFetchResult();
    mockLlmsFetch
      .mockResolvedValueOnce(ok(fetchResult))
      .mockResolvedValueOnce(err(new AdapterError('NETWORK', 'lib-b', 'Network error')));

    const bundlePath = path.join(tmpDir, 'bundle');
    await fetchLibraries(configs, { bundlePath });

    expect(progress.reportSummary).toHaveBeenCalledWith(1, 1, 0, expect.any(Number));
  });
});
